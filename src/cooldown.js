/**
 * Cooldown - Cooldown management with debounced writes
 * Uses single cooldown.json file with prefixed keys:
 * - cmd:catalog, cmd:qris, cmd:thanks (command cooldowns)
 * - prod:netflix, prod:canva (product cooldowns)
 */

const fs = require("fs");
const { PRODUCT_COOLDOWN_MS } = require("./config");

const COOLDOWN_FILE = "cooldown.json";

// Single cooldown object: { jid: { "cmd:catalog": timestamp, "prod:netflix": timestamp } }
let cooldownData = {};

// Debounce configuration
const DEBOUNCE_MS = 5000;
let pendingSave = false;

// Load cooldowns from disk
function loadCooldowns() {
    try {
        if (fs.existsSync(COOLDOWN_FILE)) {
            cooldownData = JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));
        }
    } catch {
        cooldownData = {};
    }
}

// Debounced save
function saveCooldown() {
    if (pendingSave) return;
    pendingSave = true;
    setTimeout(() => {
        try {
            fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldownData, null, 2));
        } catch { }
        pendingSave = false;
    }, DEBOUNCE_MS);
}

// Force save immediately (used for graceful shutdown)
function forceSaveCooldowns() {
    try {
        fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(cooldownData, null, 2));
    } catch { }
}

// Command cooldown functions
function canSendCommand(jid, cmdKey, cooldownMs) {
    const now = Date.now();
    const key = `cmd:${cmdKey}`;
    const byJid = cooldownData[jid] || {};
    const last = byJid[key] || 0;
    if (!last) return true;
    return now - last >= cooldownMs;
}

function markCommandSent(jid, cmdKey) {
    const now = Date.now();
    const key = `cmd:${cmdKey}`;
    if (!cooldownData[jid]) cooldownData[jid] = {};
    cooldownData[jid][key] = now;
    saveCooldown();
}

// Product cooldown functions
function canSendProduct(jid, productMainKey) {
    const now = Date.now();
    const key = `prod:${productMainKey}`;
    const byJid = cooldownData[jid] || {};
    const last = byJid[key] || 0;
    if (!last) return true;
    return now - last >= PRODUCT_COOLDOWN_MS;
}

function markProductSent(jid, productMainKey) {
    const now = Date.now();
    const key = `prod:${productMainKey}`;
    if (!cooldownData[jid]) cooldownData[jid] = {};
    cooldownData[jid][key] = now;
    saveCooldown();
}

// Initialize on module load
loadCooldowns();

module.exports = {
    loadCooldowns,
    forceSaveCooldowns,
    canSendCommand,
    markCommandSent,
    canSendProduct,
    markProductSent,
};

