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
      // Official Demo Mode URLs (from Binance Docs)
      this._spotClient.urls['api']['public'] = 'https://demo-api.binance.com/api';
      this._spotClient.urls['api']['private'] = 'https://demo-api.binance.com/api';
    }

    // ── Futures client ───────────────────────────────────────────────────────
    this._futuresClient = new ccxt.binance({
      ...baseConfig,
      options: { defaultType: 'future' }
    });

    if (testnet) {
      // Official Demo Mode URLs for Futures
      this._futuresClient.urls['api']['fapiPublic'] = 'https://demo-fapi.binance.com/fapi';
      this._futuresClient.urls['api']['fapiPrivate'] = 'https://demo-fapi.binance.com/fapi';
      this._futuresClient.urls['api']['public'] = 'https://demo-fapi.binance.com/fapi';
      this._futuresClient.urls['api']['private'] = 'https://demo-fapi.binance.com/fapi';
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
      if (this._testnet) {
        // ── Demo Mode Manual Order Placement ────────────────────────────────
        const crypto = require('crypto');
        const axios = require('axios');
        const isFutures = FUTURES_STRATEGIES.has(Number(strategyId));
        const host = isFutures ? 'https://demo-fapi.binance.com' : 'https://demo-api.binance.com';
        const endpoint = isFutures ? '/fapi/v1/order' : '/api/v3/order';
        const timeEndpoint = isFutures ? '/fapi/v1/time' : '/api/v3/time';
        const tickerEndpoint = isFutures ? '/fapi/v1/ticker/price' : '/api/v3/ticker/price';
        
        // 1. Sync Time (Specific to Host)
        const timeRes = await axios.get(`${host}${timeEndpoint}`);
        const ts = timeRes.data.serverTime;
        
        // 2. Fetch Price for Quantity Calculation
        const tickerRes = await axios.get(`${host}${tickerEndpoint}?symbol=${symbol.replace('/', '')}`);
        const currentPrice = parseFloat(tickerRes.data.price);
        let qty = (amountUSDT / currentPrice).toFixed(5); 
        
        // 3. Build Query
        let query = `symbol=${symbol.replace('/', '')}&side=${side.toUpperCase()}&type=${orderType.toUpperCase()}&quantity=${qty}&timestamp=${ts}&recvWindow=10000`;
        if (orderType === 'limit' && price) query += `&price=${price}&timeInForce=GTC`;

        
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
        
        // 4. POST Order
        const res = await axios.post(`${host}${endpoint}?${query}&signature=${signature}`, null, {
          headers: { 
            'X-MBX-APIKEY': this._apiKey,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
          }
        });
        
        console.log(`[BinanceExecutor] ✅ Demo Order placed: ${res.data.orderId || res.data.id}`);
        return res.data;
      }

      // ── Live Mode (Standard CCXT) ──────────────────────────────────────────
      await this._ensureMarkets();
      const client = this._client(strategyId);
      const sym = this._normalizeSymbol(symbol);
      const ticker = await client.fetchTicker(sym);
      const currentPrice = ticker.last || ticker.close;
      let baseAmount = amountUSDT / currentPrice;

      if (client.markets && client.markets[sym]) {
        baseAmount = client.amountToPrecision(sym, baseAmount);
      }

      const params = {};
      if (FUTURES_STRATEGIES.has(Number(strategyId))) {
        try { await client.setLeverage(5, sym); } catch (_) {}
        params.positionSide = 'BOTH';
      }

      let order;
      if (orderType === 'limit' && price) {
        const precPrice = client.markets?.[sym] ? client.priceToPrecision(sym, price) : price;
        order = await client.createOrder(sym, 'limit', side, baseAmount, precPrice, params);
      } else {
        order = await client.createOrder(sym, 'market', side, baseAmount, undefined, params);
      }

      return order;
    } catch (err) {
      const msg = err.response?.data?.msg || err.message;
      console.error(`[BinanceExecutor] ❌ placeOrder failed: ${msg}`);
      return { error: msg };
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

    // ── Demo Mode (Manual Sync + V2) ──────────────────────────────────────
    try {
      const crypto = require('crypto');
      const axios = require('axios');
      
      // DEBUG: Verify keys are decrypted correctly in production logs
      console.log(`[BinanceExecutor] Debugging Demo Connection...`);
      console.log(`[BinanceExecutor] Key: ${this._apiKey?.slice(0, 4)}****`);
      console.log(`[BinanceExecutor] Secret: ${this._apiSecret?.slice(0, 4)}****`);

      const commonHeaders = { 
        'X-MBX-APIKEY': this._apiKey,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
      };

      // 1. Fetch Futures Demo Balance
      try {
        const fTimeRes = await axios.get('https://demo-fapi.binance.com/fapi/v1/time');
        const fTs = fTimeRes.data.serverTime;
        const fQuery = `timestamp=${fTs}&recvWindow=10000`;
        const fSig = crypto.createHmac('sha256', Buffer.from(this._apiSecret, 'utf8'))
                           .update(Buffer.from(fQuery, 'utf8'))
                           .digest('hex');
        
        const futRes = await axios.get(`https://demo-fapi.binance.com/fapi/v2/account?${fQuery}&signature=${fSig}`, { 
          headers: commonHeaders, 
          timeout: 10000 
        });

        
        futRes.data.assets.forEach(a => {
          const val = parseFloat(a.walletBalance || 0);
          if (a.asset === 'USDT') futures += val;
          else if (val > 0) spot += val; // Collateral
        });
      } catch (fe) {
        const msg = fe.response?.data?.msg || fe.message;
        errors.push(`Futures Demo: ${msg}`);
      }

      // 2. Fetch Spot Demo Balance (Sync with Spot Time)
      try {
        const sTimeRes = await axios.get('https://demo-api.binance.com/api/v3/time');
        const sTs = sTimeRes.data.serverTime;
        const sQuery = `timestamp=${sTs}&recvWindow=10000`;
        const sSig = crypto.createHmac('sha256', Buffer.from(this._apiSecret, 'utf8'))
                           .update(Buffer.from(sQuery, 'utf8'))
                           .digest('hex');
        
        const spotRes = await axios.get(`https://demo-api.binance.com/api/v3/account?${sQuery}&signature=${sSig}`, { 
          headers: commonHeaders, 
          timeout: 10000 
        });

        
        spotRes.data.balances.forEach(b => {
          const free = parseFloat(b.free || 0);
          const locked = parseFloat(b.locked || 0);
          if (free > 0 || locked > 0) {
            if (b.asset === 'USDT') spot += (free + locked); // Simplified summing for USDT
            else if (free > 0) spot += free; 
          }
        });
      } catch (se) {
        const msg = se.response?.data?.msg || se.message;
        errors.push(`Spot Demo: ${msg}`);
      }

    } catch (e) {
      errors.push(`Demo Mode Critical: ${e.message}`);
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
