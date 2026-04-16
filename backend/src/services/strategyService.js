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
            if (Math.random() < 0.05) console.error(`[Price Fetch] Failed for ${s}:`, pe.message);
          }
        }

        for (const sig of activeSignals) {
          const currentPrice = prices[sig.symbol];
          if (!currentPrice) continue;

          let status = 'active';
          let pnl = 0;
          let leverage = sig.strategyId === 3 ? 10 : 1;

          // Calculate PnL
          if (sig.side === 'buy' || sig.side === 'long') {
            pnl = ((currentPrice - sig.price) / sig.price) * 100 * leverage;
          } else {
            pnl = ((sig.price - currentPrice) / sig.price) * 100 * leverage;
          }

          // --- Strategy Specific Logic ---
          
          // 1. GridMeanReversion DCA Logic
          if (sig.strategyId === 1 && pnl < -5 && (sig.entryCount || 1) < 10) {
            const newEntryCount = (sig.entryCount || 1) + 1;
            const newAvgPrice = (sig.price + currentPrice) / 2;
            const newTp = newAvgPrice * 1.01;
            const newSl = newAvgPrice * 0.85; // Hard stoploss -15%
            
            await db.run(
              "UPDATE signals SET price = ?, tp = ?, sl = ?, entryCount = ? WHERE id = ?",
              [newAvgPrice, newTp, newSl, newEntryCount, sig.id]
            );
            console.log(`[DCA] GridMeanReversion DCA #${newEntryCount} for ${sig.symbol}. New Avg: ${newAvgPrice}`);
            continue; // Skip exit check for this turn as we just adjusted
          }

          // 2. TrendFollower Trailing Stop Logic
          if (sig.strategyId === 2) {
            let highest = sig.highestPrice || sig.price;
            if (currentPrice > highest) {
              highest = currentPrice;
              await db.run("UPDATE signals SET highestPrice = ? WHERE id = ?", [highest, sig.id]);
            }
            
            // If offset (5%) reached, trail by 2%
            if (highest >= sig.price * 1.05) {
              const trailedSl = highest * 0.98;
              if (trailedSl > sig.sl) {
                await db.run("UPDATE signals SET sl = ? WHERE id = ?", [trailedSl, sig.id]);
                sig.sl = trailedSl; // Update local for exit check
              }
            }
          }

          // --- Exit Check ---
          if (sig.side === 'buy' || sig.side === 'long') {
            if (currentPrice >= sig.tp) status = 'tp_hit';
            else if (currentPrice <= sig.sl) status = 'sl_hit';
          } else {
            if (currentPrice <= sig.tp) status = 'tp_hit';
            else if (currentPrice >= sig.sl) status = 'sl_hit';
          }

          if (status !== 'active') {
            await db.run(
              "UPDATE signals SET status = ?, pnl = ? WHERE id = ?",
              [status, pnl, sig.id]
            );

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
    }, 30000);
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
        // Since t.pnl is already a % (ROE), we can just average the ROE per trade.
        // Or strictly sum it for a cumulative absolute return of the day.
        const totalPnl = closed.reduce((acc, t) => acc + (t.pnl || 0), 0);
        prof24h = totalPnl; // Show the total stacked ROE percentage gained today
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
      // Clear lastSignals periodically or based on logic to avoid signal "stickiness"
      // However, we want to avoid spamming the same signal every 7 seconds.
      // The issue might be that signalSide is always 'buy' or 'sell' due to logic conditions.

      for (const symbol of config.symbols) {
        try {
          let signalSide = null;
          let currentPrice = 0;
          let data = null;
          let initialTp = 0;
          let initialSl = 0;

          // Fetch data for indicators
          data = await this.fetchOHLC(symbol, config.timeframe);
          currentPrice = data.price;

          if (strategy.name === 'TrendFollower') {
            const adxInfo = ADX.calculate({ high: data.highs, low: data.lows, close: data.closes, period: 14 });
            const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: data.closes });
            const st = calculateSuperTrend(data.highs, data.lows, data.closes, 10, 3.0);
            
            if (adxInfo.length > 0 && bb.length > 0) {
              const currentAdx = adxInfo[adxInfo.length - 1].adx;
              const currentBB = bb[bb.length - 1];
              const lastVol = data.volumes[data.volumes.length-1];
              
              if (st.direction === 1 && currentAdx > 25 && currentPrice > currentBB.upper && lastVol > 0) {
                signalSide = 'buy';
                initialTp = currentPrice * 2.0;
                initialSl = currentPrice * 0.90;
              } else if (st.direction === -1) {
                signalSide = 'sell';
              }
            }
          } 
          else if (strategy.name === 'GridMeanReversion') {
            const rsi = RSI.calculate({ period: 14, values: data.closes });
            const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: data.closes });
            
            if (rsi.length > 0 && bb.length > 0) {
              const currentRsi = rsi[rsi.length - 1];
              const currentBB = bb[bb.length - 1];
              const lastVol = data.volumes[data.volumes.length-1];
              
              if (currentPrice < currentBB.lower && currentRsi < 20 && lastVol > 0) {
                signalSide = 'buy';
                initialTp = currentPrice * 1.01;
                initialSl = currentPrice * 0.85;
              } else if (currentPrice > currentBB.middle) {
                signalSide = 'sell';
              }
            }
          }
          else if (strategy.name === 'UltimateFuturesScalper') {
            const rsi = RSI.calculate({ period: 14, values: data.closes });
            if (rsi.length > 0) {
              const currentRsi = rsi[rsi.length - 1];
              const lastVol = data.volumes[data.volumes.length-1];
              if (currentRsi < 30 && lastVol > 0) {
                signalSide = 'buy';
                initialTp = currentPrice * 1.005;
                initialSl = currentPrice * 0.90;
              } else if (currentRsi > 70 && lastVol > 0) {
                signalSide = 'short'; 
                initialTp = currentPrice * 0.995;
                initialSl = currentPrice * 1.10;
              } else if (currentRsi > 50) {
                signalSide = 'sell'; 
              } else if (currentRsi < 50) {
                signalSide = 'cover'; 
              }
            }
          }

          if (signalSide) {
            const signalKey = `${id}_${symbol}`;
            const isEntry = ['buy', 'long', 'short'].includes(signalSide.toLowerCase());

            // LOGIC FIX: We only want to trigger a NEW signal if:
            // 1. There is no active signal for this symbol/strategy.
            // 2. OR the signalSide has changed (e.g. from Buy to Sell).
            
            const activeSignal = await db.get(
              "SELECT id, side FROM signals WHERE strategyId = ? AND symbol = ? AND status = 'active' LIMIT 1",
              [id, symbol]
            );

            let shouldTrigger = false;
            if (isEntry) {
              // Only trigger entry if no active signal exists
              if (!activeSignal) {
                shouldTrigger = true;
              }
            } else {
              // Only trigger exit (sell/cover) if an active signal exists
              if (activeSignal) {
                // Ensure we are closing the correct side (e.g. 'sell' closes 'buy')
                const activeSide = activeSignal.side.toLowerCase();
                if ((signalSide === 'sell' && (activeSide === 'buy' || activeSide === 'long')) ||
                    (signalSide === 'cover' && activeSide === 'short')) {
                  shouldTrigger = true;
                }
              }
            }

            if (shouldTrigger && this.lastSignals[signalKey] !== signalSide) {
               this.lastSignals[signalKey] = signalSide;

               const signal = {
                 strategyId: id,
                 strategyName: strategy.name,
                 symbol: symbol,
                 side: signalSide,
                 price: currentPrice,
                 tp: initialTp,
                 sl: initialSl,
                 stakeAmount: config.stakeAmount,
                 timestamp: new Date().toISOString()
               };

               let pnl = 0;
               let finalStatus = isEntry ? 'active' : 'completed';

               if (!isEntry && activeSignal) {
                 if (activeSignal.side === 'buy' || activeSignal.side === 'long') {
                   pnl = ((currentPrice - activeSignal.price || currentPrice) / (activeSignal.price || currentPrice)) * 100;
                 } else {
                   pnl = ((activeSignal.price || currentPrice) - currentPrice) / (activeSignal.price || currentPrice) * 100;
                 }
                 await db.run("UPDATE signals SET status = 'closed', pnl = ? WHERE id = ?", [pnl, activeSignal.id]);
               }

               await db.run(
                 "INSERT INTO signals (strategyId, symbol, side, price, tp, sl, status, pnl, highestPrice, entryCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                 [signal.strategyId, signal.symbol, signal.side, signal.price, signal.tp, signal.sl, finalStatus, pnl, currentPrice, 1]
               );

               if (isEntry) {
                  console.log(`[Engine] >>> BROADCASTING ENTRY: ${strategy.name} ${signalSide} ${symbol} @ ${currentPrice}`);
                  await getTelegramService().broadcastSignal(signal);
               } else {
                  console.log(`[Engine] >>> EXIT SIGNAL: ${strategy.name} ${signalSide} ${symbol} @ ${currentPrice}`);
               }
            }
          } else {
            // If no signal side detected by indicators, clear the lastSignals cache for this symbol
            // to allow it to trigger again if conditions met in the next scan.
            const signalKey = `${id}_${symbol}`;
            delete this.lastSignals[signalKey];
          }
        } catch (e) {
           console.error(`[Engine] Error scanning ${symbol}: ${e.message}`);
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
    let signals = await db.query("SELECT * FROM signals WHERE strategyId = ? ORDER BY timestamp DESC LIMIT 50", [strategyId]);
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
           // Free users can only see closed/historical signals, live trades are hidden from the payload
           signals = signals.filter(s => s.status !== 'active');
         }
       }
    }
    // Maintain old API expected structure: { signals: [] } since some parts of the frontend might expect array directly, wrap if needed but we just return the array here as before.
    return signals;
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
