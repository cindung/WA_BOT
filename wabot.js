// wabot.js - FINAL UPDATE (berdasarkan file terakhir kamu)
// FIX UTAMA:
// ✅ Kalau @lid: JANGAN ambil digit jadi nomor (itu bukan nomor)
// ✅ @lid tidak masuk Google Contacts CSV (biar tidak nyampah)
// ✅ @lid tetap dicatat di buyers.json dengan status LID_ONLY
// ✅ Intent/Ignore keyword pakai "kata utuh" (bukan substring) -> keyword "p" tidak bikin error lagi
// ✅ Deteksi produk di kalimat (misal: "vidio ada perhari?") tetap dianggap intent beli

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
// WAKTU & DEBUG
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

// ✅ CSV date format (simple)
function formatDateForCsv(d = new Date()) {
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const fmt = (process.env.CSV_DATE_FORMAT || "dd-mm-yyyy").toLowerCase();
  if (fmt === "yyyy-mm-dd") return `${yyyy}-${mm}-${dd}`;
  return `${dd}-${mm}-${yyyy}`; // default
}
function parseCsvList(envVal) {
  return (envVal || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
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

// cooldown catalog
const CATALOG_HOURS = parseInt(process.env.CATALOG_COOLDOWN_HOURS || "24", 10);
const COOLDOWN_CATALOG_MS = CATALOG_HOURS * 60 * 60 * 1000;
const COOLDOWN_FILE = "cooldown.json";
let lastCatalogSent = {};

(function loadCooldown() {
  try {
    if (fs.existsSync(COOLDOWN_FILE)) {
      lastCatalogSent = JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));
      debug("Cooldown loaded dari", COOLDOWN_FILE);
    } else {
      debug("Tidak ada cooldown.json, mulai dari kosong.");
    }
  } catch (e) {
    logError("Gagal load cooldown.json", e);
    lastCatalogSent = {};
  }
})();

function saveCooldown() {
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(lastCatalogSent, null, 2));
  } catch (e) {
    logError("Gagal simpan cooldown.json", e);
  }
}

// ===============================
// EXCLUDE SUPER ROBUST
// ===============================
function normalizeIndoNumberDigits(digits) {
  if (!digits) return "";
  const d = digits.replace(/\D/g, "");
  if (d.startsWith("0")) return "62" + d.slice(1);
  if (d.startsWith("8")) return "62" + d; // ✅ fix untuk kasus 8xxxx
  if (d.startsWith("62")) return d;
  return d;
}

// ✅ FIX: buang ":device"
function digitsFromJid(jid) {
  const left = (jid || "").split("@")[0];
  const noDevice = left.split(":")[0];
  return (noDevice || "").replace(/\D/g, "");
}

// ✅ normalisasi @c.us -> @s.whatsapp.net biar cocok
function normalizeJidForCompare(jid) {
  if (!jid) return "";
  const j = jid.trim();
  if (j.toLowerCase().endsWith("@c.us")) return j.replace(/@c\.us$/i, "@s.whatsapp.net");
  return j;
}
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
    rawNums.split(",").map((x) => x.trim()).filter(Boolean).forEach((item) => {
      const d = item.replace(/\D/g, "");
      if (!d) return;
      excludedDigits.add(d);
      excludedDigits.add(normalizeIndoNumberDigits(d));
    });
  }

  if (rawJids) {
    rawJids.split(",").map((x) => x.trim()).filter(Boolean).forEach((jid) => {
      addJidVariants(excludedJids, jid);

      // ⚠️ LID bukan nomor — tapi kalau user isi excluded_jids @lid, kita tetap exclude by jid
      const d = digitsFromJid(jid);
      if (d && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@c.us"))) {
        excludedDigits.add(d);
        excludedDigits.add(normalizeIndoNumberDigits(d));
      }
    });
  }

  debug("EXCLUDED_JIDS:", Array.from(excludedJids));
  debug("EXCLUDED_DIGITS:", Array.from(excludedDigits));

  return { excludedDigits, excludedJids };
}

const EXCLUDE = parseExcluded();

