/**
 * Product Handler - Handles product queries
 * Returns: true (sent), "cooldown" (cooldown active), false (no match)
 */

const { enqueue } = require("../queue");
const { canSendProduct, markProductSent } = require("../cooldown");
const { getProduct, detectProductInText } = require("../products");

async function handleProduct(sock, jid, lowerText) {
    // Exact match
    const exactProduct = getProduct(lowerText);
    if (exactProduct) {
        if (!canSendProduct(jid, exactProduct.mainKey)) {
            return "cooldown";
        }

        await enqueue(() =>
            sock.sendMessage(jid, { text: `${exactProduct.icon} *${exactProduct.name}*\n\n${exactProduct.description}` })
        );
        markProductSent(jid, exactProduct.mainKey);
        return true;
    }

    // Match in sentence (partial match)
    const pInSentence = detectProductInText(lowerText);
    if (pInSentence) {
        if (!canSendProduct(jid, pInSentence.mainKey)) {
            return "cooldown";
        }

        await enqueue(() =>
            sock.sendMessage(jid, { text: `${pInSentence.icon} *${pInSentence.name}*\n\n${pInSentence.description}` })
        );
        markProductSent(jid, pInSentence.mainKey);
        return true;
    }

    return false;
}

module.exports = {
    handleProduct,
};

