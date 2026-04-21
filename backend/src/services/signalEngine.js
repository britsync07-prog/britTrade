const db = require('../db');
const axios = require('axios');
const { RSI, BollingerBands, ADX, ATR } = require('technicalindicators');
const paperTradeService = require('./paperTradeService');

let telegramService = null;
function getTelegramService() {
  if (!telegramService) telegramService = require('./telegramService');
  return telegramService;
}

function calculateSuperTrend(highs, lows, closes, period = 10, multiplier = 3.0) {
  const atrResult = ATR.calculate({ high: highs, low: lows, close: closes, period });
  if (atrResult.length === 0) return { direction: 0 };
  
  let finalUpper = [], finalLower = [], trend = []; 
  const atrOffset = closes.length - atrResult.length;
  for (let i = atrOffset; i < closes.length; i++) {
    let currentAtr = atrResult[i - atrOffset];
    let chl2 = (highs[i] + lows[i]) / 2;
    let bu = chl2 + (multiplier * currentAtr);
    let bl = chl2 - (multiplier * currentAtr);
    
    if (i === atrOffset) {
      finalUpper[i] = bu; finalLower[i] = bl; trend[i] = 1;
    } else {
      finalUpper[i] = (bu < finalUpper[i-1] || closes[i-1] > finalUpper[i-1]) ? bu : finalUpper[i-1];
      finalLower[i] = (bl > finalLower[i-1] || closes[i-1] < finalLower[i-1]) ? bl : finalLower[i-1];
      if (trend[i-1] === 1 && closes[i] < finalLower[i]) trend[i] = -1;
      else if (trend[i-1] === -1 && closes[i] > finalUpper[i]) trend[i] = 1;
      else trend[i] = trend[i-1];
    }
  }
  return { direction: trend[trend.length - 1] };
}

class SignalEngine {
  constructor() {
    this.runningProcesses = new Map();
    this.lastSignals = {}; 
    this.latestPrices = {};
  }

