'use strict';

/**
 * binanceExecutor.js
 * Robust manual signing implementation using Axios for both Live and Testnet.
 * Removes CCXT dependency due to dapi.binance.com timeouts on USDT futures.
 */

const crypto = require('crypto');
const axios = require('axios');
const http = require('http');
const https = require('https');

// Force Axios to use IPv4 for all requests and enable keepAlive
axios.defaults.httpAgent = new http.Agent({ family: 4, keepAlive: true });
axios.defaults.httpsAgent = new https.Agent({ family: 4, keepAlive: true });

const { normalizeSymbol } = require('./symbolUtils');

const FUTURES_STRATEGIES = new Set([1, 2, 3]);

class BinanceExecutor {
  constructor() {
    this._testnet = true;
    this._initialized = false;
    this._precisions = {};
  }

  async init(apiKey, apiSecret, testnet = true) {
    this._testnet = testnet;
    this._apiKey = (apiKey || '').trim();
    this._apiSecret = (apiSecret || '').trim();
    this._initialized = true;
    console.log(`[BinanceExecutor] Initialized — ${testnet ? 'TESTNET (Axios)' : 'LIVE (Axios)'}`);
  }

  _getEnvs(isFutures) {
    if (!this._testnet) {
      return isFutures 
        ? [{ name: 'Live', url: 'https://fapi.binance.com/fapi' }]
        : [{ name: 'Live', url: 'https://api.binance.com/api' }];
    }
    return isFutures 
      ? [
          { name: 'Legacy', url: 'https://testnet.binancefuture.com/fapi' },
          { name: 'Demo', url: 'https://demo-fapi.binance.com/fapi' }
        ]
      : [
          { name: 'Legacy', url: 'https://testnet.binance.vision/api' },
          { name: 'Demo', url: 'https://demo-api.binance.com/api' }
        ];
  }

  async getBalance() {
    if (!this._initialized) return { error: 'Executor not initialized' };

    let spot = 0, futures = 0;
    const headers = { 'X-MBX-APIKEY': this._apiKey, 'User-Agent': 'Mozilla/5.0' };
    let finalErrors = [];

    const futEnvs = this._getEnvs(true);
    const spotEnvs = this._getEnvs(false);
    
    let futOk = false;
    for (const env of futEnvs) {
      try {
        const timeRes = await axios.get(`${env.url}/v1/time`, { timeout: 15000 });
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
        
        const res = await axios.get(`${env.url}/v2/account?${query}&signature=${signature}`, { headers, timeout: 15000 });
        
        if (res.data.assets) {
          res.data.assets.forEach(a => { if (a.asset === 'USDT') futures = parseFloat(a.walletBalance || a.availableBalance || 0); });
          futOk = true;
          break;
        }
      } catch (e) {
        finalErrors.push(`Futures ${env.name}: ${e.response?.data?.msg || e.message}`);
      }
    }

    let spotOk = false;
    for (const env of spotEnvs) {
      try {
        const timeRes = await axios.get(`${env.url}/v3/time`, { timeout: 15000 });
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');

        const res = await axios.get(`${env.url}/v3/account?${query}&signature=${signature}`, { headers, timeout: 15000 });

        if (res.data.balances) {
          res.data.balances.forEach(b => { if (b.asset === 'USDT') spot = parseFloat(b.free) + parseFloat(b.locked); });
          spotOk = true;
          break;
        }
      } catch (e) {
        finalErrors.push(`Spot ${env.name}: ${e.response?.data?.msg || e.message}`);
      }
    }

    if (spotOk || futOk) {
      return { spot, futures };
    }
    return { error: finalErrors.join(' | ') };
  }

