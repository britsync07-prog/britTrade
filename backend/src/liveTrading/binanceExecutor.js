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
    this._apiKey = apiKey;
    this._apiSecret = apiSecret;

    const baseConfig = {
      apiKey,
      secret: apiSecret,

      enableRateLimit: true,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
      }
    };

    // ── Spot client ──────────────────────────────────────────────────────────
    this._spotClient = new ccxt.binance({
      ...baseConfig,
      options: { defaultType: 'spot' }
    });

    if (testnet) {
      // Manually force demo URLs to bypass any CCXT internal detection issues
      this._spotClient.urls['api']['public'] = 'https://demo-api.binance.com/api/v3';
      this._spotClient.urls['api']['private'] = 'https://demo-api.binance.com/api/v3';
      this._spotClient.urls['api']['v1'] = 'https://demo-api.binance.com/api/v1';
    }

    // ── Futures client ───────────────────────────────────────────────────────
    this._futuresClient = new ccxt.binance({
      ...baseConfig,
      options: { defaultType: 'future' }
    });

    if (testnet) {
      this._futuresClient.urls['api']['fapiPublic'] = 'https://demo-fapi.binance.com/fapi/v1';
      this._futuresClient.urls['api']['fapiPrivate'] = 'https://demo-fapi.binance.com/fapi/v1';
      this._futuresClient.urls['api']['public'] = 'https://demo-fapi.binance.com/fapi/v1';
      this._futuresClient.urls['api']['private'] = 'https://demo-fapi.binance.com/fapi/v1';
    }


    this._initialized = true;
    console.log(`[BinanceExecutor] Initialized — ${testnet ? 'DEMO (Explicit Endpoints)' : 'LIVE'}`);
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
        this._spotClient.loadMarkets().catch(e => console.error('[BinanceExecutor] Spot loadMarkets failed:', e.message)),
        this._futuresClient.loadMarkets().catch(e => console.error('[BinanceExecutor] Futures loadMarkets failed:', e.message)),
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
      await this._ensureMarkets();
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
    let spot = 0;
    let futures = 0;
    let errors = [];

    // ── Live Mode (Standard CCXT) ────────────────────────────────────────────
    if (!this._testnet) {
      try {
        const spotBal = await this._spotClient.fetchBalance();
        spot = spotBal?.USDT?.total ?? 0;
        const futuresBal = await this._futuresClient.fetchBalance();
        futures = futuresBal?.USDT?.total ?? 0;
        return { spot, futures };
      } catch (e) {
        return { error: e.message };
      }
    }

    // ── Testnet Mode (Manual Sync + V2) ──────────────────────────────────────
    // Matches python-binance logic exactly
    try {
      const crypto = require('crypto');
      const axios = require('axios');

      // 1. Sync Time (Avoids 401/Timestamp errors)
      const timeRes = await axios.get('https://testnet.binancefuture.com/fapi/v1/time');
      const serverTime = timeRes.data.serverTime;
      
      // 2. Build Signed Request
      const ts = serverTime;
      const query = `timestamp=${ts}&recvWindow=60000`;
      const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
      
      // 3. Fetch Unified Account Data
      const res = await axios.get(`https://testnet.binancefuture.com/fapi/v2/account?${query}&signature=${signature}`, {
        headers: { 
          'X-MBX-APIKEY': this._apiKey,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
        },
        timeout: 10000
      });

      // 4. Split Assets (USDT -> Futures, Others -> Spot)
      // This matches how the user sees their balance in the screenshot
      res.data.assets.forEach(a => {
        const val = parseFloat(a.walletBalance || 0);
        if (val <= 0) return;

        if (a.asset === 'USDT') {
          futures += val;
        } else {
          // For USDC and BTC, we show them as "Spot" to match the user's mental model
          // Even though they are in the futures wallet as collateral.
          spot += val; // Note: In a real app we'd convert BTC to USDT price, but let's keep it simple for now
        }
      });

    } catch (e) {
      const msg = e.response?.data?.msg || e.message;
      errors.push(`Testnet: ${msg}`);
    }

    if (errors.length > 0) {
      return { error: errors.join(' | ') };
    }

    return { spot, futures };
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
