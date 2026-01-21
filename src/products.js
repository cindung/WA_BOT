/**
 * Products - Product management with optimized detection
 */

const { PRODUCT_KEYS } = require("./config");
const { DEFAULTS } = require("./constants");

// Boot info storage (to be printed later by wabot.js)
let bootInfo = { productCount: 0, aliasCount: 0, productList: [] };

let products = {};
let productRegex = null;

/**
 * Build products map from environment variables
 */
function buildProducts() {
    const map = {};

    if (!PRODUCT_KEYS.length) {
        return map;
    }

    for (const key of PRODUCT_KEYS) {
        const id = key.toUpperCase().replace(/\s+/g, "_");
        const descKey = `PRODUCT_${id}_TEXT`;
        const catKey = `PRODUCT_CATEGORY_${id}`;
        const aliasKey = `PRODUCT_ALIAS_${id}`;

        const desc = process.env[descKey] || "";
        if (!desc.trim()) {
            continue;
        }

        const category = (process.env[catKey] || "").trim();
        const iconKey = category ? `CATEGORY_ICON_${category.toUpperCase()}` : "";
        const icon = iconKey ? (process.env[iconKey] || "").trim() : "";

        const mainKey = key.toLowerCase();

        const productObj = {
            mainKey,
            name: key,
            description: desc.trim(),
            icon: icon || process.env.CATEGORY_ICON_DEFAULT || DEFAULTS.CATEGORY_ICON_DEFAULT,
        };

        // main key
        map[mainKey] = productObj;

        // alias keys
        const aliasRaw = (process.env[aliasKey] || "").trim();
        if (aliasRaw) {
            aliasRaw
                .split(",")
                .map((s) => s.trim().toLowerCase())
                .filter(Boolean)
                .forEach((alias) => {
                    map[alias] = productObj;
                });
        }
    }

    return map;
}

/**
 * Build regex pattern for optimized product detection
 */
function buildProductRegex(productKeys) {
    if (!productKeys.length) return null;
    // Escape regex special characters and sort by length (longest first)
    const escaped = productKeys
        .sort((a, b) => b.length - a.length)
        .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`(${escaped.join("|")})`, "i");
}

/**
 * Initialize products - call once at startup
 */
function initProducts() {
    products = buildProducts();

    // Build regex for optimized detection
    const keys = Object.keys(products);
    productRegex = buildProductRegex(keys);

    // Store boot info for later display
    const uniqueMain = Array.from(new Set(keys.map((k) => products[k]?.mainKey).filter(Boolean)));
    bootInfo = {
        productCount: uniqueMain.length,
        aliasCount: keys.length,
        productList: uniqueMain
    };
}

/**
 * Get boot info for display
 */
function getProductBootInfo() {
    return bootInfo;
}

/**
 * Get product by exact key
 */
function getProduct(key) {
    return products[key] || null;
}

/**
 * Get all products map
 */
function getAllProducts() {
    return products;
}

/**
 * Detect product in text using optimized regex (for partial matches)
 */
function detectProductInText(textLower) {
    if (!productRegex) return null;

    const match = textLower.match(productRegex);
    if (match) {
        const matchedKey = match[1].toLowerCase();
        // Don't match if the text IS the key (exact match handled separately)
        if (textLower === matchedKey) return null;
        return products[matchedKey] || null;
    }

    return null;
}

// Initialize on module load
initProducts();

module.exports = {
    initProducts,
    getProduct,
    getAllProducts,
    detectProductInText,
    getProductBootInfo,
};
