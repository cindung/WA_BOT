/**
 * QRIS Handler - Handles QRIS trigger
 */

const { enqueue } = require("../queue");
const { canSendCommand, markCommandSent } = require("../cooldown");
const { getQrisTemplate, getQrisImageBuffer } = require("../cache");
const { sleep } = require("../utils");
const { logError } = require("../logger");
const { QRIS_COOLDOWN_MS, GLOBAL_QRIS_MEDIA_GAP_MS, QRIS_IMAGE_CAPTION } = require("../config");
const { CMD_KEYS } = require("../constants");

// Anti-burst global
let lastGlobalQrisMediaAt = 0;

async function handleQris(sock, jid) {
    if (!canSendCommand(jid, CMD_KEYS.QRIS, QRIS_COOLDOWN_MS)) {
        return false;
    }

    const now = Date.now();
    const diff = now - lastGlobalQrisMediaAt;
    if (diff < GLOBAL_QRIS_MEDIA_GAP_MS) await sleep(GLOBAL_QRIS_MEDIA_GAP_MS - diff);

    // LAYER 1: relay template catalog
    try {
        const template = getQrisTemplate();
        if (!template?.productMessage) throw new Error("Template belum ada");

        await enqueue(() => sock.relayMessage(jid, template, { messageId: sock.generateMessageTag() }));
        lastGlobalQrisMediaAt = Date.now();
        markCommandSent(jid, CMD_KEYS.QRIS);
        return true;
    } catch (e1) {
        // Fallback to image
    }

    // LAYER 2: fallback qris.png (cached)
    try {
        const buffer = getQrisImageBuffer();
        if (!buffer) throw new Error("QRIS image not found");

        await enqueue(() =>
            sock.sendMessage(jid, {
                image: buffer,
                caption: QRIS_IMAGE_CAPTION,
            })
        );
        lastGlobalQrisMediaAt = Date.now();
        markCommandSent(jid, CMD_KEYS.QRIS);
        return true;
    } catch (e2) {
        logError("Gagal mengirim QRIS (template & gambar)", e2);
        await enqueue(() => sock.sendMessage(jid, { text: "QRIS tidak bisa dikirim. Pastikan *qris.png* ada di folder bot." }));
        markCommandSent(jid, CMD_KEYS.QRIS);
        return false;
    }
}

module.exports = {
    handleQris,
};

