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
    for (const s of strategies) {
      // 0. Just-In-Time Reset Check (Self-healing)
      await paperTradeService.checkAndReset(s.id);

      // 1. Get raw signals
      const budget = await db.get("SELECT lastReset FROM strategy_daily_budgets WHERE strategyId = ?", [s.id]);
      const lastReset = budget ? budget.lastReset : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const allSignals = await db.query("SELECT pnl, status FROM signals WHERE strategyId = ?", [s.id]);
      const signals24h = await db.query(
        "SELECT pnl, status FROM signals WHERE strategyId = ? AND timestamp >= ?",
        [s.id, lastReset]
      );

      const isClosed = (sig) => ['closed', 'completed', 'tp_hit', 'sl_hit'].includes(sig.status);
      const closed = allSignals.filter(isClosed);
      const wins = closed.filter(sig => sig.status === 'tp_hit' || (sig.pnl || 0) > 0);

      const config = this.configs[s.name];

      // 2. Calculate True Daily Profit from Paper Trades (Since Reset)
      const tradesSinceReset = await db.query(
        "SELECT SUM(pnlUsd) as total FROM paper_trades WHERE strategyId = ? AND closedAt >= ?",
        [s.id, lastReset]
      );
      const realizedDaily = parseFloat(tradesSinceReset[0].total || 0);

      // 3. Unrealized PnL (ONLY for trades that have a matching active signal)
      const openTrades = await db.query(`
        SELECT pt.* FROM paper_trades pt
        JOIN signals sig ON pt.signalId = sig.id
        WHERE pt.strategyId = ? AND pt.status = 'open' AND sig.status = 'active'
      `, [s.id]);
      
      let unrealizedPnl = 0;
      for (const t of openTrades) {
        let livePrice = signalEngine.latestPrices[t.symbol] || t.entryPrice;
        const isLong = t.side === 'buy' || t.side === 'long';
        let pnlPct = 0;

        if (isLong) pnlPct = ((livePrice - t.entryPrice) / t.entryPrice) * 100 * t.leverage;
        else pnlPct = ((t.entryPrice - livePrice) / t.entryPrice) * 100 * t.leverage;

        const liquidationThreshold = t.leverage > 1 ? -85 : -100;
        if (pnlPct <= liquidationThreshold) pnlPct = liquidationThreshold;
        unrealizedPnl += t.margin * (pnlPct / 100);
      }

      const profit24hUsd = realizedDaily + unrealizedPnl;
      const sumSignals24h = signals24h.reduce((acc, sig) => acc + (Number(sig.pnl) || 0), 0);

      // pnl24h should ideally represent the % return on the $100 budget
      s.pnl24h = (profit24hUsd).toFixed(2); 
      s.prof24h = profit24hUsd.toFixed(2);
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
    let signals = await db.query(`
      SELECT sig.* FROM signals sig
      JOIN strategy_daily_budgets sdb ON sdb.strategyId = sig.strategyId
      WHERE sig.strategyId = ? AND sig.timestamp >= sdb.lastReset
      ORDER BY sig.timestamp DESC
    `, [strategyId]);
    if (userId && !isAdmin) {
      const planToStrat = { 1: 'low_risk', 2: 'medium_risk', 3: 'high_risk' };
      const targetPlan = planToStrat[Number(strategyId)];
      if (targetPlan) {
        const now = new Date().toISOString();
        const hasPurchase = await db.get(
          "SELECT id FROM purchases WHERE userId = ? AND (planId = ? OR planId = 'bundle') AND (expiresAt IS NULL OR expiresAt > ?)",
          [userId, targetPlan, now]
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
