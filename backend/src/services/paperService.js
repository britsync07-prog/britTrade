const db = require('../db');

function getTelegramService() {
  return require('./telegramService');
}

class PaperService {
  async executeTrade(userId, strategyId, symbol, side, price, stakeAmount = 100) {
    const sub = await db.get("SELECT * FROM subscriptions WHERE userId = ? AND strategyId = ?", [userId, strategyId]);
    if (!sub) return;

    if (!sub.useVirtualBalance) {
      return; // Only log signal if useSignal is true, handled at signal dispatcher/telegram
    }

    const existingTrade = await db.get(
      "SELECT id FROM trades WHERE userId = ? AND strategyId = ? AND symbol = ? AND status = 'open'",
      [userId, strategyId, symbol]
    );

    if (existingTrade && (side === 'buy' || side === 'short')) {
      console.log(`[Paper] SIGNAL BLOCKED: Already in an open position for ${symbol}. (Trade ID: ${existingTrade.id})`);
      return;
    }

    const amount = stakeAmount / price; 
    const cost = stakeAmount;

    if (side === 'buy' || side === 'short') {
      if (sub.allocatedBalance < cost) {
         console.warn(`[Paper] Insufficient allocated balance for User ${userId}. Cost: $${cost}`);
         return;
      }
      
      await db.run(
        `INSERT INTO trades (userId, strategyId, symbol, side, price, amount, status, pnl, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [userId, strategyId, symbol, side, price, amount, 'open', 0]
      );
      
      // Deduct from allocation
      await db.run("UPDATE subscriptions SET allocatedBalance = allocatedBalance - ? WHERE userId = ? AND strategyId = ?", [cost, userId, strategyId]);
      console.log(`[Paper] OPENED ${side.toUpperCase()} ${symbol} @ ${price}`);
      
    } else if (side === 'sell' || side === 'cover') {
      const entrySide = side === 'sell' ? 'buy' : 'short';
      const openTrade = await db.get(
        "SELECT * FROM trades WHERE userId = ? AND strategyId = ? AND symbol = ? AND side = ? AND status = 'open' ORDER BY id ASC LIMIT 1",
        [userId, strategyId, symbol, entrySide]
      );

      if (openTrade) {
        let pnl = 0;
        if (entrySide === 'buy') {
           pnl = (price - openTrade.price) * openTrade.amount;
        } else {
           pnl = (openTrade.price - price) * openTrade.amount;
        }
        
        await db.run("UPDATE trades SET status = 'closed', pnl = ? WHERE id = ?", [pnl, openTrade.id]);
        
        const returnAmount = (openTrade.price * openTrade.amount) + pnl;
        await db.run("UPDATE subscriptions SET allocatedBalance = allocatedBalance + ? WHERE userId = ? AND strategyId = ?", [returnAmount, userId, strategyId]);
        
        // Notify Telegram about the exit (ONLY to the specific user who owned the trade)
        const user = await db.get("SELECT telegramId FROM users WHERE id = ?", [userId]);
        if (user && user.telegramId) {
            const strategy = await db.get("SELECT name FROM strategies WHERE id = ?", [strategyId]);
            await getTelegramService().notifyTradeClosed(
              user.telegramId,
              strategy?.name || 'Unknown',
              symbol,
              side,
              price,
              pnl
            );
        }

        console.log(`[Paper] CLOSED ${side.toUpperCase()} ${symbol} @ ${price} | PnL: $${pnl.toFixed(4)}`);
      }
    }
  }

  async getHistory(userId) {
     return await db.query("SELECT * FROM trades WHERE userId = ? ORDER BY timestamp DESC", [userId]);
  }

  async start(userId) { return { status: 'Active' }; }
  async stop(userId) { return { status: 'Stopped' }; }
  
  async getTrades(userId) { return await this.getHistory(userId); }
  
  async getPerformance(userId) {
    const trades = await this.getHistory(userId);
    const totalPnL = trades.reduce((acc, t) => acc + (t.pnl || 0), 0);
    const winRate = trades.filter(t => t.status === 'closed').length > 0 
      ? (trades.filter(t => t.status === 'closed' && t.pnl > 0).length / trades.filter(t => t.status === 'closed').length) * 100 
      : 0;
    return {
      totalPnL,
      winRate,
      tradeCount: trades.length
    };
  }

  async handleSignal(signal) {
    console.log(`[PaperService] Dispatching signal ${signal.side} on ${signal.symbol} to subscribers...`);
    const subscribers = await db.query("SELECT * FROM subscriptions WHERE strategyId = ?", [signal.strategyId]);
    for (const sub of subscribers) {
      await this.executeTrade(sub.userId, signal.strategyId, signal.symbol, signal.side, signal.price, signal.stakeAmount);
    }
  }
}
module.exports = new PaperService();
