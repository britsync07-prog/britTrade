'use strict';

/**
 * binanceExecutor.js
 * Final Auto-Detect Logic: Tries both Legacy and Demo endpoints
 */

const ccxt = require('ccxt');

const FUTURES_STRATEGIES = new Set([1, 2, 3]);

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
    this._apiKey = (apiKey || '').trim();
    this._apiSecret = (apiSecret || '').trim();

    const baseConfig = {
      apiKey: this._apiKey,
      secret: this._apiSecret,
      enableRateLimit: true,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
      }
    };

    this._spotClient = new ccxt.binance({ ...baseConfig, options: { defaultType: 'spot' } });
    this._futuresClient = new ccxt.binance({ ...baseConfig, options: { defaultType: 'future' } });

    this._initialized = true;
    console.log(`[BinanceExecutor] Initialized — ${testnet ? 'TESTNET (Auto-Detect)' : 'LIVE'}`);
  }

  async getBalance() {
    if (!this._initialized) return { error: 'Executor not initialized' };

    let spot = 0, futures = 0, errors = [];
    
    // For Live mode, use CCXT
    if (!this._testnet) {
      try {
        const s = await this._spotClient.fetchBalance();
        spot = s.USDT?.total ?? 0;
        const f = await this._futuresClient.fetchBalance();
        futures = f.USDT?.total ?? 0;
        return { spot, futures };
      } catch (e) { 
        console.error('[BinanceExecutor] Live Balance Error:', e.message);
        return { error: e.message }; 
      }
    }

    // For Testnet/Demo mode, use manual signing (CCXT is unreliable for Demo Mode)
    const crypto = require('crypto');
    const axios = require('axios');
    const headers = { 'X-MBX-APIKEY': this._apiKey, 'User-Agent': 'Mozilla/5.0' };

    // Environments to try
    const envs = [
      { 
        name: 'Legacy', 
        spot: 'https://testnet.binance.vision/api/v3', 
        fut: 'https://testnet.binancefuture.com/fapi/v2' 
      },
      { 
        name: 'Demo', 
        spot: 'https://demo-api.binance.com/api/v3', 
        fut: 'https://demo-fapi.binance.com/fapi/v2' 
      }
    ];

    let success = false;
    let finalErrors = [];

    for (const env of envs) {
      let envSpot = 0;
      let envFutures = 0;
      let spotOk = false;
      let futOk = false;
      let envErrors = [];

      // Try Futures
      try {
        const timeRes = await axios.get(env.fut.replace('/v2', '/v1') + '/time', { timeout: 5000 });
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
        
        const res = await axios.get(`${env.fut}/account?${query}&signature=${signature}`, { headers, timeout: 5000 });
        
        if (res.data.assets) {
          res.data.assets.forEach(a => { if (a.asset === 'USDT') envFutures = parseFloat(a.walletBalance); });
          futOk = true;
        }
      } catch (e) {
        envErrors.push(`Futures: ${e.response?.data?.msg || e.message}`);
      }

      // Try Spot
      try {
        const timeRes = await axios.get(env.spot + '/time', { timeout: 5000 });
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');

        const res = await axios.get(`${env.spot}/account?${query}&signature=${signature}`, { headers, timeout: 5000 });

        if (res.data.balances) {
          res.data.balances.forEach(b => { if (b.asset === 'USDT') envSpot = parseFloat(b.free) + parseFloat(b.locked); });
          spotOk = true;
        }
      } catch (e) {
        envErrors.push(`Spot: ${e.response?.data?.msg || e.message}`);
      }

      if (spotOk || futOk) {
        spot = envSpot;
        futures = envFutures;
        success = true;
        break; 
      } else {
        finalErrors.push(`${env.name} -> [${envErrors.join(', ')}]`);
      }
    }

    return success ? { spot, futures } : { error: finalErrors.join(' | ') };
  }

  async placeOrder(symbol, side, amountUSDT, orderType = 'market', price = null, strategyId = 1) {
    // Similar fallback logic for order placement
    const crypto = require('crypto');
    const axios = require('axios');
    const isFutures = FUTURES_STRATEGIES.has(Number(strategyId));
    
    const hosts = isFutures 
      ? ['https://testnet.binancefuture.com/fapi', 'https://demo-fapi.binance.com/fapi']
      : ['https://testnet.binance.vision/api', 'https://demo-api.binance.com/api'];

    for (const host of hosts) {
      try {
        const t = await axios.get(`${host}/v1/time`);
        const ticker = await axios.get(`${host}/${isFutures ? 'v1' : 'v3'}/ticker/price?symbol=${symbol.replace('/', '')}`);
        const qty = (amountUSDT / parseFloat(ticker.data.price)).toFixed(5);
        const p = { symbol: symbol.replace('/', ''), side: side.toUpperCase(), type: orderType.toUpperCase(), quantity: qty, timestamp: t.data.serverTime, recvWindow: 10000 };
        if (orderType === 'limit' && price) { p.price = price; p.timeInForce = 'GTC'; }
        const q = Object.keys(p).sort().map(k => `${k}=${p[k]}`).join('&');
        const s = crypto.createHmac('sha256', Buffer.from(this._apiSecret, 'utf8')).update(Buffer.from(q, 'utf8')).digest('hex');
        const res = await axios.post(`${host}/${isFutures ? 'v1' : 'v3'}/order?${q}&signature=${s}`, null, { headers: { 'X-MBX-APIKEY': this._apiKey } });
        return res.data;
      } catch (e) { /* try next host */ }
    }
    return { error: 'Failed on all environments' };
  }

  _normalizeSymbol(s) { return s.replace(':USDT', '').replace('USDTUSDT', 'USDT'); }
  _client(sid) { return FUTURES_STRATEGIES.has(Number(sid)) ? this._futuresClient : this._spotClient; }
  isReady() { return this._initialized; }
  destroy() { this._initialized = false; }
}

module.exports = new BinanceExecutor();
