'use strict';

/**
 * binanceExecutor.js
 * ==================
 * CCXT-powered Binance execution layer.
 * Handles both Spot (strategies 1 & 2) and Futures (strategy 3).
 *
 * Supports live and testnet modes.
 * All methods are safe to call — errors are caught and returned as { error }.
 */

const ccxt = require('ccxt');

// Strategy 3 is futures, 1 & 2 are spot
const FUTURES_STRATEGIES = new Set([3]);

class BinanceExecutor {
  constructor() {
    this._spotClient = null;
    this._futuresClient = null;
    this._testnet = true;
    this._initialized = false;
    this._marketsPromise = null; // Prevents concurrent double market-loads
  }

  // ─── Initialization ──────────────────────────────────────────────────────────

  /**
   * (Re)initialize CCXT clients with given credentials.
   * Call this every time config changes.
   */
  async init(apiKey, apiSecret, testnet = true) {
    this._testnet = testnet;
    this._marketsPromise = null; // Reset on re-init

    const baseConfig = {
      apiKey,
      secret: apiSecret,
      enableRateLimit: true,
      options: { defaultType: 'spot' },
    };

    // ── Spot client ──────────────────────────────────────────────────────────
    this._spotClient = new ccxt.binance({ ...baseConfig });
    if (testnet) {
      this._spotClient.setSandboxMode(true);
    }

    // ── Futures client ───────────────────────────────────────────────────────
    const futuresConfig = {
      ...baseConfig,
      options: { defaultType: 'future' },
    };
    this._futuresClient = new ccxt.binance(futuresConfig);
    if (testnet) {
      this._futuresClient.setSandboxMode(true);
    }

    this._initialized = true;
    console.log(`[BinanceExecutor] Initialized — testnet=${testnet}`);
  }

  /** Returns the correct CCXT client for the given strategyId */
  _client(strategyId) {
    if (!this._initialized) throw new Error('BinanceExecutor not initialized');
    return FUTURES_STRATEGIES.has(Number(strategyId))
      ? this._futuresClient
      : this._spotClient;
  }

  /** Load markets once — safe for concurrent calls */
  async _ensureMarkets() {
    if (!this._marketsPromise) {
      this._marketsPromise = Promise.all([
        this._spotClient.loadMarkets(),
        this._futuresClient.loadMarkets(),
      ]);
    }
    return this._marketsPromise;
  }

  /**
   * Convert a symbol from our internal format (BTC/USDT) to CCXT format.
   * For futures this stays the same, CCXT handles it.
   */
  _normalizeSymbol(symbol) {
    // Remove any :USDT suffix from futures notation
    return symbol.replace(':USDT', '').replace('USDTUSDT', 'USDT');
  }

  // ─── Core Trading Methods ─────────────────────────────────────────────────

  /**
   * Place a market or limit order.
   * @param {string} symbol   - e.g. "BTC/USDT"
   * @param {string} side     - "buy" | "sell"
   * @param {number} amountUSDT - Trade size in USDT (we convert to base qty)
   * @param {string} orderType  - "market" | "limit"
   * @param {number|null} price - Required for limit orders
   * @param {number} strategyId - Determines spot vs futures
   * @returns {object} CCXT order object or { error }
   */
  async placeOrder(symbol, side, amountUSDT, orderType = 'market', price = null, strategyId = 1) {
    try {
      await this._ensureMarkets(strategyId);
      const client = this._client(strategyId);
      const sym = this._normalizeSymbol(symbol);

      // Get current price to compute base asset quantity
      const ticker = await client.fetchTicker(sym);
      const currentPrice = ticker.last || ticker.close;
      if (!currentPrice || currentPrice <= 0) throw new Error(`Invalid ticker price for ${sym}`);

      // Compute base asset amount (e.g. BTC amount from USDT)
      let baseAmount = amountUSDT / currentPrice;

      // Respect exchange precision
      if (client.markets && client.markets[sym]) {
        baseAmount = client.amountToPrecision(sym, baseAmount);
      }

      const params = {};

      // For futures, set leverage via API before placing order
      if (FUTURES_STRATEGIES.has(Number(strategyId))) {
        try {
          // strategy 3 uses 5x leverage by default (set in config)
          await client.setLeverage(5, sym);
        } catch (_) {/* leverage may already be set */}
        params.positionSide = 'BOTH'; // one-way mode
      }

      let order;
      if (orderType === 'limit' && price) {
        const precPrice = client.markets?.[sym]
          ? client.priceToPrecision(sym, price)
          : price;
        order = await client.createOrder(sym, 'limit', side, baseAmount, precPrice, params);
      } else {
        order = await client.createOrder(sym, 'market', side, baseAmount, undefined, params);
      }

      console.log(
        `[BinanceExecutor] ✅ Order placed | ${sym} ${side.toUpperCase()} ${baseAmount} | id=${order.id} | testnet=${this._testnet}`
      );
      return order;
    } catch (err) {
      console.error(`[BinanceExecutor] ❌ placeOrder failed: ${err.message}`);
      return { error: err.message };
    }
  }

  /**
   * Fetch USDT balance.
   * Returns { spot: number, futures: number } or { error }
   */
  async getBalance() {
    try {
      const spotBal = await this._spotClient.fetchBalance();
      let futuresBal = null;
      try {
        futuresBal = await this._futuresClient.fetchBalance();
      } catch (_) {}
      return {
        spot: spotBal?.USDT?.free ?? 0,
        futures: futuresBal?.USDT?.free ?? 0,
      };
    } catch (err) {
      console.error('[BinanceExecutor] getBalance error:', err.message);
      return { error: err.message };
    }
  }

  /**
   * Fetch a single order by ID.
   */
  async fetchOrder(orderId, symbol, strategyId = 1) {
    try {
      const client = this._client(strategyId);
      const sym = this._normalizeSymbol(symbol);
      return await client.fetchOrder(orderId, sym);
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Cancel a single order.
   */
  async cancelOrder(orderId, symbol, strategyId = 1) {
    try {
      const client = this._client(strategyId);
      const sym = this._normalizeSymbol(symbol);
      return await client.cancelOrder(orderId, sym);
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Cancel ALL open orders across spot + futures (kill-switch support).
   */
  async cancelAllOpenOrders(symbol = null) {
    const results = [];
    for (const client of [this._spotClient, this._futuresClient]) {
      if (!client) continue;
      try {
        if (symbol) {
          const sym = this._normalizeSymbol(symbol);
          const cancelled = await client.cancelAllOrders(sym);
          results.push(...(Array.isArray(cancelled) ? cancelled : [cancelled]));
        } else {
          const openOrders = await client.fetchOpenOrders();
          for (const o of openOrders) {
            try {
              const cancelled = await client.cancelOrder(o.id, o.symbol);
              results.push(cancelled);
            } catch (_) {}
          }
        }
      } catch (_) {}
    }
    return results;
  }

  /** True if executor has been initialized with credentials */
  isReady() {
    return this._initialized;
  }

  /** Destroy clients (used when config is deleted) */
  destroy() {
    this._spotClient = null;
    this._futuresClient = null;
    this._initialized = false;
    this._marketsPromise = null;
  }
}

// Export singleton
module.exports = new BinanceExecutor();
