/**
 * Logger - Error logging module
 */

const fs = require("fs");
const path = require("path");
const { PATHS } = require("./constants");

const LOG_DIR = path.join(__dirname, "..", PATHS.LOG_DIR);
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, PATHS.ERROR_LOG);

function logError(message, err) {
    const time = new Date().toISOString();
    let log = `[${time}] ${message}\n`;
    if (err?.stack) log += err.stack;
    else if (err) {
        try {
            log += JSON.stringify(err, null, 2);
        } catch {
            log += String(err);
        }
    }
    log += "\n\n";
    try {
        fs.appendFileSync(LOG_FILE, log, "utf8");
    } catch (e) {
        console.error("Gagal tulis error.log:", e);
    }
    console.error(message, err || "");
}

// Setup global error handlers
function setupErrorHandlers() {
    process.on("unhandledRejection", (reason) => logError("Unhandled Rejection", reason));
    process.on("uncaughtException", (err) => logError("Uncaught Exception", err));
}

module.exports = {
    logError,
    setupErrorHandlers,
};
