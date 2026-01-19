require("dotenv").config();
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const { Boom } = require("@hapi/boom");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

// ===============================
// UTIL
// ===============================
function pad2(n) {
  return n.toString().padStart(2, "0");
}
function formatTimestamp(d = new Date()) {
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  const h = pad2(d.getHours());
  const m = pad2(d.getMinutes());
  const s = pad2(d.getSeconds());
  return `${day}/${month}/${year}, ${h}.${m}.${s}`;
}
function debug(...args) {
  if ((process.env.DEBUG || "true").toLowerCase() === "true") {
    console.log(`${formatTimestamp()} [DEBUG]`, ...args);
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// debug rapi 1 baris
function dbgLine(tag, msg) {
  debug(`[${tag}] ${msg}`);
}

// ===============================
// ERROR LOG
// ===============================
const LOG_DIR = path.join(__dirname, "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, "error.log");

function logError(message, err) {
  const time = new Date().toISOString();
  let log = `[${time}] ${message}\n`;
  if (err?.stack) log += err.stack;
  else if (err) {
    try {
      log += JSON.stringify(err, null, 2);
    } catch {
      log += String(err);
    }
  }
  log += "\n\n";
  try {
    fs.appendFileSync(LOG_FILE, log, "utf8");
  } catch (e) {
    console.error("Gagal tulis error.log:", e);
  }
  console.error(message, err || "");
}

process.on("unhandledRejection", (reason) => logError("Unhandled Rejection", reason));
process.on("uncaughtException", (err) => logError("Uncaught Exception", err));

// ===============================
// CONFIG
// ===============================
const PRIVATE_CHAT_ONLY = (process.env.PRIVATE_CHAT_ONLY || "true").toLowerCase() === "true";
const ACCEPT_BAYAR_ALIAS = (process.env.ACCEPT_BAYAR_ALIAS || "false").toLowerCase() === "true";

const CATALOG_TRIGGERS = (process.env.CATALOG_TRIGGERS || "menu")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

let QRIS_TRIGGERS = (process.env.QRIS_TRIGGERS || "qris")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (ACCEPT_BAYAR_ALIAS && !QRIS_TRIGGERS.includes("bayar")) QRIS_TRIGGERS.push("bayar");

// simpan template katalog QRIS dari pesan WA asli
const QRIS_CATALOG_SAVED_PATH = process.env.QRIS_CATALOG_SAVED_PATH || "./qris_catalog_saved.json";

// owner numbers (digits) & owner jids (lid / s.whatsapp.net)
const OWNER_NUMBERS = (process.env.OWNER_NUMBERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const OWNER_JIDS = (process.env.OWNER_JIDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// anti-burst global
const GLOBAL_QRIS_MEDIA_GAP_MS = parseInt(process.env.GLOBAL_QRIS_MEDIA_GAP_MS || "8000", 10);
let lastGlobalQrisMediaAt = 0;

// caption fallback qris.png (tanpa kalimat bukti bayar)
const QRIS_IMAGE_CAPTION =
  (process.env.QRIS_IMAGE_CAPTION || "Silakan scan QRIS ini untuk pembayaran 😊").trim();

// ===============================
// NORMALIZE
// ===============================
function normalizeIndoNumberDigits(digits) {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  if (d.startsWith("0")) return "62" + d.slice(1);
  if (d.startsWith("8")) return "62" + d;
  if (d.startsWith("62")) return d;
  return d;
}
function digitsFromJid(jid) {
  const left = (jid || "").split("@")[0];
  const noDevice = left.split(":")[0]; // buang :3
  return (noDevice || "").replace(/\D/g, "");
}
function normalizeJidForCompare(jid) {
  if (!jid) return "";
  const j = jid.trim();
  if (j.toLowerCase().endsWith("@c.us")) return j.replace(/@c\.us$/i, "@s.whatsapp.net");
  return j;
}

// OWNER DETECTION (support LID/JID + fromMe + myId)
function isOwnerMessage(msg, sockUser) {
  if (msg?.key?.fromMe) return true;

  const remote = normalizeJidForCompare(msg?.key?.remoteJid || "");
  const participant = normalizeJidForCompare(msg?.key?.participant || "");

  if (OWNER_JIDS.length) {
    if (OWNER_JIDS.includes(remote) || OWNER_JIDS.includes(participant)) return true;
  }

  const myId = normalizeJidForCompare(sockUser?.id || "");
  if (myId && (remote === myId || participant === myId)) return true;

  if (!OWNER_NUMBERS.length) return true;

  const rd = normalizeIndoNumberDigits(digitsFromJid(remote));
  const pd = normalizeIndoNumberDigits(digitsFromJid(participant));
  const list = OWNER_NUMBERS.map(normalizeIndoNumberDigits);

  return list.includes(rd) || list.includes(pd);
}

// ===============================
// EXCLUDE
// ===============================
function addJidVariants(set, jid) {
  if (!jid) return;
  const j = jid.trim();
  set.add(j);
  set.add(normalizeJidForCompare(j));
  if (j.toLowerCase().endsWith("@s.whatsapp.net")) set.add(j.replace(/@s\.whatsapp\.net$/i, "@c.us"));
  if (j.toLowerCase().endsWith("@c.us")) set.add(j.replace(/@c\.us$/i, "@s.whatsapp.net"));
}

function parseExcluded() {
  const excludedDigits = new Set();
  const excludedJids = new Set();

  const rawNums = (process.env.EXCLUDED_NUMBERS || "").trim();
  const rawJids = (process.env.EXCLUDED_JIDS || "").trim();

  if (rawNums) {
    rawNums
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((item) => {
        const d = item.replace(/\D/g, "");
        if (!d) return;
        excludedDigits.add(normalizeIndoNumberDigits(d));
      });
  }

  if (rawJids) {
    rawJids
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .forEach((jid) => {
        addJidVariants(excludedJids, jid);

        const d = normalizeIndoNumberDigits(digitsFromJid(jid));
        if (d) excludedDigits.add(d);
      });
  }

  return { excludedDigits, excludedJids };
}

const EXCLUDE = parseExcluded();

function isExcludedMessage(msg) {
  const remoteJid = normalizeJidForCompare(msg?.key?.remoteJid || "");
  const participant = normalizeJidForCompare(msg?.key?.participant || "");

  if (EXCLUDE.excludedJids.has(remoteJid) || EXCLUDE.excludedJids.has(participant)) return true;

  const rd = normalizeIndoNumberDigits(digitsFromJid(remoteJid));
  const pd = normalizeIndoNumberDigits(digitsFromJid(participant));

  if (rd && EXCLUDE.excludedDigits.has(rd)) return true;
  if (pd && EXCLUDE.excludedDigits.has(pd)) return true;

  return false;
}

// ===============================
// RATE LIMIT / QUEUE
// ===============================
let RATE_ENABLED = true;
if (process.env.RATE_LIMIT_ENABLED !== undefined) {
  RATE_ENABLED = String(process.env.RATE_LIMIT_ENABLED).toLowerCase() === "true";
} else if (process.env.RATE_ENABLED !== undefined) {
  RATE_ENABLED = String(process.env.RATE_ENABLED).toLowerCase() === "true";
}

const RATE_MIN_MS = parseInt(process.env.RATE_MIN_MS || "2500", 10);
const RATE_MAX_MS = parseInt(process.env.RATE_MAX_MS || "7000", 10);

function randomDelay(min, max) {
  if (max <= min) return min;
  return Math.floor(min + Math.random() * (max - min));
}

const queue = [];
let sending = false;

async function processQueue() {
  if (sending) return;
  sending = true;

  while (queue.length) {
    const job = queue.shift();
    try {
      if (RATE_ENABLED) await sleep(randomDelay(RATE_MIN_MS, RATE_MAX_MS));
      await job.fn();
      job.resolve();
    } catch (e) {
      logError("Gagal kirim pesan", e);
      job.reject(e);
    }
  }

  sending = false;
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processQueue();
  });
}

// ===============================
// COOLDOWN
// ===============================
const MENU_COOLDOWN_MS = parseInt(process.env.MENU_COOLDOWN_HOURS || "24", 10) * 60 * 60 * 1000;
const QRIS_COOLDOWN_MS = parseInt(process.env.QRIS_COOLDOWN_HOURS || "24", 10) * 60 * 60 * 1000;
const PRODUCT_COOLDOWN_MS = parseInt(process.env.PRODUCT_COOLDOWN_HOURS || "24", 10) * 60 * 60 * 1000;

const COMMAND_COOLDOWN_FILE = "command_cooldown.json";
const PRODUCT_COOLDOWN_FILE = "product_cooldown.json";

let commandLastSent = {};
let productLastSent = {};

(function loadCooldowns() {
  try {
    if (fs.existsSync(COMMAND_COOLDOWN_FILE)) {
      commandLastSent = JSON.parse(fs.readFileSync(COMMAND_COOLDOWN_FILE, "utf8"));
    }
  } catch {
    commandLastSent = {};
  }
  try {
    if (fs.existsSync(PRODUCT_COOLDOWN_FILE)) {
      productLastSent = JSON.parse(fs.readFileSync(PRODUCT_COOLDOWN_FILE, "utf8"));
    }
  } catch {
    productLastSent = {};
  }
})();

function saveCommandCooldown() {
  try {
    fs.writeFileSync(COMMAND_COOLDOWN_FILE, JSON.stringify(commandLastSent, null, 2));
  } catch {}
}
function saveProductCooldown() {
  try {
    fs.writeFileSync(PRODUCT_COOLDOWN_FILE, JSON.stringify(productLastSent, null, 2));
  } catch {}
}

function canSendCommand(jid, cmdKey, cooldownMs) {
  const now = Date.now();
  const byJid = commandLastSent[jid] || {};
  const last = byJid[cmdKey] || 0;
  if (!last) return true;
  return now - last >= cooldownMs;
}
function markCommandSent(jid, cmdKey) {
  const now = Date.now();
  if (!commandLastSent[jid]) commandLastSent[jid] = {};
  commandLastSent[jid][cmdKey] = now;
  saveCommandCooldown();
}

function canSendProduct(jid, productMainKey) {
  const now = Date.now();
  const byJid = productLastSent[jid] || {};
  const last = byJid[productMainKey] || 0;
  if (!last) return true;
  return now - last >= PRODUCT_COOLDOWN_MS;
}
function markProductSent(jid, productMainKey) {
  const now = Date.now();
  if (!productLastSent[jid]) productLastSent[jid] = {};
  productLastSent[jid][productMainKey] = now;
  saveProductCooldown();
}

// ===============================
// PRODUCTS (DARI .env)
// ===============================
const PRODUCT_KEYS = (process.env.PRODUCT_KEYS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function buildProducts() {
  const map = {};

  if (!PRODUCT_KEYS.length) {
    dbgLine("BOOT", "PRODUCT_KEYS kosong / tidak kebaca dari .env -> fitur produk tidak akan jalan.");
    return map;
  }

  for (const key of PRODUCT_KEYS) {
    const id = key.toUpperCase().replace(/\s+/g, "_"); // "chat gpt" -> CHAT_GPT
    const descKey = `PRODUCT_${id}_TEXT`;
    const catKey = `PRODUCT_CATEGORY_${id}`;
    const aliasKey = `PRODUCT_ALIAS_${id}`;

    const desc = process.env[descKey] || "";
    if (!desc.trim()) {
      dbgLine(
        "BOOT",
        `SKIP produk "${key}" karena ${descKey} kosong / tidak kebaca. (Biasanya masalah parsing .env multiline)`
      );
      continue;
    }

    const category = (process.env[catKey] || "").trim();
    const iconKey = category ? `CATEGORY_ICON_${category.toUpperCase()}` : "";
    const icon = iconKey ? (process.env[iconKey] || "").trim() : "";

    const mainKey = key.toLowerCase();

    const productObj = {
      mainKey,
      name: key,
      description: desc.trim(),
      icon: icon || process.env.CATEGORY_ICON_DEFAULT || "📦",
    };

    // main key
    map[mainKey] = productObj;

    // alias keys
    const aliasRaw = (process.env[aliasKey] || "").trim();
    if (aliasRaw) {
      aliasRaw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .forEach((alias) => {
          map[alias] = productObj;
        });
    }
  }

  return map;
}

const products = buildProducts();

// log ringkas produk ter-load
(function logProductsLoaded() {
  const keys = Object.keys(products);
  const uniqueMain = Array.from(new Set(keys.map((k) => products[k]?.mainKey).filter(Boolean)));
  dbgLine("BOOT", `Loaded products: unique=${uniqueMain.length}, keys(total termasuk alias)=${keys.length}`);
  if (uniqueMain.length) dbgLine("BOOT", `Product list: ${uniqueMain.join(", ")}`);
})();

function detectProductInText(textLower) {
  for (const key of Object.keys(products)) {
    if (!key) continue;
    if (textLower === key) continue;
    if (textLower.includes(key)) return products[key];
  }
  return null;
}

// ===============================
// TEXTS
// ===============================
function getCatalogText() {
  const txt = process.env.CATALOG_TEXT;
  return txt && txt.trim() ? txt.trim() : "CATALOG_TEXT belum di-set di .env";
}

// ===============================
// QRIS TEMPLATE SAVE/LOAD
// ===============================
function saveTemplate(messageObj) {
  fs.writeFileSync(QRIS_CATALOG_SAVED_PATH, JSON.stringify(messageObj, null, 2), "utf8");
  dbgLine("QRIS", `Template tersimpan -> ${QRIS_CATALOG_SAVED_PATH}`);
}

function loadSavedTemplate() {
  try {
    if (!fs.existsSync(QRIS_CATALOG_SAVED_PATH)) return null;
    const raw = fs.readFileSync(QRIS_CATALOG_SAVED_PATH, "utf8");
    return JSON.parse(raw) || null;
  } catch (e) {
    logError("Gagal load qris_catalog_saved.json", e);
    return null;
  }
}

function findProductMessageAny(messageObj) {
  if (!messageObj) return null;
  if (messageObj.productMessage) return { wrapper: messageObj };

  const quoted = messageObj?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.productMessage) return { wrapper: quoted };

  return null;
}

// ===============================
// MESSAGE TEXT EXTRACTOR (lebih lengkap)
// ===============================
function extractTextFromMessage(message) {
  if (!message) return "";

  // unwrap wrapper umum
  let m = message;
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

// ===============================
// START BOT
// ===============================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info_baileys");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
  });

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

      const enabled = (process.env.RECONNECT_ENABLED || "true").toLowerCase() === "true";
      if (!enabled) return;

      const base = parseInt(process.env.RECONNECT_BASE_DELAY_MS || "2000", 10);
      const max = parseInt(process.env.RECONNECT_MAX_DELAY_MS || "30000", 10);
      startBot._attempt = (startBot._attempt || 0) + 1;
      const delay = Math.min(max, base * Math.pow(2, startBot._attempt - 1));
      console.log(`⚠️ Terputus. Reconnect dalam ${Math.round(delay / 1000)} detik...`);
      setTimeout(() => startBot().catch((e) => logError("Auto-reconnect error", e)), delay);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (!messages || !messages[0]) return;
      if (type && type !== "notify") return;

      const msg = messages[0];
      if (!msg.message) {
        dbgLine("IN", "msg.message kosong -> skip");
        return;
      }

      const jid = normalizeJidForCompare(msg.key.remoteJid || "");
      const isStatus = jid === "status@broadcast" || jid.endsWith("@broadcast");
      const isGroup = jid.endsWith("@g.us");
      const isIndividu = jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid") || jid.endsWith("@c.us");

      const text = extractTextFromMessage(msg.message);
      const lowerText = (text || "").toLowerCase().trim();
      const keys = Object.keys(msg.message || {}).join(",");

      // log 1 baris (rapi)
      dbgLine("IN", `jid=${jid} fromMe=${!!msg.key.fromMe} text="${lowerText}" keys=[${keys}]`);

      // ===== OWNER command saveqris (reply katalog -> saveqris)
      if (lowerText === "saveqris") {
        const ownerOk = isOwnerMessage(msg, sock.user);
        dbgLine("SAVEQRIS", `ownerOk=${ownerOk} jid=${jid}`);

        if (!ownerOk) {
          await enqueue(() =>
            sock.sendMessage(jid, {
              text:
                "❌ Kamu bukan OWNER.\n\n" +
                "Solusi cepat:\n" +
                "1) Isi OWNER_NUMBERS dan OWNER_JIDS di .env\n" +
                "2) OWNER_JIDS ambil dari log myPN & myLID\n",
            })
          );
          return;
        }

        const found = findProductMessageAny(msg.message);
        if (!found) {
          await enqueue(() =>
            sock.sendMessage(jid, {
              text:
                "❌ Tidak ketemu pesan katalog.\n\n" +
                "Cara benar:\n" +
                "1) Reply pesan katalog QRIS yang bisa diklik\n" +
                "2) ketik: *saveqris*",
            })
          );
          dbgLine("SAVEQRIS", "GAGAL: quoted productMessage tidak ditemukan.");
          return;
        }

        saveTemplate(found.wrapper);
        await enqueue(() => sock.sendMessage(jid, { text: "✅ Berhasil! Template katalog QRIS tersimpan." }));
        return;
      }

      // stop kalau pesan dari bot sendiri (untuk user normal)
      if (msg.key.fromMe) {
        dbgLine("SKIP", "fromMe=true");
        return;
      }

      if (isStatus) {
        dbgLine("SKIP", "status/broadcast");
        return;
      }
      if (isGroup) {
        dbgLine("SKIP", "group");
        return;
      }
      if (PRIVATE_CHAT_ONLY && !isIndividu) {
        dbgLine("SKIP", "PRIVATE_CHAT_ONLY=true dan bukan chat individu");
        return;
      }
      if (isExcludedMessage(msg)) {
        dbgLine("SKIP", "EXCLUDED (nomor/jid)");
        return;
      }
      if (!lowerText) {
        dbgLine("SKIP", "text kosong / tidak bisa dibaca");
        return;
      }

      // MENU
      if (CATALOG_TRIGGERS.includes(lowerText)) {
        if (!canSendCommand(jid, "catalog", MENU_COOLDOWN_MS)) {
          dbgLine("COOLDOWN", `catalog ditahan untuk jid=${jid}`);
          return;
        }
        await enqueue(() => sock.sendMessage(jid, { text: getCatalogText() }));
        markCommandSent(jid, "catalog");
        dbgLine("OUT", `catalog terkirim -> jid=${jid}`);
        return;
      }

      // QRIS
      if (QRIS_TRIGGERS.includes(lowerText)) {
        if (!canSendCommand(jid, "qris", QRIS_COOLDOWN_MS)) {
          dbgLine("COOLDOWN", `qris ditahan untuk jid=${jid}`);
          return;
        }

        const now = Date.now();
        const diff = now - lastGlobalQrisMediaAt;
        if (diff < GLOBAL_QRIS_MEDIA_GAP_MS) await sleep(GLOBAL_QRIS_MEDIA_GAP_MS - diff);

        // LAPIS 1: relay template katalog
        try {
          const template = loadSavedTemplate();
          if (!template?.productMessage) throw new Error("Template belum ada. Simpan dulu pakai reply katalog -> saveqris");

          await enqueue(() => sock.relayMessage(jid, template, { messageId: sock.generateMessageTag() }));
          lastGlobalQrisMediaAt = Date.now();

          markCommandSent(jid, "qris");
          dbgLine("OUT", `qris(catalog) terkirim -> jid=${jid}`);
          return;
        } catch (e1) {
          dbgLine("QRIS", `catalog gagal -> fallback image. alasan="${e1?.message || e1}"`);
        }

        // LAPIS 2: fallback qris.png
        try {
          const buffer = fs.readFileSync("./qris.png");
          await enqueue(() =>
            sock.sendMessage(jid, {
              image: buffer,
              caption: QRIS_IMAGE_CAPTION,
            })
          );
          lastGlobalQrisMediaAt = Date.now();
          markCommandSent(jid, "qris");
          dbgLine("OUT", `qris(image) terkirim -> jid=${jid}`);
        } catch (e2) {
          logError("Gagal mengirim QRIS (template & gambar)", e2);
          await enqueue(() => sock.sendMessage(jid, { text: "QRIS tidak bisa dikirim. Pastikan *qris.png* ada di folder bot." }));
          markCommandSent(jid, "qris");
        }
        return;
      }

      // PRODUK (exact match)
      if (products[lowerText]) {
        const p = products[lowerText];

        if (!canSendProduct(jid, p.mainKey)) {
          dbgLine("COOLDOWN", `produk="${p.mainKey}" ditahan -> jid=${jid}`);
          return;
        }

        await enqueue(() => sock.sendMessage(jid, { text: `${p.icon} *${p.name}*\n\n${p.description}` }));
        markProductSent(jid, p.mainKey);
        dbgLine("OUT", `produk terkirim="${p.mainKey}" -> jid=${jid}`);
        return;
      }

      // PRODUK (match di kalimat)
      const pInSentence = detectProductInText(lowerText);
      if (pInSentence) {
        if (!canSendProduct(jid, pInSentence.mainKey)) {
          dbgLine("COOLDOWN", `produk(kalimat)="${pInSentence.mainKey}" ditahan -> jid=${jid}`);
          return;
        }

        await enqueue(() => sock.sendMessage(jid, { text: `${pInSentence.icon} *${pInSentence.name}*\n\n${pInSentence.description}` }));
        markProductSent(jid, pInSentence.mainKey);
        dbgLine("OUT", `produk(kalimat) terkirim="${pInSentence.mainKey}" -> jid=${jid}`);
        return;
      }

      // Tidak match apa pun
      dbgLine("NO_MATCH", `jid=${jid} text="${lowerText}" (productsLoadedKeys=${Object.keys(products).length})`);
    } catch (e) {
      logError("Error di messages.upsert", e);
    }
  });

  return sock;
}

startBot().catch((e) => logError("Fatal startBot error", e));
