const db = require('../db');
const axios = require('axios');
const { RSI, BollingerBands, ADX, ATR } = require('technicalindicators');

// Lazy-loaded to avoid circular require issues
let telegramService = null;

function getTelegramService() {
  if (!telegramService) telegramService = require('./telegramService');
  return telegramService;
}

// Native SuperTrend implementation
function calculateSuperTrend(highs, lows, closes, period = 10, multiplier = 3.0) {
  const atrResult = ATR.calculate({ high: highs, low: lows, close: closes, period });
  if (atrResult.length === 0) return { direction: 0 };
  
  let finalUpper = [];
  let finalLower = [];
  let trend = []; 

  const atrOffset = closes.length - atrResult.length;
  for (let i = atrOffset; i < closes.length; i++) {
    let currentAtr = atrResult[i - atrOffset];
    let chl2 = (highs[i] + lows[i]) / 2;
    let bu = chl2 + (multiplier * currentAtr);
    let bl = chl2 - (multiplier * currentAtr);
    
    if (i === atrOffset) {
      finalUpper[i] = bu;
      finalLower[i] = bl;
      trend[i] = 1;
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

class StrategyService {
  constructor() {
    this.runningProcesses = new Map();
    this.lastSignals = {}; 
    this.latestPrices = {};
    this.configs = this.loadConfigs();
    this.startSignalTracker();
  }

  startSignalTracker() {
    setInterval(async () => {
      try {
        const activeSignals = await db.query("SELECT * FROM signals WHERE status = 'active'");
        
        // Build unique list of all symbols from configs + active signals
        const configSymbols = Object.values(this.configs).flatMap(c => c.symbols);
        const symbols = [...new Set([...configSymbols, ...activeSignals.map(s => s.symbol)])];
        
        const prices = {};
        for (const s of symbols) {
          try {
            const data = await this.fetchOHLC(s, '1m');
            prices[s] = data.price;
            this.latestPrices[s] = data.price;
          } catch (pe) {
            // Log once if a symbol fails
            if (Math.random() < 0.05) console.error(`[Price Fetch] Failed for ${s}:`, pe.message);
          }
        }

        for (const sig of activeSignals) {
          const currentPrice = prices[sig.symbol];
          if (!currentPrice) continue;

          let status = 'active';
          let pnl = 0;

          if (sig.side === 'buy' || sig.side === 'long') {
            if (currentPrice >= sig.tp) status = 'tp_hit';
            else if (currentPrice <= sig.sl) status = 'sl_hit';
            pnl = ((currentPrice - sig.price) / sig.price) * 100;
          } else {
            if (currentPrice <= sig.tp) status = 'tp_hit';
            else if (currentPrice >= sig.sl) status = 'sl_hit';
            pnl = ((sig.price - currentPrice) / sig.price) * 100;
          }

          if (status !== 'active') {
            await db.run(
              "UPDATE signals SET status = ?, pnl = ? WHERE id = ?",
              [status, pnl, sig.id]
            );

            // Notify subscribers on Telegram about the close
            await getTelegramService().broadcastClose(
              sig.strategyId,
              sig.symbol,
              sig.side === 'buy' || sig.side === 'long' ? 'sell' : 'buy',
              currentPrice,
              pnl,
              status
            );

            console.log(`[Signal Tracker] Signal ${sig.id} (${sig.symbol}) closed: ${status} (PnL: ${pnl.toFixed(2)}%)`);
          }
        }
      } catch (e) {
        console.error('[Signal Tracker Error]', e.message);
      }
    }, 30000); // Check every 30 seconds
  }

  loadConfigs() {
    const fs = require('fs');
    const path = require('path');
    const configs = {};
    const mapping = {
      'GridMeanReversion': 'config_spot_scalping.json',
      'TrendFollower': 'config_spot_trend.json',
      'UltimateFuturesScalper': 'config_futures_scalping.json'
    };

    for (const [stratName, fileName] of Object.entries(mapping)) {
      try {
        const filePath = path.resolve(__dirname, '../../', fileName);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf8');
          const json = JSON.parse(raw);
          
          // Clean symbols: "BTC/USDT:USDT" -> "BTC/USDT"
          const cleanSymbols = (json.exchange.pair_whitelist || []).map(s => s.split(':')[0]);
          
          configs[stratName] = {
            symbols: cleanSymbols,
            timeframe: json.timeframe || '1h',
            tradingMode: json.trading_mode || 'spot',
            stakeAmount: json.stake_amount || 100
          };
          console.log(`[Config] Loaded ${fileName} for ${stratName}. Symbols: ${cleanSymbols.length}`);
        }
      } catch (e) {
        console.error(`[Config] Failed to load ${fileName} for ${stratName}:`, e.message);
      }
    }
    return configs;
  }

  async getAll() {
    const strategies = await db.query("SELECT * FROM strategies");
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    for (const s of strategies) {
      const trades = await db.query(
        "SELECT pnl, status FROM trades WHERE strategyId = ? AND timestamp > ?",
        [s.id, yesterday]
      );
      const closed = trades.filter(t => t.status === 'closed');
      let prof24h = 0;
      if (closed.length > 0) {
        const totalPnl = closed.reduce((acc, t) => acc + (t.pnl || 0), 0);
        const totalStake = closed.length * 100; // Assuming default $100 stake
        prof24h = (totalPnl / totalStake) * 100;
      }
      s.prof24h = prof24h.toFixed(2);
    }
    return strategies;
  }

  async getSubscribed(userId) {
    return await db.query(
      "SELECT s.*, sub.useSignal, sub.useVirtualBalance, sub.allocatedBalance, sub.initialAllocation FROM strategies s JOIN subscriptions sub ON s.id = sub.strategyId WHERE sub.userId = ?",
      [userId]
    );
  }

  async subscribe(userId, strategyId, useSignal = true, useVirtualBalance = true, allocatedBalance = 0) {
    return await db.run("INSERT OR REPLACE INTO subscriptions (userId, strategyId, useSignal, useVirtualBalance, allocatedBalance, initialAllocation) VALUES (?, ?, ?, ?, ?, ?)", [userId, strategyId, useSignal, useVirtualBalance, allocatedBalance, allocatedBalance]);
  }

  async unsubscribe(userId, strategyId) {
    return await db.run("DELETE FROM subscriptions WHERE userId = ? AND strategyId = ?", [userId, strategyId]);
  }

  async fetchOHLC(symbol, interval) {
    const bSymbol = symbol.replace('/', '').replace(':', '').replace('USDTUSDT', 'USDT');
    const limit = 100;
    const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${bSymbol}&interval=${interval}&limit=${limit}`);
    
    const highs = [];
    const lows = [];
    const closes = [];
    const volumes = [];
    
    res.data.forEach(k => {
      highs.push(parseFloat(k[2]));
      lows.push(parseFloat(k[3]));
      closes.push(parseFloat(k[4]));
      volumes.push(parseFloat(k[5]));
    });

    return { highs, lows, closes, volumes, price: closes[closes.length - 1], atr: ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).pop() };
  }

  async runStrategy(strategyId) {
    const id = parseInt(strategyId, 10);
    if (isNaN(id)) throw new Error('Invalid strategyId');

    // Prevent duplicate intervals for the same strategy
    await this.stopStrategy(id);

    const strategy = await db.get("SELECT * FROM strategies WHERE id = ?", [id]);
    if (!strategy) throw new Error("Strategy not found");

    const config = this.configs[strategy.name] || {
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT'],
      timeframe: '5m'
    };

    console.log(`[Engine] Starting LIVE Market Strategy Node: ${strategy.name} on ${config.symbols.length} pairs (${config.timeframe})`);

    const interval = setInterval(async () => {
      if (Math.random() < 0.1) {
         console.log(`[Engine] Heartbeat: ${strategy.name} scanning ${config.symbols.length} markets...`);
      }

      for (const symbol of config.symbols) {
        try {
          let signalSide = null;
          let currentPrice = 0;
          let data = null;

          if (strategy.name === 'TrendFollower') {
            data = await this.fetchOHLC(symbol, config.timeframe);
            currentPrice = data.price;
            
            const adxInfo = ADX.calculate({ high: data.highs, low: data.lows, close: data.closes, period: 14 });
            const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: data.closes });
            const st = calculateSuperTrend(data.highs, data.lows, data.closes, 10, 3.0);
            
            if (adxInfo.length > 0 && bb.length > 0) {
              const currentAdx = adxInfo[adxInfo.length - 1].adx;
              const currentBB = bb[bb.length - 1];
              
              if (st.direction === 1 && currentAdx > 25 && currentPrice > currentBB.upper && data.volumes[data.volumes.length-1] > 0) {
                signalSide = 'buy';
              } else if (st.direction === -1) {
                signalSide = 'sell';
              }
            }
          } 
          else if (strategy.name === 'GridMeanReversion') {
            data = await this.fetchOHLC(symbol, config.timeframe);
            currentPrice = data.price;
            
            const rsi = RSI.calculate({ period: 14, values: data.closes });
            const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: data.closes });
            
            if (rsi.length > 0 && bb.length > 0) {
              const currentRsi = rsi[rsi.length - 1];
              const currentBB = bb[bb.length - 1];
              
              if (currentPrice < currentBB.lower && currentRsi < 20 && data.volumes[data.volumes.length-1] > 0) {
                signalSide = 'buy';
              } else if (currentPrice > currentBB.middle) {
                signalSide = 'sell';
              }
            }
          }
          else if (strategy.name === 'UltimateFuturesScalper') {
            data = await this.fetchOHLC(symbol, config.timeframe);
            currentPrice = data.price;
            
            const rsi = RSI.calculate({ period: 14, values: data.closes });
            if (rsi.length > 0) {
              const currentRsi = rsi[rsi.length - 1];
              if (currentRsi < 30 && data.volumes[data.volumes.length-1] > 0) {
                signalSide = 'buy';
              } else if (currentRsi > 70 && data.volumes[data.volumes.length-1] > 0) {
                signalSide = 'short'; 
              } else if (currentRsi > 50) {
                signalSide = 'sell'; 
              } else if (currentRsi < 50) {
                signalSide = 'cover'; 
              }
            }
          }

          if (signalSide) {
            const signalKey = `${id}_${symbol}`;
            if (this.lastSignals[signalKey] !== signalSide) {
               this.lastSignals[signalKey] = signalSide;

               const atr = data.atr || (currentPrice * 0.02); // Fallback to 2% if ATR fails
               let tp = 0;
               let sl = 0;

               if (signalSide === 'buy' || signalSide === 'long') {
                 tp = currentPrice + (atr * 3); // 3:1 Reward/Risk approx
                 sl = currentPrice - (atr * 1.5);
               } else if (signalSide === 'sell' || signalSide === 'short') {
                 tp = currentPrice - (atr * 3);
                 sl = currentPrice + (atr * 1.5);
               }

               const signal = {
                 strategyId: id,
                 strategyName: strategy.name,
                 symbol: symbol,
                 side: signalSide,
                 price: currentPrice,
                 tp: tp,
                 sl: sl,
                 stakeAmount: config.stakeAmount,
                 timestamp: new Date().toISOString()
               };

               const isEntry = ['buy', 'long', 'short'].includes(signalSide.toLowerCase());
               let pnl = 0;
               let finalStatus = isEntry ? 'active' : 'completed';

               if (!isEntry) {
                 // Try to find last active entry for this symbol/strategy
                 const lastEntry = await db.get(
                   "SELECT id, price, side FROM signals WHERE strategyId = ? AND symbol = ? AND status = 'active' ORDER BY timestamp DESC LIMIT 1",
                   [id, symbol]
                 );
                 if (lastEntry) {
                   if (lastEntry.side === 'buy' || lastEntry.side === 'long') {
                     pnl = ((currentPrice - lastEntry.price) / lastEntry.price) * 100;
                   } else {
                     pnl = ((lastEntry.price - currentPrice) / lastEntry.price) * 100;
                   }
                   // Close the entry signal
                   await db.run("UPDATE signals SET status = 'closed', pnl = ? WHERE id = ?", [pnl, lastEntry.id]);
                 }
               }

               await db.run(
                 "INSERT INTO signals (strategyId, symbol, side, price, tp, sl, status, pnl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                 [signal.strategyId, signal.symbol, signal.side, signal.price, signal.tp, signal.sl, finalStatus, pnl]
               );

               // Broadcast ALL entry signals (buy/sell/long/short) to Telegram
               if (isEntry) {
                  await getTelegramService().broadcastSignal(signal);
               }

            }
          }
        } catch (e) {
           console.error(`[Engine] Real price fetch failed for ${symbol}, using fallback handling. ${e}`);
        }
      }
    }, 7000);

    this.runningProcesses.set(id, interval);
    return {
      status: 'Started (Live API Mode)',
      strategy: strategy.name,
      mode: strategy.type,
      file: `${strategy.name}.js`
    };
  }

  async stopStrategy(strategyId) {
    const id = parseInt(strategyId, 10);
    if (this.runningProcesses.has(id)) {
      clearInterval(this.runningProcesses.get(id));
      this.runningProcesses.delete(id);
      return { status: 'Stopped' };
    }
    return { status: 'Not running' };
  }

  async getSignals(strategyId, userId = null, isAdmin = false) {
    if (userId && !isAdmin) {
       // Check if user has purchased the plan for this strategy
       const planToStrat = { 1: 'low_risk', 2: 'medium_risk', 3: 'high_risk' };
       const targetPlan = planToStrat[strategyId];
       
       if (targetPlan) {
         const hasPurchase = await db.get(
           "SELECT id FROM purchases WHERE userId = ? AND (planId = ? OR planId = 'bundle')",
           [userId, targetPlan]
         );
         if (!hasPurchase) {
           return { locked: true, message: 'Subscribe to view detailed signals' };
         }
       }
    }
    return await db.query("SELECT * FROM signals WHERE strategyId = ? ORDER BY timestamp DESC LIMIT 50", [strategyId]);
  }

  async getChartHistory(symbol, timeframe = '1h') {
    try {
      const symbolMap = { 'BTC/USDT': 'BTCUSDT', 'ETH/USDT': 'ETHUSDT', 'SOL/USDT': 'SOLUSDT', 'ADA/USDT': 'ADAUSDT', 'XRP/USDT': 'XRPUSDT' };
      const bSymbol = symbolMap[symbol] || 'BTCUSDT';
      const intervalMap = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };
      const interval = intervalMap[timeframe] || '1h';

      const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${bSymbol}&interval=${interval}&limit=100`);
      
      return res.data.map(k => [
        k[0], // time
        parseFloat(k[1]), // open
        parseFloat(k[2]), // high
        parseFloat(k[3]), // low
        parseFloat(k[4]), // close
      ]);
    } catch (e) {
      console.error('Binance API error parsing historical charts:', e);
      return [];
    }
  }

  async getPrices() {
    return this.latestPrices;
  }
}

module.exports = new StrategyService();
