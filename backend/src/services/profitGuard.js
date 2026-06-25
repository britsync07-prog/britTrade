'use strict';

/**
 * profitGuard.js
 * ==============
 * Daily Profit Target Guard.
 *
 * Monitors each user's live trading profit in real-time.
 * If a user's total profit (unrealized + today's realized PnL) reaches
 * their configured profit target % of their allocated capital,
 * the guard automatically:
 *   1. Closes all open positions via market orders on Binance
 *   2. Disables live trading for that user
 *   3. Logs the event with full details
 *
 * Runs every 60 seconds for all users who have profit_guard_enabled = 1.
 */

const liveTradeDb = require('../liveTrading/liveTradeDb');
const { BinanceExecutor } = require('../liveTrading/binanceExecutor');
const { decrypt } = require('../liveTrading/encryptionUtils');
const { normalizeSymbol } = require('../liveTrading/symbolUtils');

class ProfitGuard {
  constructor() {
    this._interval = null;
    // Track users we've already triggered for today to avoid double-firing
    this._triggeredToday = new Set();
  }

  async start(intervalMs = 60000) {
    console.log('[ProfitGuard] 🛡️  Daily Profit Guard started (interval: 60s).');

    // Ensure schema columns exist
    await this._ensureSchema();

    // Initial run
    this._runCheck().catch(err => console.error('[ProfitGuard] Initial check failed:', err.message));

    // Reset the triggered set at midnight each day
    this._scheduleMidnightReset();

    this._interval = setInterval(() => {
      this._runCheck().catch(err => console.error('[ProfitGuard] Check cycle failed:', err.message));
    }, intervalMs);
  }

  async _ensureSchema() {
    try {
      const cols = await liveTradeDb.all('PRAGMA table_info(user_binance_config)');
      const colNames = cols.map(c => c.name);

      if (!colNames.includes('profit_guard_enabled')) {
        console.log('[ProfitGuard] 🛠️  Adding profit_guard_enabled column...');
        await liveTradeDb.run('ALTER TABLE user_binance_config ADD COLUMN profit_guard_enabled INTEGER DEFAULT 0');
      }
      if (!colNames.includes('profit_target_pct')) {
        console.log('[ProfitGuard] 🛠️  Adding profit_target_pct column...');
        await liveTradeDb.run('ALTER TABLE user_binance_config ADD COLUMN profit_target_pct REAL DEFAULT 1.5');
      }
    } catch (e) {
      console.error('[ProfitGuard] Schema migration failed:', e.message);
    }
  }

