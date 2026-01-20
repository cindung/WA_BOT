/**
 * Exclude Handler - Owner command to exclude/unexclude numbers
 * 
 * Usage:
 * - Reply to a message and type "exclude" to add that sender to exclude list
 * - Type "listexclude" to see all excluded JIDs
 */

const fs = require("fs");
const path = require("path");
const { enqueue } = require("../queue");
const { isOwnerMessage } = require("./saveqrisHandler");

// File to store runtime excludes (these persist across restarts)
const RUNTIME_EXCLUDE_FILE = path.join(__dirname, "..", "..", "runtime_exclude.json");

// Runtime exclude set (loaded at startup, modified by commands)
let runtimeExcludedJids = new Set();

/**
 * Load runtime excludes from file
 */
function loadRuntimeExcludes() {
    try {
        if (fs.existsSync(RUNTIME_EXCLUDE_FILE)) {
            const data = JSON.parse(fs.readFileSync(RUNTIME_EXCLUDE_FILE, "utf8"));
            runtimeExcludedJids = new Set(data.excludedJids || []);
        }
    } catch (e) {
        console.error("[EXCLUDE] Failed to load runtime excludes:", e);
        runtimeExcludedJids = new Set();
    }
}

/**
 * Save runtime excludes to file
 */
function saveRuntimeExcludes() {
    try {
        const data = {
            excludedJids: [...runtimeExcludedJids],
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(RUNTIME_EXCLUDE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("[EXCLUDE] Failed to save runtime excludes:", e);
    }
}

/**
 * Check if JID is in runtime exclude list
 */
function isRuntimeExcluded(jid) {
    return runtimeExcludedJids.has(jid);
}

/**
 * Get sender JID from quoted message
 */
function getQuotedSenderJid(msg) {
    // Check for quoted message in extendedTextMessage
    const contextInfo = msg?.message?.extendedTextMessage?.contextInfo;
    if (contextInfo?.participant) {
        return contextInfo.participant;
    }
    if (contextInfo?.remoteJid) {
        return contextInfo.remoteJid;
    }
    return null;
}

/**
 * Handle exclude command - add sender of quoted message to exclude list
 */
async function handleExcludeCommand(sock, msg, jid) {
    const ownerOk = isOwnerMessage(msg, sock.user);

    if (!ownerOk) {
        await enqueue(() =>
            sock.sendMessage(jid, {
                text: "❌ Kamu bukan OWNER. Hanya owner yang bisa exclude nomor.",
            })
        );
        return false;
    }

    // Get quoted message sender
    const quotedJid = getQuotedSenderJid(msg);

    if (!quotedJid) {
        await enqueue(() =>
            sock.sendMessage(jid, {
                text: "❌ Tidak ada pesan yang di-reply.\n\n" +
                    "*Cara pakai:*\n" +
                    "1) Reply pesan dari nomor yang mau di-exclude\n" +
                    "2) Ketik: *exclude*",
            })
        );
        return false;
    }

    // Add to runtime exclude
    runtimeExcludedJids.add(quotedJid);
    saveRuntimeExcludes();

    await enqueue(() =>
        sock.sendMessage(jid, {
            text: `✅ Berhasil exclude!\n\n` +
                `*JID:* ${quotedJid}\n\n` +
                `Nomor ini tidak akan dibalas bot lagi.\n` +
                `Ketik *listexclude* untuk lihat daftar.`,
        })
    );

    return quotedJid;
}

/**
 * Handle unexclude command - remove from exclude list
 */
async function handleUnexcludeCommand(sock, msg, jid) {
    const ownerOk = isOwnerMessage(msg, sock.user);

    if (!ownerOk) {
        await enqueue(() =>
            sock.sendMessage(jid, {
                text: "❌ Kamu bukan OWNER.",
            })
        );
        return false;
    }

    const quotedJid = getQuotedSenderJid(msg);

    if (!quotedJid) {
        await enqueue(() =>
            sock.sendMessage(jid, {
                text: "❌ Reply pesan dari nomor yang mau di-unexclude.",
            })
        );
        return false;
    }

    if (!runtimeExcludedJids.has(quotedJid)) {
        await enqueue(() =>
            sock.sendMessage(jid, {
                text: `❌ JID tidak ada di daftar exclude:\n${quotedJid}`,
            })
        );
        return false;
    }

    runtimeExcludedJids.delete(quotedJid);
    saveRuntimeExcludes();

    await enqueue(() =>
        sock.sendMessage(jid, {
            text: `✅ Berhasil unexclude!\n\n*JID:* ${quotedJid}`,
        })
    );

    return true;
}

/**
 * Handle listexclude command - show all excluded JIDs
 */
async function handleListExcludeCommand(sock, msg, jid) {
    const ownerOk = isOwnerMessage(msg, sock.user);

    if (!ownerOk) {
        await enqueue(() =>
            sock.sendMessage(jid, {
                text: "❌ Kamu bukan OWNER.",
            })
        );
        return false;
    }

    const list = [...runtimeExcludedJids];

    if (list.length === 0) {
        await enqueue(() =>
            sock.sendMessage(jid, {
                text: "📋 *Daftar Exclude (Runtime)*\n\n_Belum ada nomor yang di-exclude._\n\nReply pesan + ketik *exclude* untuk menambah.",
            })
        );
        return true;
    }

    const formatted = list.map((j, i) => `${i + 1}. ${j}`).join("\n");

    await enqueue(() =>
        sock.sendMessage(jid, {
            text: `📋 *Daftar Exclude (Runtime)*\n\n${formatted}\n\n_Total: ${list.length} nomor_`,
        })
    );

    return true;
}

// Load on module init
loadRuntimeExcludes();

module.exports = {
    handleExcludeCommand,
    handleUnexcludeCommand,
    handleListExcludeCommand,
    isRuntimeExcluded,
    loadRuntimeExcludes,
};
