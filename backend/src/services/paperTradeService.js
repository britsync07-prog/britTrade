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

  async openPaperTrade(strategyId, signalId, symbol, side, entryPrice, leverage = 1) {
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

    // 3. Deduct margin from budget
    const newBalance = budget.currentBalance - this.TRADE_MARGIN;
    await db.run("UPDATE strategy_daily_budgets SET currentBalance = ? WHERE strategyId = ?", [newBalance, strategyId]);

    // 4. Create paper trade
    await db.run(
      "INSERT INTO paper_trades (strategyId, signalId, symbol, margin, leverage, side, entryPrice, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')",
      [strategyId, signalId, symbol, this.TRADE_MARGIN, leverage, side, entryPrice]
    );

    console.log(`[PaperTrade] Opened trade for ${symbol} | Margin: $${this.TRADE_MARGIN} | New Balance: $${newBalance}`);
    return true;
  }

  async closePaperTrade(signalId, exitPrice) {
    const trade = await db.get("SELECT * FROM paper_trades WHERE signalId = ? AND status = 'open'", [signalId]);
    if (!trade) return false;

    const isLong = trade.side === 'buy' || trade.side === 'long';
    let pnlPct = 0;
    
    if (isLong) {
      pnlPct = ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100 * trade.leverage;
    } else {
      pnlPct = ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100 * trade.leverage;
    }

    // Liquidation Check
    if (pnlPct <= -100) pnlPct = -100;

    const pnlUsd = trade.margin * (pnlPct / 100);
    const positionSize = trade.margin * trade.leverage;
    
    // 1% fee on total position size? Or just 1% of Margin? 
    // Usually 1% fee is on position size, which might wipe out the account. 
    // Let's do 1% of trade.margin for safety, or 1% of total outcome.
    // User said "1% fee per trade". If position is $50, 1% is $0.50.
    const feeUsd = positionSize * this.FEE_PERCENTAGE; 

    const netPnlUsd = pnlUsd - feeUsd;
    
    // Return margin + net pnl to budget
    const returnedAmount = trade.margin + netPnlUsd;

    await db.run(
      "UPDATE paper_trades SET status = 'closed', exitPrice = ?, pnlUsd = ?, feeUsd = ?, closedAt = CURRENT_TIMESTAMP WHERE id = ?",
      [exitPrice, netPnlUsd, feeUsd, trade.id]
    );

    await db.run(
      "UPDATE strategy_daily_budgets SET currentBalance = currentBalance + ? WHERE strategyId = ?",
      [returnedAmount, trade.strategyId]
    );

    console.log(`[PaperTrade] Closed ${trade.symbol} | PnL: $${netPnlUsd.toFixed(2)} (Fee: $${feeUsd.toFixed(2)})`);
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
            
            // 1. Reset balance to 100 (Do NOT force close trades anymore)
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