  async placeOrder(symbol, side, amountUSDT, orderType = 'market', price = null, strategyId = 1, leverage = 1, fixedQty = null) {
    if (!this._initialized) return { error: 'Executor not initialized' };
    const isFutures = FUTURES_STRATEGIES.has(Number(strategyId));
    const bSymbol = normalizeSymbol(symbol, isFutures);
    const envs = this._getEnvs(isFutures);

    let lastError = null;
    for (const env of envs) {
      try {
        if (!this._precisions[bSymbol]) {
          try {
            const infoUrl = isFutures ? `${env.url}/v1` : `${env.url}/v3`;
            const infoRes = await axios.get(`${infoUrl}/exchangeInfo`, { timeout: 15000 });
            for (const s of infoRes.data.symbols) {
              this._precisions[s.symbol] = s.quantityPrecision || s.baseAssetPrecision;
            }
          } catch (e) {
            console.warn(`[BinanceExecutor] Failed to fetch exchangeInfo: ${e.message}`);
          }
        }

        const baseUrl = isFutures ? `${env.url}/v1` : `${env.url}/v3`;
        const timeRes = await axios.get(`${baseUrl}/time`, { timeout: 15000 });
        
        // Set Leverage for Futures
        if (isFutures && leverage > 1) {
          const lParams = { symbol: bSymbol, leverage, timestamp: timeRes.data.serverTime };
          const lQuery = Object.keys(lParams).map(k => `${k}=${lParams[k]}`).join('&');
          const lSig = crypto.createHmac('sha256', this._apiSecret).update(lQuery).digest('hex');
          await axios.post(`${baseUrl}/leverage?${lQuery}&signature=${lSig}`, null, {
            headers: { 'X-MBX-APIKEY': this._apiKey },
            timeout: 15000
          }).catch(e => console.warn(`[BinanceExecutor] SetLeverage Fail: ${e.response?.data?.msg || e.message}`));
        }

        let tickerRes;
        try {
          tickerRes = await axios.get(`${baseUrl}/ticker/price?symbol=${bSymbol}`, { timeout: 15000 });
        } catch(e) {
          tickerRes = { data: { price: price || 0 } }; 
        }
        
        const currentPrice = parseFloat(tickerRes.data.price);
        const prec = this._precisions[bSymbol] !== undefined ? this._precisions[bSymbol] : (isFutures ? 3 : 5);
        let qty = fixedQty;
        if (!qty && currentPrice > 0) {
          const rawQty = (amountUSDT * leverage) / currentPrice;
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
        const res = await axios.post(`${baseUrl}/order?${query}&signature=${signature}`, null, { 
          headers: { 'X-MBX-APIKEY': this._apiKey, 'User-Agent': 'Mozilla/5.0' },
          timeout: 10000
        });

        const raw = res.data;
        let fillPrice = parseFloat(raw.avgPrice) || parseFloat(raw.price);
        
        if (!fillPrice && raw.fills && raw.fills.length > 0) {
          const totalQty = raw.fills.reduce((acc, f) => acc + parseFloat(f.qty), 0);
          const weightedSum = raw.fills.reduce((acc, f) => acc + (parseFloat(f.price) * parseFloat(f.qty)), 0);
          fillPrice = weightedSum / totalQty;
        }

        if (!fillPrice) fillPrice = currentPrice;
        
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

  isReady() { return this._initialized; }

  async getPositions() {
    if (!this._initialized) return { error: 'Not initialized' };
    const envs = this._getEnvs(true);
    for (const env of envs) {
      try {
        const timeRes = await axios.get(`${env.url}/v1/time`, { timeout: 15000 });
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
        
        const res = await axios.get(`${env.url}/v2/positionRisk?${query}&signature=${signature}`, { 
          headers: { 'X-MBX-APIKEY': this._apiKey },
          timeout: 15000 
        });
        
        if (Array.isArray(res.data)) {
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

  async getAccount() {
    if (!this._initialized) return { error: 'Not initialized' };
    const envs = this._getEnvs(true);
    for (const env of envs) {
      try {
        const timeRes = await axios.get(`${env.url}/v1/time`, { timeout: 15000 });
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');
        
        const res = await axios.get(`${env.url}/v2/account?${query}&signature=${signature}`, { 
          headers: { 'X-MBX-APIKEY': this._apiKey },
          timeout: 15000 
        });
        if (res.data) {
          return {
            totalUnrealizedProfit: parseFloat(res.data.totalUnrealizedProfit || 0),
            totalMarginBalance: parseFloat(res.data.totalMarginBalance || 0),
            availableBalance: parseFloat(res.data.availableBalance || 0),
            raw: res.data
          };
        }
      } catch (e) { continue; }
    }
    return { error: 'Failed to fetch account info from all environments' };
  }

  async getOrder(symbol, orderId) {
    if (!this._initialized) return { error: 'Not initialized' };
    const bSymbol = normalizeSymbol(symbol, true);
    const envs = this._getEnvs(true);

    for (const env of envs) {
      try {
        const timeRes = await axios.get(`${env.url}/v1/time`, { timeout: 15000 });
        const params = {
          symbol: bSymbol,
          orderId: orderId,
          timestamp: timeRes.data.serverTime,
          recvWindow: 10000
        };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');

        const res = await axios.get(`${env.url}/v1/order?${query}&signature=${signature}`, {
          headers: { 'X-MBX-APIKEY': this._apiKey },
          timeout: 15000
        });
        return res.data;
      } catch (e) { }
    }
    return { error: 'Order not found' };
  }

  async cancelOrder(symbol, orderId) {
    if (!this._initialized) return { success: false, error: 'Not initialized' };
    const bSymbol = normalizeSymbol(symbol, true);
    const envs = this._getEnvs(true);

    for (const env of envs) {
      try {
        const timeRes = await axios.get(`${env.url}/v1/time`, { timeout: 15000 });
        const params = {
          symbol: bSymbol,
          orderId: orderId,
          timestamp: timeRes.data.serverTime,
          recvWindow: 10000
        };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');

        await axios.delete(`${env.url}/v1/order?${query}&signature=${signature}`, {
          headers: { 'X-MBX-APIKEY': this._apiKey },
          timeout: 15000
        });
        return { success: true };
      } catch (e) { }
    }
    return { success: false, error: 'Order not found or already closed' };
  }

  async cancelAllOpenOrders() {
    if (!this._initialized) return [];
    
    const envs = this._getEnvs(true);
    for (const env of envs) {
      try {
        const timeRes = await axios.get(`${env.url}/v1/time`, { timeout: 15000 });
        
        // Fetch open orders
        const params = { timestamp: timeRes.data.serverTime, recvWindow: 10000 };
        const query = Object.keys(params).map(k => `${k}=${params[k]}`).join('&');
        const signature = crypto.createHmac('sha256', this._apiSecret).update(query).digest('hex');

        const res = await axios.get(`${env.url}/v1/openOrders?${query}&signature=${signature}`, {
          headers: { 'X-MBX-APIKEY': this._apiKey },
          timeout: 15000
        });
        
        // Cancel each one manually since allOpenOrders requires symbol on Binance
        if (Array.isArray(res.data)) {
           for (const order of res.data) {
              await this.cancelOrder(order.symbol, order.orderId);
           }
        }
        return [];
      } catch (e) { }
    }
    return [];
  }

  destroy() { this._initialized = false; }
}

const sharedExecutor = new BinanceExecutor();
module.exports = sharedExecutor;
module.exports.BinanceExecutor = BinanceExecutor;