function isExcludedMessage(msg) {
  const remoteJidRaw = msg?.key?.remoteJid || "";
  const participantRaw = msg?.key?.participant || "";

  const remoteJid = normalizeJidForCompare(remoteJidRaw);
  const participant = normalizeJidForCompare(participantRaw);

  if (EXCLUDE.excludedJids.has(remoteJid) || EXCLUDE.excludedJids.has(participant)) {
    return { ok: true, why: "match jid exact", hit: remoteJid || participant };
  }

  // digits exclude hanya masuk akal untuk nomor (bukan lid)
  if (remoteJidRaw.endsWith("@s.whatsapp.net") || remoteJidRaw.endsWith("@c.us")) {
    const d1 = normalizeIndoNumberDigits(digitsFromJid(remoteJidRaw));
    if (d1 && EXCLUDE.excludedDigits.has(d1)) return { ok: true, why: "match digits remote", hit: d1 };
  }
  if (participantRaw.endsWith("@s.whatsapp.net") || participantRaw.endsWith("@c.us")) {
    const d2 = normalizeIndoNumberDigits(digitsFromJid(participantRaw));
    if (d2 && EXCLUDE.excludedDigits.has(d2)) return { ok: true, why: "match digits participant", hit: d2 };
  }

  return { ok: false };
}

// ===============================
// ANTI-BANNED THROTTLING (QUEUE)
// ===============================
const RATE_ENABLED = (process.env.RATE_LIMIT_ENABLED || "true").toLowerCase() === "true";
const RATE_MIN_MS = parseInt(process.env.RATE_MIN_MS || "1000", 10);
const RATE_MAX_MS = parseInt(process.env.RATE_MAX_MS || "2500", 10);

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===============================
// BUYER LOG + UPGRADE (LID SAFE)
// ===============================
const BUYER_LOG_ENABLED = (process.env.BUYER_LOG_ENABLED || "true").toLowerCase() === "true";
const BUYER_LOG_FOLDER = process.env.BUYER_LOG_FOLDER || "buyer_logs";

const BUYER_DB_FILE = process.env.BUYER_DB_FILE || "buyers.json";
const BUYER_JSON_FILE = path.join(BUYER_LOG_FOLDER, BUYER_DB_FILE);

const BUYER_DB_AUTOSAVE_INTERVAL_MS = parseInt(process.env.BUYER_DB_AUTOSAVE_INTERVAL_MS || "60000", 10);

// backup buyers
const BUYER_BACKUP_ENABLED = (process.env.BUYER_BACKUP_ENABLED || "true").toLowerCase() === "true";
const BUYER_BACKUP_FOLDER = process.env.BUYER_BACKUP_FOLDER || "buyer_backups";
const BUYER_BACKUP_KEEP_LAST = parseInt(process.env.BUYER_BACKUP_KEEP_LAST || "30", 10);

// google contacts CSV
const BUYER_GOOGLE_CSV_ENABLED = (process.env.BUYER_GOOGLE_CSV_ENABLED || "true").toLowerCase() === "true";
const BUYER_GOOGLE_CSV_MODE = (process.env.BUYER_GOOGLE_CSV_MODE || "both").toLowerCase(); // daily|single|both
const BUYER_GOOGLE_CSV_SINGLE_FILE = process.env.BUYER_GOOGLE_CSV_SINGLE_FILE || "google-contacts-all.csv";

// intent only
const BUYER_INTENT_ONLY = (process.env.BUYER_INTENT_ONLY || "true").toLowerCase() === "true";
const BUYER_INTENT_KEYWORDS = parseCsvList(process.env.BUYER_INTENT_KEYWORDS);
const BUYER_IGNORE_KEYWORDS = parseCsvList(process.env.BUYER_IGNORE_KEYWORDS);

// ✅ Match kata utuh (biar keyword "p" tidak bikin semua kalimat ter-ignore)
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function hasKeyword(text, keyword) {
  const t = (text || "").toLowerCase();

  // kalau keyword ada spasi (frasa), pakai includes
  if (keyword.includes(" ")) return t.includes(keyword);

  // match kata utuh
  const re = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
  return re.test(t);
}
function textHasAnyKeyword(text, list) {
  return list.some((k) => k && hasKeyword(text, k));
}

