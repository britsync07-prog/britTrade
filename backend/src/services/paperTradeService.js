const db = require('../db');
const axios = require('axios');


// Lazy-loaded to avoid circular require issues if needed
let strategyService = null;
function getStrategyService() {
  if (!strategyService) strategyService = require('./strategyService');
  return strategyService;
}

class PaperTradeService {
  constructor() {
    this.FEE_PERCENTAGE = 0.001; // 0.1%
    this.TRADE_MARGIN = 10.0;
    this.MAX_CONCURRENT_TRADES = 10;
    this.cleanupGhostTrades();
  }

  cleanupGhostTrades() {
    setTimeout(async () => {
      try {
        const budgets = await db.query("SELECT * FROM strategy_daily_budgets");
        for (const b of budgets) {
          const ghostTrades = await db.query(
            "SELECT * FROM paper_trades WHERE strategyId = ? AND status = 'open' AND timestamp < ?",
            [b.strategyId, b.lastReset]
          );
          for (const t of ghostTrades) {
            await db.run("UPDATE paper_trades SET status = 'closed', exitPrice = entryPrice, pnlUsd = 0, feeUsd = 0, closedAt = CURRENT_TIMESTAMP WHERE id = ?", [t.id]);
            console.log(`[PaperTrade] Repaired ghost trade: ${t.id} for sys ${t.strategyId}`);
          }
        }
      } catch (e) {
        console.error('[PaperTrade] Cleanup Error:', e.message);
      }
    }, 5000);
  }

  async getValidBudget(strategyId) {
    let budget = await db.get("SELECT * FROM strategy_daily_budgets WHERE strategyId = ?", [strategyId]);
    if (!budget) {
      await db.run("INSERT INTO strategy_daily_budgets (strategyId, currentBalance) VALUES (?, ?)", [strategyId, 100.0]);
      budget = { strategyId, currentBalance: 100.0, lastReset: new Date().toISOString() };
    }
    return budget;
  }

  async openPaperTrade(strategyId, signalId, symbol, side, rawPrice, leverage = 1, atr = 0) {
    // 1. Check budget
    const budget = await this.getValidBudget(strategyId);
    if (budget.currentBalance < this.TRADE_MARGIN) {
      console.log(`[PaperTrade] Skipped for strat ${strategyId}: Not enough balance ($${budget.currentBalance})`);
      return false;
    }

    // 2. Check max concurrent trades
    const activeTrades = await db.query(
      "SELECT count(*) as count FROM paper_trades WHERE strategyId = ? AND status = 'open'",
      [strategyId]
    );
    if (activeTrades[0].count >= this.MAX_CONCURRENT_TRADES) {
      console.log(`[PaperTrade] Skipped for strat ${strategyId}: Max trades reached (${this.MAX_CONCURRENT_TRADES})`);
      return false;
    }

    // Execution Engine (Slippage & Spread)
    const slippage = atr > 0 ? (atr / rawPrice) * 0.1 : 0.001; // Dynamic 10% ATR slippage
    const spread = 0.0005; // 0.05% baseline spread
    const penalty = spread + slippage;
    
    // Simulate real-world bid/ask limit crossing
    const fillPrice = side === 'buy' || side === 'long' 
      ? rawPrice * (1 + penalty) 
      : rawPrice * (1 - penalty);

    // 3. Deduct margin from budget
    const newBalance = budget.currentBalance - this.TRADE_MARGIN;
    await db.run("UPDATE strategy_daily_budgets SET currentBalance = ? WHERE strategyId = ?", [newBalance, strategyId]);

    // Apply Entry Fee immediately in memory
    const positionSize = this.TRADE_MARGIN * leverage;
    const entryFeeUsd = positionSize * this.FEE_PERCENTAGE; // 0.1%

    // 4. Create paper trade
    await db.run(
      "INSERT INTO paper_trades (strategyId, signalId, symbol, margin, leverage, side, entryPrice, feeUsd, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')",
      [strategyId, signalId, symbol, this.TRADE_MARGIN, leverage, side, fillPrice, entryFeeUsd]
    );

    console.log(`[PaperTrade] Opened trade for ${symbol} | Target: $${rawPrice.toFixed(4)} | Filled: $${fillPrice.toFixed(4)} | Slippage+Spread Penalty: ${(penalty*100).toFixed(3)}%`);
    return true;
  }

