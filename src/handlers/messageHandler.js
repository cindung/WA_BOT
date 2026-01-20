/**
 * Message Handler - Main message routing
 * Clean debug output: only shows private chat messages
 */

const { JID_SUFFIX, CMD_KEYS } = require("../constants");
const {
    PRIVATE_CHAT_ONLY,
    CATALOG_TRIGGERS,
    QRIS_TRIGGERS,
} = require("../config");
const { normalizeJidForCompare, digitsFromJid, extractTextFromMessage } = require("../utils");
const { logError } = require("../logger");

const { handleCatalog } = require("./catalogHandler");
const { handleQris } = require("./qrisHandler");
const { handleProduct } = require("./productHandler");
const { handleSaveQris } = require("./saveqrisHandler");
const { handleExcludeCommand, handleUnexcludeCommand, handleListExcludeCommand, isRuntimeExcluded } = require("./excludeHandler");
const { handleThanks } = require("./thanksHandler");

/**
 * Get current time as HH:MM:SS
 */
function getTimeStamp() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * Clean log for private chat - single line with timestamp
 * Format: HH:MM:SS  number  "text"  icon result
 */
function logPrivateChat(number, text, status, detail = "") {
    const statusIcon = {
        "sent": "✓",
        "cooldown": "⏸",
        "excluded": "🚫",
        "no_match": "—",
        "owner_cmd": "⚙",
    };
    const icon = statusIcon[status] || "•";
    const shortText = text.length > 20 ? text.substring(0, 17) + "..." : text;

    // Format: timestamp  number  "text"  icon detail (full, no truncation)
    console.log(`${getTimeStamp()}  ${number.padEnd(15)}  "${shortText.padEnd(20)}"  ${icon} ${detail}`);
}


/**
 * Check if message is from excluded number/jid (runtime exclude only)
 */
function isExcludedMessage(msg) {
    const remoteJid = msg?.key?.remoteJid || "";
    const remoteJidNorm = normalizeJidForCompare(remoteJid);
    const participant = normalizeJidForCompare(msg?.key?.participant || "");

    // Check runtime excludes only
    if (isRuntimeExcluded(remoteJid) || isRuntimeExcluded(remoteJidNorm)) return true;
    if (participant && isRuntimeExcluded(participant)) return true;

    return false;
}

/**
 * Main message handler
 */
async function handleMessage(sock, messages, type) {
    try {
        if (!messages || !messages[0]) return;
        if (type && type !== "notify") return;

        const msg = messages[0];
        if (!msg.message) return;

        const rawJid = msg.key.remoteJid || "";
        const jid = normalizeJidForCompare(rawJid);
        const isStatus = jid === JID_SUFFIX.STATUS || jid.endsWith(JID_SUFFIX.BROADCAST);
        const isGroup = jid.endsWith(JID_SUFFIX.GROUP);
        const isIndividu = jid.endsWith(JID_SUFFIX.PERSONAL) || jid.endsWith(JID_SUFFIX.LID) || jid.endsWith(JID_SUFFIX.C_US);

        // SKIP: status/broadcast - no log
        if (isStatus) return;

        // SKIP: group - no log
        if (isGroup) return;

        // SKIP: not individual (if PRIVATE_CHAT_ONLY) - no log
        if (PRIVATE_CHAT_ONLY && !isIndividu) return;

        // From here: only private/individual chats
        const text = extractTextFromMessage(msg.message);
        const lowerText = (text || "").toLowerCase().trim();
        const number = digitsFromJid(rawJid) || rawJid;

        // ===== OWNER COMMANDS (processed even if fromMe) =====

        // saveqris command
        if (lowerText === CMD_KEYS.SAVEQRIS) {
            logPrivateChat(number, lowerText, "owner_cmd", "saveqris command");
            await handleSaveQris(sock, msg, jid);
            return;
        }

        // exclude command
        if (lowerText === "exclude") {
            const excludedJid = await handleExcludeCommand(sock, msg, jid);
            if (excludedJid) {
                logPrivateChat(number, lowerText, "owner_cmd", `excluded: ${excludedJid}`);
            } else {
                logPrivateChat(number, lowerText, "owner_cmd", "exclude gagal");
            }
            return;
        }

        // unexclude command
        if (lowerText === "unexclude") {
            logPrivateChat(number, lowerText, "owner_cmd", "unexclude command");
            await handleUnexcludeCommand(sock, msg, jid);
            return;
        }

        // listexclude command
        if (lowerText === "listexclude") {
            logPrivateChat(number, lowerText, "owner_cmd", "listexclude command");
            await handleListExcludeCommand(sock, msg, jid);
            return;
        }

        // SKIP: pesan dari bot sendiri - no log
        if (msg.key.fromMe) return;

        // SKIP: excluded - with log
        if (isExcludedMessage(msg)) {
            logPrivateChat(number, lowerText, "excluded", "excluded");
            return;
        }

        // SKIP: empty text - no log
        if (!lowerText) return;

        // MENU
        if (CATALOG_TRIGGERS.includes(lowerText)) {
            const result = await handleCatalog(sock, jid);
            if (result) {
                logPrivateChat(number, lowerText, "sent", "catalog terkirim");
            } else {
                logPrivateChat(number, lowerText, "cooldown", "cooldown aktif (catalog)");
            }
            return;
        }

        // QRIS
        if (QRIS_TRIGGERS.includes(lowerText)) {
            const result = await handleQris(sock, jid);
            if (result) {
                logPrivateChat(number, lowerText, "sent", "qris terkirim");
            } else {
                logPrivateChat(number, lowerText, "cooldown", "cooldown aktif (qris)");
            }
            return;
        }

        // PRODUCT
        const productResult = await handleProduct(sock, jid, lowerText);
        if (productResult === true) {
            logPrivateChat(number, lowerText, "sent", `produk terkirim: ${lowerText}`);
            return;
        } else if (productResult === "cooldown") {
            logPrivateChat(number, lowerText, "cooldown", `cooldown aktif (${lowerText})`);
            return;
        }

        // THANKS AUTO-REPLY
        const thanksResult = await handleThanks(sock, jid, lowerText);
        if (thanksResult === true) {
            logPrivateChat(number, lowerText, "sent", "thanks reply");
            return;
        } else if (thanksResult === "cooldown") {
            logPrivateChat(number, lowerText, "cooldown", "cooldown aktif (thanks)");
            return;
        }

        // NO MATCH
        logPrivateChat(number, lowerText, "no_match", "tidak dikenali");

    } catch (e) {
        logError("Error di messages.upsert", e);
    }
}

module.exports = {
    handleMessage,
    isExcludedMessage,
};