let buyers = {};
let buyersByPhone = {}; // dedup kuat nomor

function ensureBuyerFoldersForDate(dateObj = new Date()) {
  const year = String(dateObj.getFullYear());
  const month = pad2(dateObj.getMonth() + 1);
  const dir = path.join(BUYER_LOG_FOLDER, year, month);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

(function loadBuyers() {
  if (!BUYER_LOG_ENABLED) return;
  try {
    if (!fs.existsSync(BUYER_LOG_FOLDER)) fs.mkdirSync(BUYER_LOG_FOLDER, { recursive: true });

    if (fs.existsSync(BUYER_JSON_FILE)) {
      buyers = JSON.parse(fs.readFileSync(BUYER_JSON_FILE, "utf8")) || {};
      debug(`${BUYER_DB_FILE} loaded:`, Object.keys(buyers).length);
    } else {
      buyers = {};
      fs.writeFileSync(BUYER_JSON_FILE, JSON.stringify({}, null, 2), "utf8");
      debug(`${BUYER_DB_FILE} dibuat baru (kosong).`);
    }

    buyersByPhone = {};
    for (const k of Object.keys(buyers)) {
      const ph = buyers[k]?.phone;
      if (ph) buyersByPhone[ph] = k;
    }
  } catch (e) {
    logError("Gagal load buyer DB", e);
    buyers = {};
    buyersByPhone = {};
  }
})();

function backupBuyersFile() {
  if (!BUYER_BACKUP_ENABLED) return;
  try {
    if (!fs.existsSync(BUYER_JSON_FILE)) return;

    if (!fs.existsSync(BUYER_BACKUP_FOLDER)) fs.mkdirSync(BUYER_BACKUP_FOLDER, { recursive: true });

    const ts = new Date();
    const stamp = `${ts.getFullYear()}${pad2(ts.getMonth() + 1)}${pad2(ts.getDate())}-${pad2(ts.getHours())}${pad2(ts.getMinutes())}${pad2(ts.getSeconds())}`;
    const backupPath = path.join(BUYER_BACKUP_FOLDER, `buyers-${stamp}.json`);
    fs.copyFileSync(BUYER_JSON_FILE, backupPath);

    const files = fs
      .readdirSync(BUYER_BACKUP_FOLDER)
      .filter((f) => f.startsWith("buyers-") && f.endsWith(".json"))
      .sort();

    if (files.length > BUYER_BACKUP_KEEP_LAST) {
      const toDelete = files.slice(0, files.length - BUYER_BACKUP_KEEP_LAST);
      for (const f of toDelete) {
        try { fs.unlinkSync(path.join(BUYER_BACKUP_FOLDER, f)); } catch {}
      }
    }
  } catch (e) {
    logError("Gagal backup buyer DB", e);
  }
}

function saveBuyers(force = false) {
  if (!BUYER_LOG_ENABLED) return;
  try {
    backupBuyersFile();
    fs.writeFileSync(BUYER_JSON_FILE, JSON.stringify(buyers, null, 2), "utf8");
  } catch (e) {
    logError("Gagal simpan buyer DB", e);
  }
}

if (BUYER_LOG_ENABLED && BUYER_DB_AUTOSAVE_INTERVAL_MS > 0) {
  setInterval(() => {
    try { saveBuyers(false); } catch {}
  }, BUYER_DB_AUTOSAVE_INTERVAL_MS);
}

function appendGoogleContactsCsv(name, phone, dateObj) {
  if (!BUYER_GOOGLE_CSV_ENABLED) return;
  if (!phone) return; // ✅ LID tidak punya nomor -> skip

  const parentDir = ensureBuyerFoldersForDate(dateObj);
  const dateStr = formatDateForCsv(dateObj);

  const dailyFile = path.join(parentDir, `google-contacts-${dateStr}.csv`);
  const singleFile = path.join(BUYER_LOG_FOLDER, BUYER_GOOGLE_CSV_SINGLE_FILE);

  const targets = [];
  if (BUYER_GOOGLE_CSV_MODE === "daily" || BUYER_GOOGLE_CSV_MODE === "both") targets.push(dailyFile);
  if (BUYER_GOOGLE_CSV_MODE === "single" || BUYER_GOOGLE_CSV_MODE === "both") targets.push(singleFile);

  const header = "Name,Given Name,Family Name,Phone 1 - Type,Phone 1 - Value\n";

  let phoneValue = phone.trim();
  if (phoneValue.startsWith("62")) phoneValue = "+" + phoneValue;

  const safeName = (name || "").replace(/"/g, '""');
  const safePhone = phoneValue.replace(/"/g, '""');
  const line = `"${safeName}",,,Mobile,"${safePhone}"\n`;

  for (const file of targets) {
    try {
      const needHeader = !fs.existsSync(file);
      if (needHeader) fs.appendFileSync(file, header, "utf8");
      fs.appendFileSync(file, line, "utf8");
      debug("Google Contacts CSV ditambah:", file, safeName, safePhone);
    } catch (e) {
      logError("Gagal menulis Google Contacts CSV", e);
    }
  }
}

// ===============================
// PRODUK DARI .env (DYNAMIC + ALIAS)
// ===============================
function keyToId(key) {
  return key.normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}
function categoryKeyToId(category) {
  return category.normalize("NFKD").replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase();
}
function getCategoryIcon(categoryRaw) {
  if (!categoryRaw || categoryRaw.trim() === "") return process.env.CATEGORY_ICON_DEFAULT || "📦";
  const id = categoryKeyToId(categoryRaw);
  const envName = `CATEGORY_ICON_${id}`;
  return process.env[envName] || process.env.CATEGORY_ICON_DEFAULT || "📦";
}
function getProductTextFromEnv(id) {
  const varName = `PRODUCT_${id}_TEXT`;
  const raw = process.env[varName];
  return raw && raw.trim() ? raw.trim() : "Detail produk belum diisi.";
}

function buildProductsFromEnv() {
  const products = {};
  const rawKeys = process.env.PRODUCT_KEYS || "";

  rawKeys.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean).forEach((key) => {
    const id = keyToId(key);
    const desc = getProductTextFromEnv(id);
    const displayName = key.toUpperCase();

    const categoryRaw = process.env[`PRODUCT_CATEGORY_${id}`] || "";
    const icon = getCategoryIcon(categoryRaw);

    const productObj = { name: displayName, description: desc, mainKey: key, idEnv: id, category: categoryRaw, icon };
    products[key] = productObj;

    const aliasRaw = process.env[`PRODUCT_ALIAS_${id}`] || "";
    aliasRaw.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean).forEach((alias) => {
      if (!products[alias]) products[alias] = productObj;
    });
  });

  debug("Produk+alias loaded:", Object.keys(products));
  return products;
}
const products = buildProductsFromEnv();

// ✅ deteksi produk di KALIMAT (bukan hanya sama persis)
function detectProductInText(text) {
  const t = (text || "").toLowerCase();
  // urut dari yang panjang biar "youtube premium" ketemu dulu
  const keys = Object.keys(products).sort((a, b) => b.length - a.length);

  for (const k of keys) {
    if (!k) continue;
    // alias pendek (<=2) harus kata utuh
    if (k.length <= 2) {
      if (hasKeyword(t, k)) return products[k];
    } else if (k.includes(" ")) {
      if (t.includes(k)) return products[k];
    } else {
      if (hasKeyword(t, k)) return products[k];
    }
  }
  return null;
}

// ===============================
// SUGGESTION (LEVENSHTEIN) - tetap
// ===============================
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}
function similarity(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen ? 1 - dist / maxLen : 1;
}
const SUGGESTION_MIN_SIMILARITY = parseFloat(process.env.SUGGESTION_MIN_SIMILARITY || "0.6");

