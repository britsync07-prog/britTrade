'use strict';

/**
 * encryptionUtils.js
 * ==================
 * AES-256-GCM encryption/decryption for Binance API keys stored in DB.
 * Key is loaded from env: LIVE_TRADE_ENCRYPTION_KEY (32-char hex string = 64 hex chars)
 *
 * If the key is missing a warning is logged and a fallback dev-only key is used.
 * NEVER use the fallback in production.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const raw = process.env.LIVE_TRADE_ENCRYPTION_KEY;
  if (!raw) {
    console.warn(
      '[LiveTrading] ⚠️  LIVE_TRADE_ENCRYPTION_KEY not set. ' +
      'Using insecure fallback — set this env var in production!'
    );
    // 32-byte fallback (dev only)
    return Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex');
  }
  if (raw.length !== 64) {
    throw new Error('LIVE_TRADE_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(raw, 'hex');
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string: iv(12) + tag(16) + ciphertext
 */
function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a base64-encoded string produced by encrypt().
 */
function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const key = getEncryptionKey();
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.slice(0, IV_LENGTH);
    const tag = buf.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const data = buf.slice(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  } catch (err) {
    console.error('[encryptionUtils] Decryption failed:', err.message);
    return null;
  }
}

/**
 * Mask an API key for safe display (show first 4 + last 4 chars)
 */
function maskKey(key) {
  if (!key || key.length < 10) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

module.exports = { encrypt, decrypt, maskKey };
