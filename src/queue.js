/**
 * Queue - Message queue system with rate limiting
 */

const { sleep, randomDelay } = require("./utils");
const { logError } = require("./logger");
const { RATE_ENABLED, RATE_MIN_MS, RATE_MAX_MS } = require("./config");

const queue = [];
let sending = false;

async function processQueue() {
    if (sending) return;
    sending = true;

    while (queue.length) {
        const job = queue.shift();
        try {
            if (RATE_ENABLED) await sleep(randomDelay(RATE_MIN_MS, RATE_MAX_MS));
            await job.fn();
            job.resolve();
        } catch (e) {
            logError("Gagal kirim pesan", e);
            job.reject(e);
        }
    }

    sending = false;
}

function enqueue(fn) {
    return new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject });
        processQueue();
    });
}

module.exports = {
    enqueue,
};
