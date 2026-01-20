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
];

console.log = function (...args) {
  const message = args.map(a => typeof a === 'string' ? a : '').join(' ');
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
const { initCache } = require("./src/cache");
const { forceSaveCooldowns } = require("./src/cooldown");
const { handleMessage } = require("./src/handlers/messageHandler");

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

  // Force save cooldowns
  forceSaveCooldowns();
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

  console.log("👋 Goodbye!");
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// ===============================
// START BOT
// ===============================
async function startBot() {
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

    if (connection === "open") console.log("✅ Bot WhatsApp terhubung!");

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
