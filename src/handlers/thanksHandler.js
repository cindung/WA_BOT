/**
 * Thanks Handler - Auto reply for thank you messages
 * Returns: true (sent), false (cooldown or not matched)
 */

const { enqueue } = require("../queue");
const { canSendCommand, markCommandSent } = require("../cooldown");
const { THANKS_TRIGGERS, THANKS_REPLY, THANKS_COOLDOWN_MS } = require("../config");

const THANKS_CMD_KEY = "thanks";

/**
 * Check if text contains any thanks trigger
 */
function containsThanksTrigger(lowerText) {
    return THANKS_TRIGGERS.some(trigger => lowerText.includes(trigger));
}

/**
 * Handle thanks auto-reply
 */
async function handleThanks(sock, jid, lowerText) {
    // Check if text contains thanks trigger
    if (!containsThanksTrigger(lowerText)) {
        return false;
    }

    // Check cooldown
    if (!canSendCommand(jid, THANKS_CMD_KEY, THANKS_COOLDOWN_MS)) {
        return "cooldown";
    }

    // Send thanks reply
    await enqueue(() => sock.sendMessage(jid, { text: THANKS_REPLY }));
    markCommandSent(jid, THANKS_CMD_KEY);
    return true;
}

module.exports = {
    handleThanks,
    containsThanksTrigger,
};