  async fetchOHLC(symbol, interval) {
    const bSymbol = symbol.replace('/', '').replace(':', '').replace('USDTUSDT', 'USDT');
    const limit = 100;
    const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${bSymbol}&interval=${interval}&limit=${limit}`);
    
    const highs = [], lows = [], closes = [], volumes = [];
    res.data.forEach(k => {
      highs.push(parseFloat(k[2])); lows.push(parseFloat(k[3]));
      closes.push(parseFloat(k[4])); volumes.push(parseFloat(k[5]));
    });

    return { highs, lows, closes, volumes, price: closes[closes.length - 1], atr: ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).pop() };
  }

  startSignalTracker(configs) {
    let activeSignalsCache = [];
    const syncCache = async () => {
      try { activeSignalsCache = await db.query("SELECT * FROM signals WHERE status = 'active'"); } 
      catch (e) {}
    };
    syncCache();
    setInterval(syncCache, 5000); // Sync new signals every 5s

    const WebSocket = require('ws');
    const connectWs = () => {
      const ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
      ws.on('message', async (message) => {
        try {
          const tickers = JSON.parse(message);
          if(!Array.isArray(tickers)) return;
          
          tickers.forEach(t => { this.latestPrices[t.s] = parseFloat(t.c); });

          for (const sig of activeSignalsCache) {
            const bSymbol = sig.symbol.replace('/', '').replace(':', '');
            const currentPrice = this.latestPrices[bSymbol];
            if (!currentPrice) continue;

            let status = 'active';
            let pnl = 0;
            let leverage = sig.strategyId === 3 ? 5 : 1;

            if (sig.side === 'buy' || sig.side === 'long') pnl = ((currentPrice - sig.price) / sig.price) * 100 * leverage;
            else pnl = ((sig.price - currentPrice) / sig.price) * 100 * leverage;

            // Maintenance Liquidation Model (95%)
            if (pnl <= -95) {
              status = 'sl_hit';
              pnl = -100;
            }

            // Removed Martingale logic here to fix critical ruin bias

            if (sig.strategyId === 2) {
              let highest = sig.highestPrice || sig.price;
              if (currentPrice > highest) {
                highest = currentPrice;
                await db.run("UPDATE signals SET highestPrice = ? WHERE id = ?", [highest, sig.id]);
              }
              if (highest >= sig.price * 1.05) {
                const trailedSl = highest * 0.98;
                if (trailedSl > sig.sl) {
                  await db.run("UPDATE signals SET sl = ? WHERE id = ?", [trailedSl, sig.id]);
                  sig.sl = trailedSl; 
                }
              }
            }

            if (sig.side === 'buy' || sig.side === 'long') {
              if (currentPrice >= sig.tp) status = 'tp_hit';
              else if (currentPrice <= sig.sl) status = 'sl_hit';
            } else {
              if (currentPrice <= sig.tp) status = 'tp_hit';
              else if (currentPrice >= sig.sl) status = 'sl_hit';
            }

            if (status !== 'active') {
              // Immediately remove from fast-cache to prevent WS race conditions
              activeSignalsCache = activeSignalsCache.filter(s => s.id !== sig.id);

              await db.run("UPDATE signals SET status = ?, pnl = ? WHERE id = ?", [status, pnl, sig.id]);
              // Pass a baseline ATR approximation (e.g., 0.05% of price) for exit slippage
              await paperTradeService.closePaperTrade(sig.id, currentPrice, currentPrice * 0.0005); 
              await getTelegramService().broadcastClose(sig.strategyId, sig.symbol, sig.side === 'buy' || sig.side === 'long' ? 'sell' : 'cover', currentPrice, pnl, status);
            }
          }
        } catch (e) {}
      });
      ws.on('close', () => setTimeout(connectWs, 3000));
      ws.on('error', () => {});
    };
    connectWs();
  }

  async runStrategy(strategyId, configs, strategy) {
    const id = parseInt(strategyId, 10);
    this.stopStrategy(id);

    const config = configs[strategy.name] || { symbols: ['BTC/USDT'], timeframe: '5m', stakeAmount: 10 };
    console.log(`[Engine] >>> BOOTING CONTINUOUS SCAN: ${strategy.name}`);

    const scanFunction = async () => {
      for (const symbol of config.symbols) {
        try {
          let signalSide = null, currentPrice = 0, initialTp = 0, initialSl = 0;
          const data = await this.fetchOHLC(symbol, config.timeframe);
          currentPrice = data.price;

          if (strategy.name === 'TrendFollower') {
            const ch = data.highs.slice(0, -1); const cl = data.lows.slice(0, -1); const cc = data.closes.slice(0, -1); const cv = data.volumes.slice(0, -1);
            
            // Signal Validity & Spikes Data Filter
            const candleRange = Math.abs(cc[cc.length-1] - cc[cc.length-2]) / cc[cc.length-2];
            if (candleRange > 0.05) continue; // Reject crazy 5% single-minute volatility spikes

            const adxInfo = ADX.calculate({ high: ch, low: cl, close: cc, period: 14 });
            const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: cc });
            const st = calculateSuperTrend(ch, cl, cc, 10, 3.0);
            if (adxInfo.length > 0 && bb.length > 0) {
              if (st.direction === 1 && adxInfo[adxInfo.length - 1].adx > 25 && currentPrice > bb[bb.length - 1].upper && cv[cv.length-1] > 0) {
                signalSide = 'buy'; initialTp = currentPrice * 101.0; initialSl = currentPrice * 0.90; 
              } else if (st.direction === -1) signalSide = 'sell';
            }
          } else if (strategy.name === 'GridMeanReversion') {
            const cc = data.closes.slice(0, -1); const cv = data.volumes.slice(0, -1);
            // Spread thresholding filter
            if ((data.atr / currentPrice) > 0.03) continue; // Reject high ATR/Price liquidity hazards

            const rsi = RSI.calculate({ period: 14, values: cc });
            const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: cc });
            if (rsi.length > 0 && bb.length > 0) {
              if (currentPrice < bb[bb.length - 1].lower && rsi[rsi.length - 1] < 20 && cv[cv.length-1] > 0) {
                signalSide = 'buy'; initialTp = currentPrice * 1.01; initialSl = currentPrice * 0.85; 
              } else if (currentPrice > bb[bb.length - 1].middle) signalSide = 'sell';
            }
          } else if (strategy.name === 'UltimateFuturesScalper') {
            const cc = data.closes.slice(0, -1); const cv = data.volumes.slice(0, -1);
            const rsi = RSI.calculate({ period: 14, values: cc });
            if (rsi.length > 0) {
              const activeSignal = await db.get("SELECT side FROM signals WHERE strategyId = ? AND symbol = ? AND status = 'active' LIMIT 1", [id, symbol]);
              const activeSide = (activeSignal?.side || '').toLowerCase();
              const currentRsi = rsi[rsi.length - 1]; const lastVol = cv[cv.length-1];

              if ((activeSide === 'buy' || activeSide === 'long') && currentRsi > 50) signalSide = 'sell'; 
              else if (activeSide === 'short' && currentRsi < 50) signalSide = 'cover'; 
              else if (!activeSignal && currentRsi < 30 && lastVol > 0) { signalSide = 'buy'; initialTp = currentPrice * 1.005; initialSl = currentPrice * 0.90; } 
              else if (!activeSignal && currentRsi > 70 && lastVol > 0) { signalSide = 'short'; initialTp = currentPrice * 0.995; initialSl = currentPrice * 1.10; }
            }
          }

          if (signalSide) {
            const signalKey = `${id}_${symbol}`;
            const isEntry = ['buy', 'long', 'short'].includes(signalSide.toLowerCase());
            const activeSignal = await db.get("SELECT id, side, price FROM signals WHERE strategyId = ? AND symbol = ? AND status = 'active' LIMIT 1", [id, symbol]);

            let shouldTrigger = false;
            if (isEntry) { if (!activeSignal) shouldTrigger = true; } 
            else if (activeSignal) {
                const activeSide = activeSignal.side.toLowerCase();
                const respectsExitProfitOnly = ![1, 3].includes(id) || (((activeSide === 'buy' || activeSide === 'long') ? currentPrice > activeSignal.price : currentPrice < activeSignal.price));
                if (respectsExitProfitOnly && ((signalSide === 'sell' && (activeSide === 'buy' || activeSide === 'long')) || (signalSide === 'cover' && activeSide === 'short'))) shouldTrigger = true;
            }

            if (shouldTrigger && this.lastSignals[signalKey] !== signalSide) {
               this.lastSignals[signalKey] = signalSide;
               let pnl = 0, finalStatus = isEntry ? 'active' : 'completed';

               if (!isEntry && activeSignal) {
                 const entryPrice = activeSignal.price || currentPrice;
                 const leverage = id === 3 ? 5 : 1;
                 pnl = (activeSignal.side === 'buy' || activeSignal.side === 'long') ? ((currentPrice - entryPrice) / entryPrice) * 100 * leverage : ((entryPrice - currentPrice) / entryPrice) * 100 * leverage;
                 if (pnl <= -100) { pnl = -100; finalStatus = 'sl_hit'; }
                 await db.run("UPDATE signals SET status = 'closed', pnl = ? WHERE id = ?", [pnl, activeSignal.id]);
                 await paperTradeService.closePaperTrade(activeSignal.id, currentPrice);
               }

               const result = await db.run("INSERT INTO signals (strategyId, symbol, side, price, tp, sl, status, pnl, highestPrice, entryCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [id, symbol, signalSide, currentPrice, initialTp, initialSl, finalStatus, pnl, currentPrice, 1]);

               if (isEntry) {
                  const leverage = id === 3 ? 5 : 1;
                  // Start Paper Trade for this signal
                  await paperTradeService.openPaperTrade(id, result.lastID, symbol, signalSide, currentPrice, leverage, data.atr);
                  await getTelegramService().broadcastSignal({ strategyId: id, strategyName: strategy.name, symbol, side: signalSide, price: currentPrice, tp: initialTp, sl: initialSl, stakeAmount: 10 });
               } else await getTelegramService().broadcastClose(id, symbol, signalSide, currentPrice, pnl, finalStatus);
            }
          } else delete this.lastSignals[`${id}_${symbol}`];
        } catch (e) {}
      }
    };
    scanFunction();
    const interval = setInterval(scanFunction, 7000);
    this.runningProcesses.set(id, interval);
  }

  stopStrategy(strategyId) {
    if (this.runningProcesses.has(strategyId)) {
      clearInterval(this.runningProcesses.get(strategyId));
      this.runningProcesses.delete(strategyId);
    }
  }
}

module.exports = new SignalEngine();