  _scheduleMidnightReset() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 5, 0); // 5 seconds after midnight
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      console.log('[ProfitGuard] 🌅 Midnight reset — clearing triggered user list.');
      this._triggeredToday.clear();
      // Schedule the next daily reset
      setInterval(() => {
        console.log('[ProfitGuard] 🌅 Daily reset — clearing triggered user list.');
        this._triggeredToday.clear();
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }

  async _runCheck() {
    try {
      // Get all users who have profit guard enabled
      const guardedUsers = await liveTradeDb.all(
        'SELECT * FROM user_binance_config WHERE profit_guard_enabled = 1 AND enabled = 1'
      );

      if (guardedUsers.length === 0) return;

      for (const userCfg of guardedUsers) {
        await this._checkUser(userCfg);
      }
    } catch (err) {
      console.error('[ProfitGuard] Run check error:', err.message);
    }
  }

  async _checkUser(userCfg) {
    const userId = userCfg.user_id;
    const label = `[ProfitGuard][U${userId}]`;

    // Don't re-trigger for users already handled today
    if (this._triggeredToday.has(userId)) return;

    try {
      const apiKey = decrypt(userCfg.api_key_enc);
      const apiSecret = decrypt(userCfg.api_sec_enc);
      if (!apiKey || !apiSecret) return;

      const targetPct = parseFloat(userCfg.profit_target_pct || 1.5);

      // --- 1. Get total allocated capital ---
      const stratConfigs = await liveTradeDb.getUserStrategyConfigs(userId);
      const totalCapital = stratConfigs.reduce((sum, s) => sum + (parseFloat(s.allocated_capital) || 0), 0);

      if (totalCapital <= 0) return; // No capital configured

      const profitTarget = (targetPct / 100) * totalCapital;

      // --- 2. Get today's realized PnL from closed orders ---
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayStartStr = todayStart.toISOString().replace('T', ' ').split('.')[0];

      const todayClosedOrders = await liveTradeDb.all(
        `SELECT real_pnl FROM live_orders 
         WHERE user_id = ? AND status = 'CLOSED' AND real_pnl IS NOT NULL 
         AND updated_at >= ?`,
        [userId, todayStartStr]
      );
      const todayRealizedPnl = todayClosedOrders.reduce((sum, o) => sum + parseFloat(o.real_pnl || 0), 0);

      // --- 3. Get unrealized PnL from Binance live positions ---
      let unrealizedPnl = 0;
      const executor = new BinanceExecutor();
      await executor.init(apiKey, apiSecret, userCfg.testnet === 1);

      const positions = await executor.getPositions();
      if (Array.isArray(positions)) {
        unrealizedPnl = positions.reduce((sum, p) => sum + parseFloat(p.unRealizedProfit || 0), 0);
      }

      const totalProfit = todayRealizedPnl + unrealizedPnl;
      const profitPct = totalCapital > 0 ? (totalProfit / totalCapital) * 100 : 0;

      console.log(`${label} Profit check: Capital=$${totalCapital.toFixed(2)} | Realized=$${todayRealizedPnl.toFixed(4)} | Unrealized=$${unrealizedPnl.toFixed(4)} | Total=$${totalProfit.toFixed(4)} (${profitPct.toFixed(2)}%) | Target=${targetPct}%`);

      // --- 4. Check if target is hit ---
      if (totalProfit >= profitTarget) {
        console.log(`${label} 🎯 PROFIT TARGET HIT! $${totalProfit.toFixed(2)} >= $${profitTarget.toFixed(2)} (${profitPct.toFixed(2)}% >= ${targetPct}%). Closing all trades...`);
        await this._closeAllAndDisable(userId, userCfg, executor, totalProfit, profitPct, targetPct, label);
      }
    } catch (err) {
      console.error(`${label} Check failed: ${err.message}`);
    }
  }

  async _closeAllAndDisable(userId, userCfg, executor, totalProfit, profitPct, targetPct, label) {
    // Mark as triggered immediately — prevents double-firing even if close takes time
    this._triggeredToday.add(userId);

    // --- STEP 1: Disable live trading FIRST so no new trades get placed while we close ---
    await liveTradeDb.setUserEnabled(userId, false);
    console.log(`${label} 🔴 Live trading DISABLED. Starting position close-out...`);

    let closedCount = 0;
    let failedCount = 0;
    const failedSymbols = [];

    try {
      // --- STEP 2: Fetch all open Binance positions ---
      const positions = await executor.getPositions();

      if (!Array.isArray(positions) || positions.length === 0) {
        console.log(`${label} No open positions found on Binance.`);
      } else {
        const activePositions = positions.filter(p => Math.abs(parseFloat(p.positionAmt || 0)) > 0.000001);
        console.log(`${label} Found ${activePositions.length} active position(s) to close.`);

        // Get all open orders from DB for matching
        const openOrders = await liveTradeDb.all(
          `SELECT * FROM live_orders WHERE user_id = ? AND UPPER(status) IN ('OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED')`,
          [userId]
        );

        for (const pos of activePositions) {
          const posAmt = parseFloat(pos.positionAmt);
          const closeSide = posAmt > 0 ? 'sell' : 'buy';
          const closeQty = Math.abs(posAmt);

          // Find matching DB order (best-effort)
          const matchingOrder = openOrders.find(o => {
            const cleanSym = o.symbol.replace('/', '').replace(':', '');
            return cleanSym === pos.symbol || o.symbol === pos.symbol;
          });
          const symbol = matchingOrder?.symbol || pos.symbol.replace('USDT', '/USDT');
          const strategyId = matchingOrder?.strategy_id || 1;

          // --- Retry loop: up to 3 attempts per position ---
          let success = false;
          let lastError = '';
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              if (attempt > 1) {
                console.log(`${label} Retry ${attempt}/3 for ${symbol}...`);
                await new Promise(r => setTimeout(r, 2000)); // 2s delay between retries
              }

              const closeResult = await executor.placeOrder(
                symbol, closeSide, 0, 'market', null, strategyId, 1, closeQty, true
              );

              if (!closeResult.error) {
                console.log(`${label} ✅ [Attempt ${attempt}] Closed ${symbol} ${closeSide.toUpperCase()} qty=${closeQty}`);
                success = true;
                break;
              } else {
                lastError = closeResult.error;
                console.warn(`${label} ⚠️ [Attempt ${attempt}] Close failed for ${symbol}: ${lastError}`);
              }
            } catch (e) {
              lastError = e.message;
              console.warn(`${label} ⚠️ [Attempt ${attempt}] Exception closing ${symbol}: ${e.message}`);
            }
          }

          if (success) {
            closedCount++;
            if (matchingOrder) {
              await liveTradeDb.updateOrder(matchingOrder.id, { status: 'CLOSED' });
            }
          } else {
            failedCount++;
            failedSymbols.push(symbol);
            console.error(`${label} ❌ COULD NOT CLOSE ${symbol} after 3 attempts. Last error: ${lastError}`);
            // Mark DB as FAILED_TO_CLOSE so it's visible on the dashboard — NOT silently CLOSED
            if (matchingOrder) {
              await liveTradeDb.updateOrder(matchingOrder.id, {
                status: 'OPEN',
                error_msg: `ProfitGuard close failed: ${lastError}`
              });
            }
          }
        }
      }

      // --- STEP 3: Verification pass — re-fetch positions and confirm they are 0 ---
      await new Promise(r => setTimeout(r, 1500)); // Brief wait for Binance to settle
      const verifyPositions = await executor.getPositions().catch(() => []);
      const stillOpen = Array.isArray(verifyPositions)
        ? verifyPositions.filter(p => Math.abs(parseFloat(p.positionAmt || 0)) > 0.000001)
        : [];

      if (stillOpen.length > 0) {
        const symbols = stillOpen.map(p => p.symbol).join(', ');
        console.error(`${label} ⚠️ VERIFICATION: ${stillOpen.length} position(s) STILL OPEN on Binance after close-out: ${symbols}`);
        await liveTradeDb.addLog('error',
          `⚠️ ProfitGuard: ${stillOpen.length} position(s) could not be closed on Binance after 3 attempts: ${symbols}. Manual intervention required.`,
          { user_id: userId }
        );
      } else {
        console.log(`${label} ✅ VERIFICATION PASSED: All positions confirmed closed on Binance.`);
      }

      // --- STEP 4: Audit log ---
      const logMsg = [
        `🎯 PROFIT TARGET REACHED: ${profitPct.toFixed(2)}% of capital (target: ${targetPct}%).`,
        `Total profit: $${totalProfit.toFixed(2)}.`,
        `Closed: ${closedCount} position(s).`,
        failedCount > 0 ? `⚠️ FAILED TO CLOSE: ${failedCount} position(s) — ${failedSymbols.join(', ')}. Manual intervention needed.` : '',
        `Live trading DISABLED.`,
      ].filter(Boolean).join(' ');

      await liveTradeDb.addLog('warn', logMsg, { user_id: userId });
      console.log(`${label} ${logMsg}`);

    } catch (err) {
      console.error(`${label} Critical error during close-all: ${err.message}`);
      await liveTradeDb.addLog('error',
        `❌ ProfitGuard critical failure during close-all: ${err.message}. Live trading is DISABLED but positions may still be open.`,
        { user_id: userId }
      );
    }
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

module.exports = new ProfitGuard();
