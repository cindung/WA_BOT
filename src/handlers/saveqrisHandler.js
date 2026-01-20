/**
 * Saveqris Handler - Owner command to save QRIS template
 */

const { enqueue } = require("../queue");
const { saveQrisTemplate, findProductMessageAny } = require("../cache");
const { dbgLine, normalizeJidForCompare, normalizeIndoNumberDigits, digitsFromJid } = require("../utils");
const {
    OWNER_NUMBERS_RAW,
    OWNER_JIDS_RAW,
    OWNER_NUMBERS_NORMALIZED,
    OWNER_JIDS_NORMALIZED,
} = require("../config");

/**
 * Check if message is from owner
 */
function isOwnerMessage(msg, sockUser) {
    if (msg?.key?.fromMe) return true;

    const remote = normalizeJidForCompare(msg?.key?.remoteJid || "");
    const participant = normalizeJidForCompare(msg?.key?.participant || "");

    if (OWNER_JIDS_RAW.length) {
        if (OWNER_JIDS_NORMALIZED.includes(remote) || OWNER_JIDS_NORMALIZED.includes(participant)) return true;
    }

    const myId = normalizeJidForCompare(sockUser?.id || "");
    if (myId && (remote === myId || participant === myId)) return true;

    if (!OWNER_NUMBERS_RAW.length) return true;

    const rd = normalizeIndoNumberDigits(digitsFromJid(remote));
    const pd = normalizeIndoNumberDigits(digitsFromJid(participant));

    return OWNER_NUMBERS_NORMALIZED.includes(rd) || OWNER_NUMBERS_NORMALIZED.includes(pd);
}

async function handleSaveQris(sock, msg, jid) {
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
        return false;
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
        return false;
    }

    saveQrisTemplate(found.wrapper);
    await enqueue(() => sock.sendMessage(jid, { text: "✅ Berhasil! Template katalog QRIS tersimpan." }));
    return true;
}

module.exports = {
    handleSaveQris,
    isOwnerMessage,
};
