/**
 * Constants - Magic strings dan default values
 */

// JID Suffixes
const JID_SUFFIX = {
  PERSONAL: '@s.whatsapp.net',
  GROUP: '@g.us',
  C_US: '@c.us',
  LID: '@lid',
  BROADCAST: '@broadcast',
  STATUS: 'status@broadcast',
};

// Command Keys
const CMD_KEYS = {
  SAVEQRIS: 'saveqris',
  CATALOG: 'catalog',
  QRIS: 'qris',
};

// Default Environment Values
const DEFAULTS = {
  DEBUG: 'true',
  PRIVATE_CHAT_ONLY: 'true',
  ACCEPT_BAYAR_ALIAS: 'false',
  CATALOG_TRIGGERS: 'menu',
  QRIS_TRIGGERS: 'qris',
  THANKS_TRIGGERS: 'terimakasih,terima kasih,makasih,makasi,thanks,thank you,thx,tq',
  THANKS_REPLY: 'Alhamdulillah kk, dengan senang hati :)',
  THANKS_COOLDOWN_HOURS: 24,
  RATE_LIMIT_ENABLED: 'true',
  RATE_MIN_MS: 2500,
  RATE_MAX_MS: 7000,
  MENU_COOLDOWN_HOURS: 24,
  QRIS_COOLDOWN_HOURS: 24,
  PRODUCT_COOLDOWN_HOURS: 24,
  GLOBAL_QRIS_MEDIA_GAP_MS: 8000,
  RECONNECT_ENABLED: 'true',
  RECONNECT_BASE_DELAY_MS: 2000,
  RECONNECT_MAX_DELAY_MS: 30000,
  QRIS_IMAGE_CAPTION: 'Silakan scan QRIS ini untuk pembayaran 😊',
  CATEGORY_ICON_DEFAULT: '📦',
};

// File Paths
const PATHS = {
  COMMAND_COOLDOWN: 'command_cooldown.json',
  PRODUCT_COOLDOWN: 'product_cooldown.json',
  QRIS_CATALOG_SAVED: './qris_catalog_saved.json',
  QRIS_IMAGE: './qris.png',
  AUTH_INFO: './auth_info_baileys',
  LOG_DIR: 'logs',
  ERROR_LOG: 'error.log',
};

module.exports = {
  JID_SUFFIX,
  CMD_KEYS,
  DEFAULTS,
  PATHS,
};