function findBestProductSuggestion(inputText) {
  let bestKey = null;
  let bestScore = 0;
  for (const key of Object.keys(products)) {
    const score = similarity(inputText, key);
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  if (bestKey && bestScore >= SUGGESTION_MIN_SIMILARITY) return products[bestKey];
  return null;
}

// ===============================
// Buyer display name
// ===============================
function buildBuyerDisplayName(waName, phone, rawText) {
  const name = (waName || "").trim();
  if (name) return name;

  // kalau tidak ada phone (LID_ONLY), pakai label aman
  if (!phone) return "BUYER (LID ONLY)";

  const p = detectProductInText(rawText);
  if (p) return `${p.name} ${phone}`.trim();

  const sug = findBestProductSuggestion((rawText || "").toLowerCase().trim());
  if (sug) return `${sug.name} ${phone}`.trim();

  return `BUYER ${phone}`.trim();
}

// ===============================
// Buyer logger (LID SAFE + Dedup kuat)
// ===============================
function logNewBuyerIfNeeded(jidRaw, waName, rawTextTrim) {
  if (!BUYER_LOG_ENABLED) return;

  const jid = normalizeJidForCompare(jidRaw);

  const isIndividu = jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid") || jid.endsWith("@c.us");
  if (!isIndividu) return;

  const now = new Date();
  const dateStr = formatDateForCsv(now);
  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

  const isLidOnly = jid.endsWith("@lid");

  // ✅ kalau lid: phone harus NULL (jangan tebak digit!)
  const phone = isLidOnly ? null : normalizeIndoNumberDigits(digitsFromJid(jid));
  const waNameClean = (waName || "").replace(/"/g, '""');
  const keywordClean = (rawTextTrim || "").replace(/"/g, '""');

  // dedup:
  // - kalau punya phone => dedup by phone
  // - kalau lid only => dedup by jid (lid itu sendiri)
  let primaryKey = jid;
  if (phone) {
    const existingKey = buyersByPhone[phone];
    primaryKey = existingKey || jid;
  }

  const isNew = !buyers[primaryKey];

  if (!buyers[primaryKey]) {
    buyers[primaryKey] = {
      jid: primaryKey,
      status: isLidOnly ? "LID_ONLY" : "HAS_PHONE",
      phone: phone,
      phones: phone ? [phone] : [],
      waName: waName || "",
      displayName: buildBuyerDisplayName(waName, phone, rawTextTrim),
      firstSeen: now.toISOString(),
      firstKeyword: rawTextTrim || "",
      lastSeen: now.toISOString(),
      lastKeyword: rawTextTrim || "",
      jids: [jid],
    };
    if (phone) buyersByPhone[phone] = primaryKey;
  } else {
    buyers[primaryKey].lastSeen = now.toISOString();
    buyers[primaryKey].lastKeyword = rawTextTrim || buyers[primaryKey].lastKeyword || "";
    if (!buyers[primaryKey].jids) buyers[primaryKey].jids = [];
    if (!buyers[primaryKey].jids.includes(jid)) buyers[primaryKey].jids.push(jid);
  }

  saveBuyers(true);

  if (!isNew) return;

  // CSV harian buyer (tetap) — untuk LID, phone kosong
  const parentDir = ensureBuyerFoldersForDate(now);
  const csvFile = path.join(parentDir, `buyers-${dateStr}.csv`);
  const headerNeeded = !fs.existsSync(csvFile);

  const phoneForCsv = phone ? phone : "";
  const statusForCsv = isLidOnly ? "LID_ONLY" : "HAS_PHONE";
  const line = `${dateStr},${timeStr},"${waNameClean}","${phoneForCsv}","${keywordClean}","${statusForCsv}"\n`;

  try {
    if (headerNeeded) {
      fs.appendFileSync(csvFile, "date,time,wa_name,wa_number,first_keyword,status\n", "utf8");
    }
    fs.appendFileSync(csvFile, line, "utf8");
    debug("Buyer baru dicatat ke", csvFile, ":", phoneForCsv || jid);
  } catch (e) {
    logError("Gagal menulis CSV buyer baru", e);
  }

  // ✅ Google Contacts CSV: hanya kalau ada phone
  if (phone) {
    try {
      const contactName = buildBuyerDisplayName(waName, phone, rawTextTrim);
      appendGoogleContactsCsv(contactName, phone, now);
    } catch (e) {
      logError("Gagal tulis Google Contacts CSV", e);
    }
  } else {
    debug("LID_ONLY -> tidak ditulis ke Google Contacts CSV:", jid);
  }
}

// ===============================
// CATALOG TEXT
// ===============================
function getCatalogText() {
  const txt = process.env.CATALOG_TEXT;
  if (txt && txt.trim()) return txt.trim();
  return "CATALOG_TEXT belum di-set di .env";
}

// ===============================
// RECONNECT STABIL (BACKOFF)
// ===============================
const RECONNECT_ENABLED = (process.env.RECONNECT_ENABLED || "true").toLowerCase() === "true";
const RECONNECT_BASE_DELAY_MS = parseInt(process.env.RECONNECT_BASE_DELAY_MS || "2000", 10);
const RECONNECT_MAX_DELAY_MS = parseInt(process.env.RECONNECT_MAX_DELAY_MS || "30000", 10);

let reconnectAttempt = 0;

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

  // ===== QUEUE SEND (ANTI SPAM) =====
  const queue = [];
  let sending = false;

  async function processQueue() {
    if (sending) return;
    sending = true;

    while (queue.length) {
      const job = queue.shift();
      try {
        if (RATE_ENABLED) {
          const d = randomDelay(RATE_MIN_MS, RATE_MAX_MS);
          await new Promise((r) => setTimeout(r, d));
        }
        await sock.sendMessage(job.jid, job.msg);
        job.resolve();
      } catch (e) {
        logError("Gagal kirim pesan", e);
        job.reject(e);
      }
    }

    sending = false;
  }

  function sendSmart(jid, msg) {
    return new Promise((resolve, reject) => {
      queue.push({ jid, msg, resolve, reject });
      processQueue();
    });
  }

  // ===== CONNECTION UPDATE =====
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    const code = lastDisconnect ? new Boom(lastDisconnect.error)?.output?.statusCode : undefined;

    if (qr) {
      console.log("\nScan QR berikut:");
      qrcode.generate(qr, { small: true });
      console.log("\nBuka WhatsApp → Perangkat Tertaut → Tautkan Perangkat\n");
    }

    if (connection === "open") {
      reconnectAttempt = 0;
      console.log("✅ Bot WhatsApp terhubung!");
    }

    if (connection === "close") {
      debug("Koneksi close, code:", code);

      if (code === DisconnectReason.loggedOut || code === DisconnectReason.connectionReplaced) {
        console.log("\n❌ Session expired / replaced.");
        console.log("Solusi: hapus folder auth_info_baileys → jalankan bot → scan QR.");
        return;
      }

      if (!RECONNECT_ENABLED) {
        console.log("Reconnect dimatikan (RECONNECT_ENABLED=false).");
        return;
      }

      reconnectAttempt++;
      const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt - 1));
      console.log(`⚠️ Terputus. Reconnect coba lagi dalam ${Math.round(delay / 1000)} detik...`);

      setTimeout(() => {
        startBot().catch((e) => logError("Auto-reconnect error", e));
      }, delay);
    }
  });

  // ===== MESSAGE HANDLER =====
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    try {
      if (!messages || !messages[0]) return;
      if (type && type !== "notify") {
        debug("SKIP: messages.upsert type bukan notify:", type);
        return;
      }

      const msg = messages[0];
      if (!msg.message) {
        debug("SKIP: msg.message kosong (mungkin history sync)");
        return;
      }
      if (msg.key.fromMe) {
        debug("SKIP: pesan dari bot sendiri");
        return;
      }

      const jidRaw = msg.key.remoteJid || "";
      const jid = normalizeJidForCompare(jidRaw);

      const isStatus = jid === "status@broadcast" || jid.endsWith("@broadcast");
      const isGroup = jid.endsWith("@g.us");
      const isIndividu = jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid") || jid.endsWith("@c.us");

      if (isStatus) return;
      if (isGroup) return;
      if (PRIVATE_CHAT_ONLY && !isIndividu) return;

      const ex = isExcludedMessage(msg);
      if (ex.ok) {
        debug("SKIP: EXCLUDED ->", ex.why, ex.hit, "| remoteJid:", jid);
        return;
      }

      let rawText =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        "";

      if (!rawText || !rawText.trim()) return;

      const lowerText = rawText.toLowerCase().trim();
      debug("Pesan masuk:", jid, "| text:", lowerText);

      // ✅ intent/ignore (fix kata utuh + deteksi produk di kalimat)
      const waName = msg.pushName || "";

      const isIgnore =
        BUYER_IGNORE_KEYWORDS.length ? textHasAnyKeyword(lowerText, BUYER_IGNORE_KEYWORDS) : false;

      if (!isIgnore) {
        const foundProduct = detectProductInText(lowerText);
        const mentionProduct = !!foundProduct;
        const mentionIntent =
          BUYER_INTENT_KEYWORDS.length ? textHasAnyKeyword(lowerText, BUYER_INTENT_KEYWORDS) : false;
        const mentionPay = hasKeyword(lowerText, "qris") || (ACCEPT_BAYAR_ALIAS && hasKeyword(lowerText, "bayar"));

        const shouldLog = BUYER_INTENT_ONLY ? (mentionProduct || mentionIntent || mentionPay) : true;

        if (shouldLog) {
          logNewBuyerIfNeeded(jid, waName, rawText.trim());
        } else {
          debug("Buyer tidak dicatat (bukan intent):", jid);
        }
      } else {
        debug("Buyer tidak dicatat (ignore keyword):", jid);
      }

      // 0) order/menu/catalog -> always send catalog
      if (["order", "menu", "catalog"].includes(lowerText)) {
        await sendSmart(jid, { text: getCatalogText() });
        return;
      }

      // 1) qris (+ optional bayar)
      if (lowerText === "qris" || (ACCEPT_BAYAR_ALIAS && lowerText === "bayar")) {
        try {
          const buffer = fs.readFileSync("./qris.png");
          await sendSmart(jid, {
            image: buffer,
            caption: "Silakan scan QRIS ini untuk pembayaran 😊\n\nSetelah bayar, kirim bukti pembayaran ya.",
          });
        } catch (e) {
          logError("Gagal mengirim qris.png", e);
          await sendSmart(jid, { text: "QRIS tidak bisa dikirim. Pastikan file *qris.png* ada di folder bot." });
        }
        return;
      }

      // 2) produk / alias (kalau user ketik persis)
      if (products[lowerText]) {
        const p = products[lowerText];
        const icon = p.icon || "📦";
        await sendSmart(jid, {
          text: `${icon} *${p.name}*\n\n${p.description}\n\nKetik *QRIS* untuk payment 🙏😊.`,
        });
        return;
      }

      // 2.2) produk disebut di kalimat -> tetap balas detail produk
      const pInSentence = detectProductInText(lowerText);
      if (pInSentence) {
        const icon = pInSentence.icon || "📦";
        await sendSmart(jid, {
          text: `${icon} *${pInSentence.name}*\n\n${pInSentence.description}\n\nKetik *QRIS* untuk payment 🙏😊.`,
        });
        return;
      }

      // 2.5) suggestion typo
      const suggestion = findBestProductSuggestion(lowerText);
      if (suggestion) {
        await sendSmart(jid, {
          text:
            `⚠️ Produk *"${rawText.trim()}"* tidak ditemukan.\n\n` +
            `Mungkin maksud kamu *${suggestion.name}* ?\n` +
            `Ketik: *${suggestion.mainKey}* untuk melihat detail paket.`,
        });
        return;
      }

      // 3) lainnya -> catalog jika lewat cooldown
      const now = Date.now();
      const last = lastCatalogSent[jid] || 0;

      if (last === 0 || now - last >= COOLDOWN_CATALOG_MS) {
        lastCatalogSent[jid] = now;
        saveCooldown();
        await sendSmart(jid, { text: getCatalogText() });
      } else {
        debug("Dalam cooldown catalog -> diam:", jid);
      }
    } catch (e) {
      logError("Error di messages.upsert", e);
    }
  });

  return sock;
}

// RUN
startBot().catch((e) => logError("Fatal startBot error", e));
