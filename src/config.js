/**
 * Config - Environment configuration loader
 */

require("dotenv").config();
const { DEFAULTS } = require("./constants");
const { normalizeIndoNumberDigits, normalizeJidForCompare, digitsFromJid, addJidVariants } = require("./utils");

// Basic flags
const PRIVATE_CHAT_ONLY = (process.env.PRIVATE_CHAT_ONLY || DEFAULTS.PRIVATE_CHAT_ONLY).toLowerCase() === "true";
const ACCEPT_BAYAR_ALIAS = (process.env.ACCEPT_BAYAR_ALIAS || DEFAULTS.ACCEPT_BAYAR_ALIAS).toLowerCase() === "true";

// Triggers
const CATALOG_TRIGGERS = (process.env.CATALOG_TRIGGERS || DEFAULTS.CATALOG_TRIGGERS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

let QRIS_TRIGGERS = (process.env.QRIS_TRIGGERS || DEFAULTS.QRIS_TRIGGERS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

if (ACCEPT_BAYAR_ALIAS && !QRIS_TRIGGERS.includes("bayar")) QRIS_TRIGGERS.push("bayar");

// Thanks auto-reply triggers
const THANKS_TRIGGERS = (process.env.THANKS_TRIGGERS || DEFAULTS.THANKS_TRIGGERS)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const THANKS_REPLY = (process.env.THANKS_REPLY || DEFAULTS.THANKS_REPLY).trim();

// Paths
const QRIS_CATALOG_SAVED_PATH = process.env.QRIS_CATALOG_SAVED_PATH || "./qris_catalog_saved.json";

// Owner numbers (digits) & owner jids (lid / s.whatsapp.net) - PRE-NORMALIZED
const OWNER_NUMBERS_RAW = (process.env.OWNER_NUMBERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const OWNER_JIDS_RAW = (process.env.OWNER_JIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// Pre-normalized at startup for performance
const OWNER_NUMBERS_NORMALIZED = OWNER_NUMBERS_RAW.map(normalizeIndoNumberDigits);
const OWNER_JIDS_NORMALIZED = OWNER_JIDS_RAW.map(normalizeJidForCompare);

// Anti-burst global
const GLOBAL_QRIS_MEDIA_GAP_MS = parseInt(process.env.GLOBAL_QRIS_MEDIA_GAP_MS || DEFAULTS.GLOBAL_QRIS_MEDIA_GAP_MS, 10);

// Caption fallback qris.png
const QRIS_IMAGE_CAPTION = (process.env.QRIS_IMAGE_CAPTION || DEFAULTS.QRIS_IMAGE_CAPTION).trim();

// Rate limiting
let RATE_ENABLED = true;
if (process.env.RATE_LIMIT_ENABLED !== undefined) {
    RATE_ENABLED = String(process.env.RATE_LIMIT_ENABLED).toLowerCase() === "true";
} else if (process.env.RATE_ENABLED !== undefined) {
    RATE_ENABLED = String(process.env.RATE_ENABLED).toLowerCase() === "true";
}

const RATE_MIN_MS = parseInt(process.env.RATE_MIN_MS || DEFAULTS.RATE_MIN_MS, 10);
const RATE_MAX_MS = parseInt(process.env.RATE_MAX_MS || DEFAULTS.RATE_MAX_MS, 10);

// Cooldowns
const MENU_COOLDOWN_MS = parseInt(process.env.MENU_COOLDOWN_HOURS || DEFAULTS.MENU_COOLDOWN_HOURS, 10) * 60 * 60 * 1000;
const QRIS_COOLDOWN_MS = parseInt(process.env.QRIS_COOLDOWN_HOURS || DEFAULTS.QRIS_COOLDOWN_HOURS, 10) * 60 * 60 * 1000;
const PRODUCT_COOLDOWN_MS = parseInt(process.env.PRODUCT_COOLDOWN_HOURS || DEFAULTS.PRODUCT_COOLDOWN_HOURS, 10) * 60 * 60 * 1000;
const THANKS_COOLDOWN_MS = parseInt(process.env.THANKS_COOLDOWN_HOURS || DEFAULTS.THANKS_COOLDOWN_HOURS, 10) * 60 * 60 * 1000;

// Reconnect settings
const RECONNECT_ENABLED = (process.env.RECONNECT_ENABLED || DEFAULTS.RECONNECT_ENABLED).toLowerCase() === "true";
const RECONNECT_BASE_DELAY_MS = parseInt(process.env.RECONNECT_BASE_DELAY_MS || DEFAULTS.RECONNECT_BASE_DELAY_MS, 10);
const RECONNECT_MAX_DELAY_MS = parseInt(process.env.RECONNECT_MAX_DELAY_MS || DEFAULTS.RECONNECT_MAX_DELAY_MS, 10);

// Product keys
const PRODUCT_KEYS = (process.env.PRODUCT_KEYS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

module.exports = {
    PRIVATE_CHAT_ONLY,
    ACCEPT_BAYAR_ALIAS,
    CATALOG_TRIGGERS,
    QRIS_TRIGGERS,
    THANKS_TRIGGERS,
    THANKS_REPLY,
    QRIS_CATALOG_SAVED_PATH,
    OWNER_NUMBERS_RAW,
    OWNER_JIDS_RAW,
    OWNER_NUMBERS_NORMALIZED,
    OWNER_JIDS_NORMALIZED,
    GLOBAL_QRIS_MEDIA_GAP_MS,
    QRIS_IMAGE_CAPTION,
    RATE_ENABLED,
    RATE_MIN_MS,
    RATE_MAX_MS,
    MENU_COOLDOWN_MS,
    QRIS_COOLDOWN_MS,
    PRODUCT_COOLDOWN_MS,
    THANKS_COOLDOWN_MS,
    RECONNECT_ENABLED,
    RECONNECT_BASE_DELAY_MS,
    RECONNECT_MAX_DELAY_MS,
    PRODUCT_KEYS,
};

