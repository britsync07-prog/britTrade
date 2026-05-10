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
    if (!this._testnet) {
       // Live mode logic using CCXT
       const client = this._client(strategyId);
       try {
         const ticker = await client.fetchTicker(symbol);
         const qty = amountUSDT / ticker.last;
         const order = await client.createOrder(symbol, orderType, side, qty, price);
         return order;
       } catch (e) { return { error: e.message }; }
    }

    // Testnet/Demo mode manual logic
    const crypto = require('crypto');
    const axios = require('axios');
    const isFutures = FUTURES_STRATEGIES.has(Number(strategyId));
    
    // Normalize symbol for Binance API
    let bSymbol = symbol.replace('/', '').replace(':', '').replace('USDTUSDT', 'USDT');
    if (isFutures) {
      if (bSymbol === 'SHIBUSDT') bSymbol = '1000SHIBUSDT';
      if (bSymbol === 'PEPEUSDT') bSymbol = '1000PEPEUSDT';
      if (bSymbol === 'BONKUSDT') bSymbol = '1000BONKUSDT';
      if (bSymbol === 'FLOKIUSDT') bSymbol = '1000FLOKIUSDT';
    }

    const envs = isFutures 
      ? [
          { name: 'Legacy', url: 'https://testnet.binancefuture.com/fapi' },
          { name: 'Demo', url: 'https://demo-fapi.binance.com/fapi' }
        ]
      : [
          { name: 'Legacy', url: 'https://testnet.binance.vision/api' },
          { name: 'Demo', url: 'https://demo-api.binance.com/api' }
        ];

    let lastError = null;
    for (const env of envs) {
      try {
        if (!this._precisions) this._precisions = {};
        if (!this._precisions[bSymbol]) {
          try {
            const infoRes = await axios.get(`${env.url}/v1/exchangeInfo`, { timeout: 5000 });
            for (const s of infoRes.data.symbols) {
              this._precisions[s.symbol] = s.quantityPrecision;
            }
          } catch (e) {
            console.warn(`[BinanceExecutor] Failed to fetch exchangeInfo: ${e.message}`);
          }
        }

        const timeRes = await axios.get(`${env.url}/v1/time`, { timeout: 5000 });
        const tickerRes = await axios.get(`${env.url}/v1/ticker/price?symbol=${bSymbol}`, { timeout: 5000 });
        
        const prec = this._precisions[bSymbol] !== undefined ? this._precisions[bSymbol] : (isFutures ? 3 : 5);
        const rawQty = amountUSDT / parseFloat(tickerRes.data.price);
        
        // Truncate instead of round to avoid Insufficient Balance errors
        const factor = Math.pow(10, prec);
        const qty = (Math.floor(rawQty * factor) / factor).toFixed(prec);

        const params = {
          symbol: bSymbol,
          side: side.toUpperCase(),
          type: orderType.toUpperCase(),
          quantity: qty,
          timestamp: timeRes.data.serverTime,
          recvWindow: 10000
        };
        if (orderType === 'limit' && price) { params.price = price; params.timeInForce = 'GTC'; }
        
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
        
        console.log(`[BinanceExecutor] Placing ${env.name} ${isFutures?'Futures':'Spot'} Order: ${side} ${qty} ${bSymbol}`);
        const res = await axios.post(`${env.url}/v1/order?${query}&signature=${signature}`, null, { 
          headers: { 'X-MBX-APIKEY': this._apiKey, 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000
        });

        // Normalize response to standard format
        const raw = res.data;
        const fillPrice = parseFloat(raw.avgPrice) || parseFloat(raw.price) || parseFloat(tickerRes.data.price);
        
        return {
          id: raw.orderId || raw.id,
          clientOrderId: raw.clientOrderId,
          symbol: symbol,
          side: side,
          type: orderType,
          status: raw.status?.toLowerCase() || 'open',
          amount: parseFloat(raw.origQty || qty),
          price: fillPrice,
          average: fillPrice,
          raw: raw
        };
      } catch (e) {
        lastError = e.response?.data?.msg || e.message;
        console.warn(`[BinanceExecutor] ${env.name} Order Fail: ${lastError}`);
      }
    }
    return { error: lastError || 'Failed to place order' };
  }

  _normalizeSymbol(s) { return s.replace(':USDT', '').replace('USDTUSDT', 'USDT'); }
  _client(sid) { return FUTURES_STRATEGIES.has(Number(sid)) ? this._futuresClient : this._spotClient; }
  isReady() { return this._initialized; }
  destroy() { this._initialized = false; }
}

module.exports = new BinanceExecutor();
