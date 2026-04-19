const db = require('../db');
const axios = require('axios');
const signalEngine = require('./signalEngine');
const paperTradeService = require('./paperTradeService');

class StrategyService {
  constructor() {
    this.configs = this.loadConfigs();
    signalEngine.startSignalTracker(this.configs);
    paperTradeService.startDailyResetJob();
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
          const cleanSymbols = (json.exchange.pair_whitelist || []).map(s => s.split(':')[0]);
          configs[stratName] = {
            symbols: cleanSymbols,
            timeframe: json.timeframe || '1h',
            tradingMode: json.trading_mode || 'spot',
            stakeAmount: json.stake_amount || 10
          };
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
      // 1. Get raw signals
      const allSignals = await db.query("SELECT pnl, status FROM signals WHERE strategyId = ?", [s.id]);
      const signals24h = await db.query(
        "SELECT pnl, status FROM signals WHERE strategyId = ? AND timestamp > ?",
        [s.id, yesterday]
      );

      const isClosed = (sig) => ['closed', 'completed', 'tp_hit', 'sl_hit'].includes(sig.status);
      const closed = allSignals.filter(isClosed);
      const wins = closed.filter(sig => sig.status === 'tp_hit' || (sig.pnl || 0) > 0);

      const config = this.configs[s.name];

      // 2. Fetch Paper Trade Daily Budget
      const budget = await paperTradeService.getValidBudget(s.id);
      const balance24h = budget.currentBalance;
      const profit24hUsd = balance24h - 100.0; // Subtract initial $100 budget

      s.prof24h = profit24hUsd.toFixed(2); // Set it to USD profit directly for 24h
      s.signalCount = allSignals.length;
      s.activeSignalCount = allSignals.filter(sig => sig.status === 'active').length;
      s.closedSignalCount = closed.length;
      s.winRate = closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : '0.0';
      s.pairCount = config?.symbols?.length || 0;
      s.symbols = config?.symbols || [];
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
    return await db.run("INSERT OR REPLACE INTO subscriptions (userId, strategyId, useSignal) VALUES (?, ?, ?)", [userId, strategyId, useSignal]);
  }

  async unsubscribe(userId, strategyId) {
    return await db.run("DELETE FROM subscriptions WHERE userId = ? AND strategyId = ?", [userId, strategyId]);
  }

  async runStrategy(strategyId) {
    const id = parseInt(strategyId, 10);
    const strategy = await db.get("SELECT * FROM strategies WHERE id = ?", [id]);
    signalEngine.runStrategy(id, this.configs, strategy);
    return {
      status: 'Started (Live API Mode)',
      strategy: strategy.name,
      mode: strategy.type
    };
  }

  async stopStrategy(strategyId) {
    signalEngine.stopStrategy(parseInt(strategyId, 10));
    return { status: 'Stopped' };
  }

  async getSignals(strategyId, userId = null, isAdmin = false) {
    let signals = await db.query("SELECT * FROM signals WHERE strategyId = ? ORDER BY timestamp DESC LIMIT 50", [strategyId]);
    if (userId && !isAdmin) {
       const planToStrat = { 1: 'low_risk', 2: 'medium_risk', 3: 'high_risk' };
       const targetPlan = planToStrat[Number(strategyId)];
       if (targetPlan) {
         const hasPurchase = await db.get(
           "SELECT id FROM purchases WHERE userId = ? AND (planId = ? OR planId = 'bundle')",
           [userId, targetPlan]
         );
         if (!hasPurchase) signals = signals.filter(s => s.status !== 'active');
       }
    }
    return { signals };
  }

  async getChartHistory(symbol, timeframe = '1h') {
    try {
      const symbolMap = { 'BTC/USDT': 'BTCUSDT', 'ETH/USDT': 'ETHUSDT', 'SOL/USDT': 'SOLUSDT', 'ADA/USDT': 'ADAUSDT', 'XRP/USDT': 'XRPUSDT' };
      const bSymbol = symbolMap[symbol] || 'BTCUSDT';
      const intervalMap = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d' };
      const interval = intervalMap[timeframe] || '1h';

      const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${bSymbol}&interval=${interval}&limit=100`);
      return res.data.map(k => [k[0], parseFloat(k[1]), parseFloat(k[2]), parseFloat(k[3]), parseFloat(k[4])]);
    } catch (e) {
      return [];
    }
  }

  async getPrices() {
    return signalEngine.latestPrices;
  }
}

module.exports = new StrategyService();
