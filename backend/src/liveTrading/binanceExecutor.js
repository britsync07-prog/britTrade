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

  async placeOrder(symbol, side, amountUSDT, orderType = 'market', price = null, strategyId = 1, leverage = 1, fixedQty = null) {
    if (!this._testnet) {
       // Live mode logic using CCXT
       const client = this._client(strategyId);
       try {
         const isFutures = FUTURES_STRATEGIES.has(Number(strategyId));
         if (isFutures && leverage > 1) await client.setLeverage(leverage, symbol);
         const ticker = await client.fetchTicker(symbol);
         const qty = fixedQty || (amountUSDT * leverage) / ticker.last;
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
        
        // 1. Set Leverage for Futures
        if (isFutures && leverage > 1) {
          const lParams = { symbol: bSymbol, leverage, timestamp: timeRes.data.serverTime };
          const lQuery = Object.keys(lParams).map(k => `${k}=${lParams[k]}`).join('&');
          const lSig = crypto.createHmac('sha256', this._apiSecret).update(lQuery).digest('hex');
          await axios.post(`${env.url}/v1/leverage?${lQuery}&signature=${lSig}`, null, {
            headers: { 'X-MBX-APIKEY': this._apiKey },
            timeout: 5000
          }).catch(e => console.warn(`[BinanceExecutor] SetLeverage Fail: ${e.response?.data?.msg || e.message}`));
        }

        const tickerRes = await axios.get(`${env.url}/v1/ticker/price?symbol=${bSymbol}`, { timeout: 5000 });
        
        const prec = this._precisions[bSymbol] !== undefined ? this._precisions[bSymbol] : (isFutures ? 3 : 5);
        let qty = fixedQty;
        if (!qty) {
          const rawQty = (amountUSDT * leverage) / parseFloat(tickerRes.data.price);
          const factor = Math.pow(10, prec);
          qty = (Math.floor(rawQty * factor) / factor).toFixed(prec);
        }

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
        
        console.log(`[BinanceExecutor] Placing ${env.name} ${isFutures?'Futures':'Spot'} Order: ${side} ${qty} ${bSymbol} (Lev: ${leverage}x)`);
        const res = await axios.post(`${env.url}/v1/order?${query}&signature=${signature}`, null, { 
          headers: { 'X-MBX-APIKEY': this._apiKey, 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000
        });

        // Normalize response to standard format
        const raw = res.data;
        let fillPrice = parseFloat(raw.avgPrice) || parseFloat(raw.price);
        
        // If price is missing (market orders), look at fills
        if (!fillPrice && raw.fills && raw.fills.length > 0) {
          const totalQty = raw.fills.reduce((acc, f) => acc + parseFloat(f.qty), 0);
          const weightedSum = raw.fills.reduce((acc, f) => acc + (parseFloat(f.price) * parseFloat(f.qty)), 0);
          fillPrice = weightedSum / totalQty;
        }

        if (!fillPrice) fillPrice = parseFloat(tickerRes.data.price);
        
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

  // Unified method to get all open positions from Binance
  async getPositions() {
    if (!this._initialized) return { error: 'Not initialized' };
    
    // Live mode (CCXT)
    if (!this._testnet) {
      try {
        const positions = await this._futuresClient.fetchPositions();
        return positions.map(p => ({
          symbol: p.symbol.replace('/', '').replace(':', '').replace('USDTUSDT', 'USDT'),
          // Ensure positionAmt is signed (positive for Long, negative for Short)
          positionAmt: parseFloat(p.info?.positionAmt || (p.side === 'long' ? p.contracts : -p.contracts)),
          unRealizedProfit: p.unrealizedPnl,
          markPrice: p.markPrice,
          entryPrice: p.entryPrice,
          leverage: p.leverage
        }));
      } catch (e) { return { error: e.message }; }
    }

    // Testnet mode (Manual Axios)
    const crypto = require('crypto');
    const axios = require('axios');
    const envs = [
      { name: 'Legacy', url: 'https://testnet.binancefuture.com/fapi/v2' },
      { name: 'Demo', url: 'https://demo-fapi.binance.com/fapi/v2' }
    ];

    for (const env of envs) {
      try {
        const timeRes = await axios.get(env.url.replace('/v2', '/v1') + '/time', { timeout: 5000 });
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
        
        const res = await axios.get(`${env.url}/positionRisk?${query}&signature=${signature}`, { 
          headers: { 'X-MBX-APIKEY': this._apiKey },
          timeout: 5000 
        });
        
        if (Array.isArray(res.data)) {
          // Normalize Testnet response to match Live mode's standard structure
          return res.data.map(p => ({
            symbol: p.symbol,
            positionAmt: parseFloat(p.positionAmt || p.positionAmount || 0),
            unRealizedProfit: parseFloat(p.unRealizedProfit || 0),
            markPrice: parseFloat(p.markPrice || 0),
            entryPrice: parseFloat(p.entryPrice || 0),
            leverage: parseInt(p.leverage || 1)
          }));
        }
      } catch (e) { continue; }
    }
    return { error: 'Failed to fetch positions from all environments' };
  }

  // Unified method to get full account info from Binance
  async getAccount() {
    if (!this._initialized) return { error: 'Not initialized' };

    if (!this._testnet) {
      try {
        const acc = await this._futuresClient.fetchBalance();
        return {
          totalUnrealizedProfit: acc.info.totalUnrealizedProfit || 0,
          totalMarginBalance: acc.info.totalMarginBalance || 0
        };
      } catch (e) { return { error: e.message }; }
    }

    const crypto = require('crypto');
    const axios = require('axios');
    const envs = [
      { name: 'Legacy', url: 'https://testnet.binancefuture.com/fapi/v2' },
      { name: 'Demo', url: 'https://demo-fapi.binance.com/fapi/v2' }
    ];

    for (const env of envs) {
      try {
        const timeRes = await axios.get(env.url.replace('/v2', '/v1') + '/time', { timeout: 5000 });
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
        
        const res = await axios.get(`${env.url}/account?${query}&signature=${signature}`, { 
          headers: { 'X-MBX-APIKEY': this._apiKey },
          timeout: 5000 
        });
        if (res.data) return res.data;
      } catch (e) { continue; }
    }
    return { error: 'Failed to fetch account info from all environments' };
  }

  async getOrder(symbol, orderId) {
    if (!this.binance) return { error: 'Not initialized' };
    try {
      // Use futures version for now as we are testing futures
      const order = await this.binance.futuresOrder(symbol.replace('/', '').replace(':', ''), orderId);
      return order;
    } catch (e) {
      return { error: e.message };
    }
  }

  // Cancel a specific order
  async cancelOrder(symbol, orderId) {
    if (!this._initialized) return { success: false, error: 'Not initialized' };
    const bSymbol = symbol.replace('/', '').replace(':', '');

    // Live mode (CCXT)
    if (!this._testnet) {
      try {
        await this._futuresClient.cancelOrder(orderId, symbol);
        return { success: true };
      } catch (e) { return { success: false, error: e.message }; }
    }

    // Testnet mode (Manual Axios)
    const crypto = require('crypto');
    const axios = require('axios');
    const envs = [
      { name: 'Legacy', url: 'https://testnet.binancefuture.com/fapi/v1' },
      { name: 'Demo', url: 'https://demo-fapi.binance.com/fapi/v1' }
    ];

    for (const env of envs) {
      try {
        const timeRes = await axios.get(env.url + '/time', { timeout: 5000 });
        const params = {
          symbol: bSymbol,
          orderId: orderId,
          timestamp: timeRes.data.serverTime,
          recvWindow: 10000
        };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');

        await axios.delete(`${env.url}/order?${query}&signature=${signature}`, {
          headers: { 'X-MBX-APIKEY': this._apiKey },
          timeout: 5000
        });
        return { success: true };
      } catch (e) {
        // Continue to next env if 404/400
      }
    }
    return { success: false, error: 'Order not found or already closed' };
  }

  // Cancel all open orders for all symbols (Futures)
  async cancelAllOpenOrders() {
    if (!this._initialized) return [];
    
    if (!this._testnet) {
       try {
         const orders = await this._futuresClient.fetchOpenOrders();
         for (const o of orders) {
           await this._futuresClient.cancelOrder(o.id, o.symbol);
         }
         return orders;
       } catch (e) { return []; }
    }

    // Testnet doesn't have a reliable "cancel all" across both envs without symbol
    // So we just return empty or implement per-symbol if needed.
    return [];
  }

  destroy() { this._initialized = false; }
}

module.exports = new BinanceExecutor();
