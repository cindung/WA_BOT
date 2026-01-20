/**
 * Utils - Helper functions
 */

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

function dbgLine(tag, msg) {
    debug(`[${tag}] ${msg}`);
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

// Normalization functions
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
    const noDevice = left.split(":")[0];
    return (noDevice || "").replace(/\D/g, "");
}

function normalizeJidForCompare(jid) {
    if (!jid) return "";
    const j = jid.trim();
    if (j.toLowerCase().endsWith("@c.us")) return j.replace(/@c\.us$/i, "@s.whatsapp.net");
    return j;
}

function addJidVariants(set, jid) {
    if (!jid) return;
    const j = jid.trim();

    // Add original
    set.add(j);
    set.add(normalizeJidForCompare(j));

    // Extract digits only for comparison
    const digits = digitsFromJid(j);
    if (digits) {
        // Add all possible formats with these digits
        set.add(digits + "@s.whatsapp.net");
        set.add(digits + "@c.us");
        set.add(digits + "@lid");
        // Also add normalized Indonesian format if applicable
        const normalized = normalizeIndoNumberDigits(digits);
        if (normalized && normalized !== digits) {
            set.add(normalized + "@s.whatsapp.net");
            set.add(normalized + "@c.us");
            set.add(normalized + "@lid");
        }
    }

    // Handle @s.whatsapp.net <-> @c.us conversion
    if (j.toLowerCase().endsWith("@s.whatsapp.net")) {
        set.add(j.replace(/@s\.whatsapp\.net$/i, "@c.us"));
    }
    if (j.toLowerCase().endsWith("@c.us")) {
        set.add(j.replace(/@c\.us$/i, "@s.whatsapp.net"));
    }
}

// Random delay for rate limiting
function randomDelay(min, max) {
    if (max <= min) return min;
    return Math.floor(min + Math.random() * (max - min));
}

// Extract text from message (more complete)
function extractTextFromMessage(message) {
    if (!message) return "";

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

module.exports = {
    pad2,
    formatTimestamp,
    debug,
    dbgLine,
    sleep,
    normalizeIndoNumberDigits,
    digitsFromJid,
    normalizeJidForCompare,
    addJidVariants,
    randomDelay,
    extractTextFromMessage,
};
