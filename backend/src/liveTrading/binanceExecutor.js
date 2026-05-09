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
    this._marketsPromise = null;
  }

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

    this._spotClient = new ccxt.binance({ ...baseConfig, options: { defaultType: 'spot' } });
    if (testnet) {
      this._spotClient.urls['api']['public'] = 'https://testnet.binance.vision/api';
      this._spotClient.urls['api']['private'] = 'https://testnet.binance.vision/api';
    }

    this._futuresClient = new ccxt.binance({ ...baseConfig, options: { defaultType: 'future' } });
    if (testnet) {
      this._futuresClient.urls['api']['fapiPublic'] = 'https://testnet.binancefuture.com/fapi';
      this._futuresClient.urls['api']['fapiPrivate'] = 'https://testnet.binancefuture.com/fapi';
    }

    this._initialized = true;
    console.log(`[BinanceExecutor] Initialized — ${testnet ? 'TESTNET' : 'LIVE'}`);
  }

  _client(strategyId) {
    if (!this._initialized) throw new Error('BinanceExecutor not initialized');
    return FUTURES_STRATEGIES.has(Number(strategyId)) ? this._futuresClient : this._spotClient;
  }

  async _ensureMarkets() {
    if (!this._marketsPromise) {
      this._marketsPromise = Promise.all([
        this._spotClient.loadMarkets().catch(() => {}),
        this._futuresClient.loadMarkets().catch(() => {}),
      ]);
    }
    return this._marketsPromise;
  }

  _normalizeSymbol(symbol) {
    return symbol.replace(':USDT', '').replace('USDTUSDT', 'USDT');
  }

  async placeOrder(symbol, side, amountUSDT, orderType = 'market', price = null, strategyId = 1) {
    try {
      if (this._testnet) {
        // ── Manual Signing Logic (Mirroring Python hmac + alphabetical sort) ──
        const crypto = require('crypto');
        const axios = require('axios');
        const isFutures = FUTURES_STRATEGIES.has(Number(strategyId));
        
        // Host selection
        const host = isFutures ? 'https://demo-fapi.binance.com' : 'https://demo-api.binance.com';
        const endpoint = isFutures ? '/fapi/v1/order' : '/api/v3/order';
        const timeEndpoint = isFutures ? '/fapi/v1/time' : '/api/v3/time';
        const tickerEndpoint = isFutures ? '/fapi/v1/ticker/price' : '/api/v3/ticker/price';

        // 1. Sync Time
        const timeRes = await axios.get(`${host}${timeEndpoint}`);
        const ts = timeRes.data.serverTime;

        // 2. Ticker
        const tickerRes = await axios.get(`${host}${tickerEndpoint}?symbol=${symbol.replace('/', '')}`);
        const currentPrice = parseFloat(tickerRes.data.price);
        const qty = (amountUSDT / currentPrice).toFixed(5);

        // 3. Build & Alphabetically Sort Params (Python Logic)
        const params = {
          symbol: symbol.replace('/', ''),
          side: side.toUpperCase(),
          type: orderType.toUpperCase(),
          quantity: qty,
          timestamp: ts,
          recvWindow: 10000
        };
        if (orderType === 'limit' && price) {
          params.price = price;
          params.timeInForce = 'GTC';
        }

        const query = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
        const sig = crypto.createHmac('sha256', Buffer.from(this._apiSecret, 'utf8'))
                          .update(Buffer.from(query, 'utf8'))
                          .digest('hex');

        // 4. Request
        const res = await axios.post(`${host}${endpoint}?${query}&signature=${sig}`, null, {
          headers: { 'X-MBX-APIKEY': this._apiKey, 'User-Agent': baseConfig.headers['User-Agent'] }
        });
        return res.data;
      }

      await this._ensureMarkets();
      const client = this._client(strategyId);
      const sym = this._normalizeSymbol(symbol);
      const ticker = await client.fetchTicker(sym);
      const baseAmount = client.amountToPrecision(sym, amountUSDT / (ticker.last || ticker.close));
      
      const extra = isFutures ? { positionSide: 'BOTH' } : {};
      return await client.createOrder(sym, orderType, side, baseAmount, price, extra);
    } catch (err) {
      return { error: err.response?.data?.msg || err.message };
    }
  }

  async getBalance() {
    let spot = 0, futures = 0, errors = [];
    if (!this._testnet) {
      try {
        const s = await this._spotClient.fetchBalance();
        spot = s.USDT?.total ?? 0;
        const f = await this._futuresClient.fetchBalance();
        futures = f.USDT?.total ?? 0;
        return { spot, futures };
      } catch (e) { return { error: e.message }; }
    }

    const crypto = require('crypto');
    const axios = require('axios');
    const headers = { 
      'X-MBX-APIKEY': this._apiKey, 
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36' 
    };

    // Futures Demo
    try {
      const t = await axios.get('https://demo-fapi.binance.com/fapi/v1/time');
      const p = { timestamp: t.data.serverTime, recvWindow: 10000 };
      const q = Object.keys(p).sort().map(k => `${k}=${p[k]}`).join('&');
      const s = crypto.createHmac('sha256', Buffer.from(this._apiSecret, 'utf8')).update(Buffer.from(q, 'utf8')).digest('hex');
      const r = await axios.get(`https://demo-fapi.binance.com/fapi/v2/account?${q}&signature=${s}`, { headers });
      r.data.assets.forEach(a => { if (a.asset === 'USDT') futures += parseFloat(a.walletBalance); });
    } catch (e) { errors.push(`Futures: ${e.response?.data?.msg || e.message}`); }

    // Spot Demo
    try {
      const t = await axios.get('https://demo-api.binance.com/api/v3/time');
      const p = { timestamp: t.data.serverTime, recvWindow: 10000 };
      const q = Object.keys(p).sort().map(k => `${k}=${p[k]}`).join('&');
      const s = crypto.createHmac('sha256', Buffer.from(this._apiSecret, 'utf8')).update(Buffer.from(q, 'utf8')).digest('hex');
      const r = await axios.get(`https://demo-api.binance.com/api/v3/account?${q}&signature=${s}`, { headers });
      r.data.balances.forEach(b => { if (b.asset === 'USDT') spot += parseFloat(b.free) + parseFloat(b.locked); });
    } catch (e) { errors.push(`Spot: ${e.response?.data?.msg || e.message}`); }

    return errors.length > 0 ? { error: errors.join(' | ') } : { spot, futures };
  }

  async fetchOrder(id, sym, sid = 1) { try { return await this._client(sid).fetchOrder(id, this._normalizeSymbol(sym)); } catch (e) { return { error: e.message }; } }
  async cancelOrder(id, sym, sid = 1) { try { return await this._client(sid).cancelOrder(id, this._normalizeSymbol(sym)); } catch (e) { return { error: e.message }; } }
  isReady() { return this._initialized; }
  destroy() { this._spotClient = this._futuresClient = null; this._initialized = false; }
}

module.exports = new BinanceExecutor();
