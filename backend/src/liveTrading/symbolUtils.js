'use strict';

/**
 * Normalizes a trading symbol for Binance (Spot and Futures).
 * Handles:
 *  - Stripping '/', ':', and extra 'USDT'
 *  - Adding '1000' prefix for certain futures tokens (SHIB, PEPE, BONK, FLOKI)
 */
function normalizeSymbol(symbol, isFutures = false) {
  if (!symbol) return '';
  
  // 1. Basic cleaning: BTC/USDT -> BTCUSDT, BTC:USDT -> BTCUSDT
  let normalized = symbol.toUpperCase()
    .replace(/\//g, '')
    .replace(/:/g, '')
    .replace(/USDTUSDT/g, 'USDT');

  // 2. Futures-specific mapping (1000x tokens)
  if (isFutures) {
    const specialTokens = ['SHIB', 'PEPE', 'BONK', 'FLOKI'];
    for (const token of specialTokens) {
      if (normalized === `${token}USDT` && !normalized.startsWith('1000')) {
        normalized = `1000${normalized}`;
      }
    }
  }

  return normalized;
}

module.exports = {
  normalizeSymbol
};
