/**
 * WhatsApp Bot - Entry Point
 * 
 * Modularized version with improved performance:
 * - Debounced file writes for cooldowns
 * - Cached static resources (QRIS image)
 * - Optimized product detection with regex
 * - Graceful shutdown handler
 */

// ===============================
// CONSOLE LOG FILTER (must be first!)
// Filter out Baileys internal debug messages for cleaner output
// ===============================
const originalConsoleLog = console.log;
const FILTERED_PATTERNS = [
  'Closing session',
  'Closing open session',
  'SessionEntry',
  '_chains',
  'registrationId',
  'currentRatchet',
  'ephemeralKeyPair',
  'indexInfo',
  'pendingPreKey',
  '<Buffer',
  'chainKey',
  'baseKey',
  'rootKey',
  'prekey bundle',
  'chainType',
  'messageKeys',
  'remoteIdentityKey',
];

console.log = function (...args) {
  // Convert all args to string for pattern checking
  const message = args.map(a => {
    if (typeof a === 'string') return a;
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');

  const shouldFilter = FILTERED_PATTERNS.some(pattern => message.includes(pattern));
  if (!shouldFilter) {
    originalConsoleLog.apply(console, args);
  }
};

const qrcode = require("qrcode-terminal");
const { Boom } = require("@hapi/boom");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

// Import modules
const { PATHS } = require("./src/constants");
const { RECONNECT_ENABLED, RECONNECT_BASE_DELAY_MS, RECONNECT_MAX_DELAY_MS } = require("./src/config");
const { logError, setupErrorHandlers } = require("./src/logger");
const { initCache, getCacheBootInfo } = require("./src/cache");
const { forceSaveCooldowns } = require("./src/cooldown");
const { handleMessage } = require("./src/handlers/messageHandler");
const { getProductBootInfo } = require("./src/products");

// ===============================
// BANNER & PROGRESS BAR
// ===============================
const BANNER = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗    ██╗ █████╗     ██████╗  ██████╗ ████████╗        ║
║   ██║    ██║██╔══██╗    ██╔══██╗██╔═══██╗╚══██╔══╝        ║
║   ██║ █╗ ██║███████║    ██████╔╝██║   ██║   ██║           ║
║   ██║███╗██║██╔══██║    ██╔══██╗██║   ██║   ██║           ║
║   ╚███╔███╔╝██║  ██║    ██████╔╝╚██████╔╝   ██║           ║
║    ╚══╝╚══╝ ╚═╝  ╚═╝    ╚═════╝  ╚═════╝    ╚═╝           ║
║                                                           ║
║              WhatsApp Auto Reply Bot v1.0                 ║
║                     by: Achmad                            ║
╚═══════════════════════════════════════════════════════════╝
`;

const GOODBYE_BANNER = `
╔═══════════════════════════════════════════════════════════╗
║                      👋 Goodbye!                          ║
║              Bot stopped at ${new Date().toLocaleTimeString()}                      ║
╚═══════════════════════════════════════════════════════════╝
`;

function printBanner() {
  console.log(BANNER);
}

function progressBar(percent, message) {
  const total = 20;
  const filled = Math.round((percent / 100) * total);
  const empty = total - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  console.log(`[${bar}] ${percent}% - ${message}`);
}

async function showStartupProgress() {
  // Print boot info first
  const productInfo = getProductBootInfo();
  const cacheInfo = getCacheBootInfo();

  console.log(`📦 Loaded ${productInfo.productCount} products (${productInfo.aliasCount} aliases)`);
  console.log(`📷 QRIS image: ${cacheInfo.qrisImage ? 'cached ✓' : 'not found'}`);
  console.log(`📑 QRIS template: ${cacheInfo.qrisTemplate ? 'cached ✓' : 'not found'}`);

  console.log('\n⏳ Memulai bot...\n');

  progressBar(20, 'Loading config...');
  await new Promise(r => setTimeout(r, 300));

  progressBar(40, 'Loading cache...');
  await new Promise(r => setTimeout(r, 300));

  progressBar(60, 'Loading cooldowns...');
  await new Promise(r => setTimeout(r, 300));

  progressBar(80, 'Connecting to WhatsApp...');
}

function printReadyMessage() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 Bot siap menerima pesan...');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Setup global error handlers
setupErrorHandlers();

// Initialize cache (QRIS image, etc.)
initCache();

// Track socket for graceful shutdown
let currentSock = null;

// ===============================
// GRACEFUL SHUTDOWN
// ===============================
async function gracefulShutdown(signal) {
  console.log(`\n⚠️ ${signal} received. Shutting down gracefully...`);
  progressBar(50, 'Saving cooldowns...');

  // Force save cooldowns
  forceSaveCooldowns();
  progressBar(100, 'Done!');
  console.log("✅ Cooldowns saved.");

  // Close socket if connected
  if (currentSock) {
    try {
      await currentSock.end();
      console.log("✅ Socket closed.");
    } catch (e) {
      // Ignore errors during shutdown
    }
  }

  // Print goodbye banner
  const goodbyeBanner = `
╔═══════════════════════════════════════════════════════════╗
║                      👋 Goodbye!                          ║
║              Bot stopped at ${new Date().toLocaleTimeString()}                      ║
╚═══════════════════════════════════════════════════════════╝
`;
  console.log(goodbyeBanner);
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ===============================
// START BOT
// ===============================
async function startBot() {
  // Show banner and progress on first run only
  if (!startBot._started) {
    printBanner();
    await showStartupProgress();
    startBot._started = true;
  }

  const { state, saveCreds } = await useMultiFileAuthState(PATHS.AUTH_INFO);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: { level: 'silent', trace: () => { }, debug: () => { }, info: () => { }, warn: () => { }, error: () => { }, fatal: () => { }, child: () => ({ level: 'silent', trace: () => { }, debug: () => { }, info: () => { }, warn: () => { }, error: () => { }, fatal: () => { } }) },
  });

  currentSock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    const code = lastDisconnect ? new Boom(lastDisconnect.error)?.output?.statusCode : undefined;

    if (qr) {
      console.log("\nScan QR berikut:");
      qrcode.generate(qr, { small: true });
      console.log("\nBuka WhatsApp → Perangkat Tertaut → Tautkan Perangkat\n");
    }

    if (connection === "open") {
      progressBar(100, 'Connected!');
      console.log("\n✅ Bot WhatsApp terhubung!");
      printReadyMessage();
    }

    if (connection === "close") {
      if (code === DisconnectReason.loggedOut || code === DisconnectReason.connectionReplaced) {
        console.log("\n❌ Session expired / replaced.");
        console.log("Solusi: hapus folder auth_info_baileys → jalankan bot → scan QR.");
        return;
      }

      if (!RECONNECT_ENABLED) return;

      startBot._attempt = (startBot._attempt || 0) + 1;
      const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * Math.pow(2, startBot._attempt - 1));
      console.log(`⚠️ Terputus. Reconnect dalam ${Math.round(delay / 1000)} detik...`);
      setTimeout(() => startBot().catch((e) => logError("Auto-reconnect error", e)), delay);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    await handleMessage(sock, messages, type);
  });

  return sock;
}

startBot().catch((e) => logError("Fatal startBot error", e));
