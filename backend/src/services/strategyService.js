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
          if (sig.strategyId === 1 && pnl < -5 && (sig.entryCount || 1) <= 10) {
            const currentEntryCount = sig.entryCount || 1;
            const newEntryCount = currentEntryCount + 1;
            const newAvgPrice = ((sig.price * currentEntryCount) + currentPrice) / newEntryCount;
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
              sig.side === 'buy' || sig.side === 'long' ? 'sell' : 'cover',
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
      const signals = await db.query(
        "SELECT pnl, status FROM signals WHERE strategyId = ? AND timestamp > ? AND status != 'active'",
        [s.id, yesterday]
      );
      const closed = signals.filter(t => ['closed', 'completed', 'tp_hit', 'sl_hit'].includes(t.status));
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
      "SELECT s.*, sub.useSignal FROM strategies s JOIN subscriptions sub ON s.id = sub.strategyId WHERE sub.userId = ?",
      [userId]
    );
  }

  async subscribe(userId, strategyId, useSignal = true) {
    try {
      console.log(`[StrategyService] Subscribing user ${userId} to strategy ${strategyId}`);
      return await db.run("INSERT OR REPLACE INTO subscriptions (userId, strategyId, useSignal) VALUES (?, ?, ?)", [userId, strategyId, useSignal]);
    } catch (error) {
      console.error(`[StrategyService] subscribe failed for user ${userId}, strategy ${strategyId}:`, error);
      throw error;
    }
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

    await this.stopStrategy(id);

    const strategy = await db.get("SELECT * FROM strategies WHERE id = ?", [id]);
    if (!strategy) throw new Error("Strategy not found");

    const config = this.configs[strategy.name] || {
      symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT'],
      timeframe: '5m',
      stakeAmount: 100
    };

    console.log(`[Engine] >>> BOOTING CONTINUOUS SCAN: ${strategy.name} on ${config.symbols.length} markets (${config.timeframe})`);

    // Define the core scanning logic
    const scanFunction = async () => {
      if (Math.random() < 0.1) {
         console.log(`[Engine] ${strategy.name} Heartbeat: Scanning ${config.symbols.length} pairs...`);
      }

      for (const symbol of config.symbols) {
        try {
          let signalSide = null;
          let currentPrice = 0;
          let data = null;
          let initialTp = 0;
          let initialSl = 0;

          // Fetch market data
          data = await this.fetchOHLC(symbol, config.timeframe);
          currentPrice = data.price;

          // 1. TrendFollower Logic
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
                initialTp = currentPrice * 101.0; 
                initialSl = currentPrice * 0.90; 
              } else if (st.direction === -1) {
                signalSide = 'sell';
              }
            }
          } 
          // 2. GridMeanReversion Logic
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
          // 3. UltimateFuturesScalper Logic
          else if (strategy.name === 'UltimateFuturesScalper') {
            const rsi = RSI.calculate({ period: 14, values: data.closes });
            if (rsi.length > 0) {
              const currentRsi = rsi[rsi.length - 1];
              const lastVol = data.volumes[data.volumes.length-1];
              const activeSignal = await db.get(
                "SELECT side FROM signals WHERE strategyId = ? AND symbol = ? AND status = 'active' LIMIT 1",
                [id, symbol]
              );
              const activeSide = (activeSignal?.side || '').toLowerCase();

              if ((activeSide === 'buy' || activeSide === 'long') && currentRsi > 50) {
                signalSide = 'sell'; 
              } else if (activeSide === 'short' && currentRsi < 50) {
                signalSide = 'cover'; 
              } else if (!activeSignal && currentRsi < 30 && lastVol > 0) {
                signalSide = 'buy';
                initialTp = currentPrice * 1.005;
                initialSl = currentPrice * 0.90;
              } else if (!activeSignal && currentRsi > 70 && lastVol > 0) {
                signalSide = 'short'; 
                initialTp = currentPrice * 0.995;
                initialSl = currentPrice * 1.10;
              }
            }
          }

          if (signalSide) {
            const signalKey = `${id}_${symbol}`;
            const isEntry = ['buy', 'long', 'short'].includes(signalSide.toLowerCase());

            const activeSignal = await db.get(
              "SELECT id, side, price FROM signals WHERE strategyId = ? AND symbol = ? AND status = 'active' LIMIT 1",
              [id, symbol]
            );

            let shouldTrigger = false;
            if (isEntry) {
              if (!activeSignal) shouldTrigger = true;
            } else {
              if (activeSignal) {
                const activeSide = activeSignal.side.toLowerCase();
                const signalPnl = activeSignal.side === 'buy' || activeSignal.side === 'long'
                  ? ((currentPrice - activeSignal.price) / activeSignal.price) * 100
                  : ((activeSignal.price - currentPrice) / activeSignal.price) * 100;
                const respectsExitProfitOnly = ![1, 3].includes(id) || signalPnl > 0;

                if (respectsExitProfitOnly &&
                    ((signalSide === 'sell' && (activeSide === 'buy' || activeSide === 'long')) ||
                    (signalSide === 'cover' && activeSide === 'short'))) {
                  shouldTrigger = true;
                }
              }
            }

            if (shouldTrigger && this.lastSignals[signalKey] !== signalSide) {
               this.lastSignals[signalKey] = signalSide;

               let pnl = 0;
               let finalStatus = isEntry ? 'active' : 'completed';

               if (!isEntry && activeSignal) {
                 const entryPrice = activeSignal.price || currentPrice;
                 if (activeSignal.side === 'buy' || activeSignal.side === 'long') {
                   pnl = ((currentPrice - entryPrice) / entryPrice) * 100;
                 } else {
                   pnl = ((entryPrice - currentPrice) / entryPrice) * 100;
                 }
                 await db.run("UPDATE signals SET status = 'closed', pnl = ? WHERE id = ?", [pnl, activeSignal.id]);
               }

               await db.run(
                 "INSERT INTO signals (strategyId, symbol, side, price, tp, sl, status, pnl, highestPrice, entryCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                 [id, symbol, signalSide, currentPrice, initialTp, initialSl, finalStatus, pnl, currentPrice, 1]
               );

               if (isEntry) {
                  console.log(`[Engine] >>> BROADCASTING ENTRY: ${strategy.name} ${signalSide} ${symbol} @ ${currentPrice}`);
                  await getTelegramService().broadcastSignal({
                    strategyId: id,
                    strategyName: strategy.name,
                    symbol: symbol,
                    side: signalSide,
                    price: currentPrice,
                    tp: initialTp,
                    sl: initialSl,
                    stakeAmount: config.stakeAmount
                  });
               } else {
                  console.log(`[Engine] >>> EXIT SIGNAL: ${strategy.name} ${signalSide} ${symbol} @ ${currentPrice}`);
                  await getTelegramService().broadcastClose(id, symbol, signalSide, currentPrice, pnl, finalStatus);
               }
            }
          } else {
            const signalKey = `${id}_${symbol}`;
            delete this.lastSignals[signalKey];
          }
        } catch (e) {
           // Silently handle per-symbol errors to prevent killing the whole interval
           if (Math.random() < 0.05) console.error(`[Engine Error] ${symbol}: ${e.message}`);
        }
      }
    };

    // Run once immediately
    scanFunction().catch(e => console.error(`[Engine Error] Initial scan failed for ${strategy.name}:`, e.message));

    // Then run every 7 seconds
    const interval = setInterval(scanFunction, 7000);

    this.runningProcesses.set(id, interval);
    return {
      status: 'Started (Live API Mode)',
      strategy: strategy.name,
      mode: strategy.type
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
           // Free users can only see closed/historical signals; live signals are hidden from the payload
           signals = signals.filter(s => s.status !== 'active');
         }
       }
    }
    // Standardizing API structure: always return an object with a signals key
    return { signals };
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
