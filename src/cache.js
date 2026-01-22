/**
 * Cache - Static resource caching
 */

const fs = require("fs");
const { PATHS } = require("./constants");
const { QRIS_CATALOG_SAVED_PATH } = require("./config");
const { logError } = require("./logger");

// Boot info storage
let cacheBootInfo = { qrisImage: false, qrisTemplate: false };

// Cached QRIS image buffer
let qrisImageBuffer = null;

// Cached QRIS template
let qrisTemplate = null;

/**
 * Initialize cache - call once at startup
 */
function initCache() {
    // Cache QRIS image
    try {
        if (fs.existsSync(PATHS.QRIS_IMAGE)) {
            qrisImageBuffer = fs.readFileSync(PATHS.QRIS_IMAGE);
            cacheBootInfo.qrisImage = true;
        }
    } catch (e) {
        logError("Failed to cache QRIS image", e);
    }

    // Cache QRIS template
    loadQrisTemplate();
}

/**
 * Get cached QRIS image buffer
 */
function getQrisImageBuffer() {
    // Return cached if available
    if (qrisImageBuffer) return qrisImageBuffer;

    // Try to load if not cached
    try {
        if (fs.existsSync(PATHS.QRIS_IMAGE)) {
            qrisImageBuffer = fs.readFileSync(PATHS.QRIS_IMAGE);
            return qrisImageBuffer;
        }
    } catch (e) {
        logError("Failed to read QRIS image", e);
    }

    return null;
}

/**
 * Load QRIS template from file
 */
function loadQrisTemplate() {
    try {
        if (!fs.existsSync(QRIS_CATALOG_SAVED_PATH)) return null;
        const raw = fs.readFileSync(QRIS_CATALOG_SAVED_PATH, "utf8");
        qrisTemplate = JSON.parse(raw) || null;
        if (qrisTemplate) {
            cacheBootInfo.qrisTemplate = true;
        }
        return qrisTemplate;
    } catch (e) {
        logError("Gagal load qris_catalog_saved.json", e);
        return null;
    }
}

/**
 * Get cached QRIS template
 */
function getQrisTemplate() {
    return qrisTemplate;
}

/**
 * Save and cache new QRIS template
 */
function saveQrisTemplate(messageObj) {
    fs.writeFileSync(QRIS_CATALOG_SAVED_PATH, JSON.stringify(messageObj, null, 2), "utf8");
    qrisTemplate = messageObj;
}

/**
 * Find product message in message object
 */
function findProductMessageAny(messageObj) {
    if (!messageObj) return null;
    if (messageObj.productMessage) return { wrapper: messageObj };

    const quoted = messageObj?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.productMessage) return { wrapper: quoted };

    return null;
}

/**
 * Get cache boot info for display
 */
function getCacheBootInfo() {
    return cacheBootInfo;
}

module.exports = {
    initCache,
    getQrisImageBuffer,
    getQrisTemplate,
    saveQrisTemplate,
    loadQrisTemplate,
    findProductMessageAny,
    getCacheBootInfo,
};
