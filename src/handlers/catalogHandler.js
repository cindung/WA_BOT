/**
 * Catalog Handler - Handles menu/catalog trigger
 */

const { enqueue } = require("../queue");
const { canSendCommand, markCommandSent } = require("../cooldown");
const { MENU_COOLDOWN_MS } = require("../config");
const { CMD_KEYS } = require("../constants");

function getCatalogText() {
    const txt = process.env.CATALOG_TEXT;
    return txt && txt.trim() ? txt.trim() : "CATALOG_TEXT belum di-set di .env";
}

async function handleCatalog(sock, jid) {
    if (!canSendCommand(jid, CMD_KEYS.CATALOG, MENU_COOLDOWN_MS)) {
        return false;
    }

    await enqueue(() => sock.sendMessage(jid, { text: getCatalogText() }));
    markCommandSent(jid, CMD_KEYS.CATALOG);
    return true;
}

module.exports = {
    handleCatalog,
    getCatalogText,
};