  async closePaperTrade(signalId, rawExitPrice, atr = 0) {
    const trade = await db.get("SELECT * FROM paper_trades WHERE signalId = ? AND status = 'open'", [signalId]);
    if (!trade) return false;

    // Execution Engine (Exit Spread & Slippage)
    const slippage = atr > 0 ? (atr / rawExitPrice) * 0.1 : 0.001; 
    const spread = 0.0005;
    const penalty = spread + slippage;

    const isLong = trade.side === 'buy' || trade.side === 'long';
    // Exit slip: If long, you sell to close (lower). If short, you buy to cover (higher).
    const fillPrice = isLong 
      ? rawExitPrice * (1 - penalty) 
      : rawExitPrice * (1 + penalty);

    let pnlPct = 0;
    if (isLong) {
      pnlPct = ((fillPrice - trade.entryPrice) / trade.entryPrice) * 100 * trade.leverage;
    } else {
      pnlPct = ((trade.entryPrice - fillPrice) / trade.entryPrice) * 100 * trade.leverage;
    }

    // Real Binance Liquidation Model (95% Maintenance Margin for 5x tier)
    if (pnlPct <= -95) pnlPct = -100;

    const pnlUsd = trade.margin * (pnlPct / 100);
    const positionSize = trade.margin * trade.leverage;
    
    // Apply Exit Fee (0.1%)
    const exitFeeUsd = positionSize * this.FEE_PERCENTAGE; 
    
    // Resolve Double Fees (Entry stored in DB + Exit)
    const totalFeeUsd = trade.feeUsd + exitFeeUsd;
    const netPnlUsd = pnlUsd - totalFeeUsd;
    
    // Return margin + net pnl to budget
    const returnedAmount = trade.margin + netPnlUsd;

    await db.run(
      "UPDATE paper_trades SET status = 'closed', exitPrice = ?, pnlUsd = ?, feeUsd = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [fillPrice, netPnlUsd, totalFeeUsd, trade.id]
    );

    await db.run(
      "UPDATE strategy_daily_budgets SET currentBalance = currentBalance + ? WHERE strategyId = ?",
      [returnedAmount, trade.strategyId]
    );

    console.log(`[PaperTrade] Closed ${trade.symbol} | PnL: $${netPnlUsd.toFixed(2)} (Total Fees: $${totalFeeUsd.toFixed(2)})`);
    return true;
  }

  async fetchCurrentPrice(symbol) {
    try {
      const bSymbol = symbol.replace('/', '').replace(':', '').replace('USDTUSDT', 'USDT');
      const res = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${bSymbol}`);
      return parseFloat(res.data.price);
    } catch (e) {
      return 0;
    }
  }

  startDailyResetJob() {
    // Run every minute and check if 24h passed
    // Alternatively, just run it at exactly 00:00 UTC using node-schedule
    
    // To make it run locally without external libs, let's use setInterval
    setInterval(async () => {
      try {
        const budgets = await db.query("SELECT * FROM strategy_daily_budgets");
        for (const budget of budgets) {
          const lastReset = new Date(budget.lastReset).getTime();
          const now = Date.now();
          const ONE_DAY = 24 * 60 * 60 * 1000;
          
          if (now - lastReset >= ONE_DAY) {
            console.log(`[PaperTrade] Executing 24h reset for strategy ${budget.strategyId}...`);
            
            // 1. Force close all open trades
            const openTrades = await db.query(
              "SELECT * FROM paper_trades WHERE strategyId = ? AND status = 'open'",
              [budget.strategyId]
            );
            
            for (const trade of openTrades) {
              const livePrice = await this.fetchCurrentPrice(trade.symbol);
              const closePrice = livePrice > 0 ? livePrice : trade.entryPrice;
              await this.closePaperTrade(trade.signalId, closePrice);
            }

            // 2. Reset balance to 100
            await db.run(
              "UPDATE strategy_daily_budgets SET currentBalance = 100.0, lastReset = CURRENT_TIMESTAMP WHERE strategyId = ?",
              [budget.strategyId]
            );
            console.log(`[PaperTrade] Reset complete for strategy ${budget.strategyId}. Balance is $100.`);
          }
        }
      } catch(e) {
        console.error('[PaperTrade] Reset Check Error:', e.message);
      }
    }, 60 * 1000); // Check every minute
  }
}

module.exports = new PaperTradeService();
