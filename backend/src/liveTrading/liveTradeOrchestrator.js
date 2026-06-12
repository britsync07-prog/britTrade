'use strict';

/**
 * liveTradeOrchestrator.js
 * ========================
 * The brain of the live trading system.
 *
 * Responsibilities:
 *  - Initialize itself from the DB on startup
 *  - Expose handleSignal(signal) for the signal engine to call
 *  - Check global + per-strategy config before placing any order
 *  - Use binanceExecutor to place orders
 *  - Persist orders + logs to liveTradeDb
 *  - Auto kill-switch: disable live trading if too many consecutive errors
 *
 * Signal shape (from signalEngine):
 *  {
 *    strategyId: number,
 *    symbol:     string,     // e.g. "BTC/USDT"
 *    side:       string,     // "buy"|"sell"|"long"|"short"|"cover"
 *    price:      number,
 *    tp:         number,
 *    sl:         number,
 *    signalId:   number,     // DB id of the signal row
 *    isEntry:    boolean,
 *  }
 */

const liveTradeDb = require('./liveTradeDb');
const binanceExecutor = require('./binanceExecutor');
const { BinanceExecutor } = require('./binanceExecutor');
const { decrypt } = require('./encryptionUtils');
const { normalizeSymbol } = require('./symbolUtils');
const db = require('../db');

const MAX_CONSECUTIVE_ERRORS = 5;

class LiveTradeOrchestrator {
  constructor() {
    this._ready = false;
    this._consecutiveErrors = 0;
  }

  // ─── Startup ──────────────────────────────────────────────────────────────

  /**
   * Called once at app startup.
   * Initializes DB and — if config exists and enabled — boots the executor.
   */
  async initialize() {
    try {
      await liveTradeDb.initLiveTradeDb();
      await this._bootExecutorFromDb();

      // Start the background watcher for stale limit orders
      this._startOrderWatcher();

      // Register as listener on the signal engine (lazy require avoids circular deps)
      const signalEngine = require('../services/signalEngine');
      signalEngine.registerSignalListener((signal) => {
        // Non-blocking: fire and forget with error guard
        this.handleSignal(signal).catch(err =>
          console.error('[LiveTradeOrchestrator] handleSignal error:', err.message)
        );
      });

      this._ready = true;
      console.log('[LiveTradeOrchestrator] ✅ Ready — listening for signals');
    } catch (err) {
      console.error('[LiveTradeOrchestrator] Init error:', err.message);
      this._ready = true; // still mark ready so routes work
    }
  }

  _startOrderWatcher() {
    setInterval(async () => {
      try {
        if (!this._ready) return;

        // 1. Get all open/new orders (both admin and users)
        const allOrders = await liveTradeDb.all("SELECT * FROM live_orders WHERE UPPER(status) IN ('OPEN', 'NEW', 'PARTIALLY_FILLED') AND order_type='limit'");
        if (!allOrders.length) return;

        const now = Math.floor(Date.now() / 1000);
        const EXPIRY_SECONDS = 300; // 5 minutes

        // Group expired orders by user_id
        const expiredByUser = new Map();
        for (const order of allOrders) {
          const createdAt = Math.floor(new Date(order.created_at + ' UTC').getTime() / 1000);
          const age = now - createdAt;
          
          if (age > EXPIRY_SECONDS) {
            const uid = order.user_id || 'admin';
            if (!expiredByUser.has(uid)) expiredByUser.set(uid, []);
            expiredByUser.get(uid).push(order);
          }
        }

        // Process cancellations per user context
        for (const [uid, orders] of expiredByUser.entries()) {
          let executor;
          if (uid === 'admin') {
            executor = binanceExecutor;
          } else {
            const userCfg = await liveTradeDb.getUserBinanceConfig(uid);
            if (!userCfg || !userCfg.enabled) continue;
            const apiKey = decrypt(userCfg.api_key_enc);
            const apiSecret = decrypt(userCfg.api_sec_enc);
            if (!apiKey || !apiSecret) continue;
            executor = new BinanceExecutor();
            await executor.init(apiKey, apiSecret, userCfg.testnet === 1);
          }

          for (const order of orders) {
            console.log(`[OrderWatcher] ⏳ Order ${order.binance_id} expired for ${uid}. Cancelling...`);
            const cleanId = String(order.binance_id).split('.')[0];
            const cancelRes = await executor.cancelOrder(order.symbol, cleanId);

            if (cancelRes.success || cancelRes.error?.includes('Order not found')) {
              await liveTradeDb.updateOrder(order.id, { status: 'CANCELLED' });
              liveTradeDb.addLog('info', `Auto-cancelled stale limit order: ${order.symbol} @ ${order.price}`, { strategy_id: order.strategy_id, user_id: uid === 'admin' ? null : uid }).catch(() => {});
              console.log(`[OrderWatcher] ✅ Order ${cleanId} marked as CANCELLED in DB.`);
            } else {
              console.error(`[OrderWatcher] Failed to cancel order ${cleanId} for ${uid}:`, cancelRes.error);
            }
          }
        }
      } catch (err) {
        console.error('[OrderWatcher] Error:', err.message);
      }
    }, 30000); // Check every 30 seconds
  }

  /** Read config from DB and initialize the executor if possible */
  async _bootExecutorFromDb() {
    const config = await liveTradeDb.getBinanceConfig();
    if (!config) {
      console.log('[LiveTradeOrchestrator] No Binance config found — live trading inactive');
      return;
    }
    const apiKey = decrypt(config.api_key_enc);
    const apiSecret = decrypt(config.api_sec_enc);
    if (!apiKey || !apiSecret) {
      console.warn('[LiveTradeOrchestrator] Could not decrypt Binance credentials');
      return;
    }
    console.log(`[LiveTradeOrchestrator] Decrypted Key Length: ${apiKey.length}, Secret Length: ${apiSecret.length}`);
    await binanceExecutor.init(apiKey, apiSecret, config.testnet === 1);
    console.log(`[LiveTradeOrchestrator] Executor booted — testnet=${config.testnet === 1}`);
  }

  // ─── Signal Handler ───────────────────────────────────────────────────────

  /**
   * Main entry point. Called by signalEngine whenever a new signal fires.
   * This is non-blocking — errors are caught internally.
   */
  async handleSignal(signal) {
    if (!this._ready) return;

    const { strategyId, signalId } = signal;
    try {
      // 1. Get global admin config
      const globalConfig = await liveTradeDb.getBinanceConfig();
      const adminEnabled = globalConfig && globalConfig.enabled === 1;

      // 2. Get user subscribers
      const subscribers = await db.query(
        'SELECT userId FROM subscriptions WHERE strategyId = ? AND useSignal = 1',
        [strategyId]
      );

      if (!adminEnabled && !subscribers.length) return;

      // 3. Process Admin if enabled
      if (adminEnabled) {
        const adminStratConfig = await liveTradeDb.getStrategyConfig(strategyId);
        if (adminStratConfig && adminStratConfig.enabled) {
          await this._processSignalForAccount(binanceExecutor, null, strategyId, signal, adminStratConfig, globalConfig.testnet === 1);
        }
      }

      // 4. Process User subscribers
      if (subscribers.length) {
        const enabledUserCfgs = await liveTradeDb.getEnabledUserBinanceConfigs();
        const enabledByUser = new Map(enabledUserCfgs.map(c => [Number(c.user_id), c]));

        for (const sub of subscribers) {
          const userId = Number(sub.userId);
          const userCfg = enabledByUser.get(userId);
          if (!userCfg) continue;

          const apiKey = decrypt(userCfg.api_key_enc);
          const apiSecret = decrypt(userCfg.api_sec_enc);
          if (!apiKey || !apiSecret) continue;

          const userExecutor = new BinanceExecutor();
          await userExecutor.init(apiKey, apiSecret, userCfg.testnet === 1);
          const userStratConfig = await liveTradeDb.getUserStrategyConfig(userId, strategyId);
          
          await this._processSignalForAccount(userExecutor, userId, strategyId, signal, userStratConfig, userCfg.testnet === 1);
        }
      }
    } catch (err) {
      console.error('[LiveTradeOrchestrator] handleSignal error:', err.message);
      liveTradeDb.addLog('error', `Unexpected error in handleSignal: ${err.message}`, { strategy_id: strategyId, signal_id: signalId }).catch(() => {});
    }
  }

  /**
   * Helper to process a signal for a specific account (Admin or User).
   */
  async _processSignalForAccount(executor, userId, strategyId, signal, stratConfig, testnet) {
    if (!stratConfig || !stratConfig.enabled) return;

    const { symbol, side, signalId, isEntry } = signal;
    const label = userId ? `U${userId}` : 'ADMIN';

    const log = (level, msg) => {
      console.log(`[LiveTrading][${label}][${level.toUpperCase()}] ${msg}`);
      liveTradeDb.addLog(level, msg, { user_id: userId, strategy_id: strategyId, signal_id: signalId }).catch(() => {});
    };

    try {
      // 1. Check open orders count and margin
      const openOrders = userId
        ? await liveTradeDb.getOpenOrdersByUser(strategyId, userId)
        : await liveTradeDb.all(
            "SELECT * FROM live_orders WHERE strategy_id=? AND user_id IS NULL AND UPPER(status) IN ('OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED') ORDER BY created_at DESC",
            [strategyId]
          );

      const totalMarginUsed = openOrders.reduce((sum, o) => sum + (o.amount_usdt || 0), 0);
      if (isEntry) {
        if (openOrders.length >= (stratConfig.max_open_orders || 5)) return;
        if ((totalMarginUsed + stratConfig.trade_amount_usdt) > (stratConfig.allocated_capital || 100)) return;
      }

      // 2. Resolve side/amount/qty
      let isEntryOrder = isEntry;
      let orderSide = null;
      let orderToClose = null;
      let fixedQty = null;
      let finalAmount = stratConfig.trade_amount_usdt;
      let hasPosition = false;
      let positionAmt = 0;
      let positionSide = null;

      try {
        const positionsRes = await executor.getPositions();
        if (Array.isArray(positionsRes)) {
          const bSymbol = normalizeSymbol(symbol, true);
          const pos = positionsRes.find(p => normalizeSymbol(p.symbol, true) === bSymbol);
          if (pos && Math.abs(parseFloat(pos.positionAmt)) > 0) {
            hasPosition = true;
            positionAmt = parseFloat(pos.positionAmt);
            positionSide = positionAmt > 0 ? 'buy' : 'sell';
          }
        }
      } catch (e) {
        // Position check failed, log but maybe continue if it's an entry?
      }

      const openForSymbol = openOrders.find(o => normalizeSymbol(o.symbol, true) === normalizeSymbol(symbol, true));
      
      if (hasPosition) {
        if (!isEntryOrder) {
          // Closing a position
          orderSide = positionSide === 'buy' ? 'sell' : 'buy';
          fixedQty = Math.abs(positionAmt);
          if (openForSymbol) {
            orderToClose = openForSymbol;
            finalAmount = openForSymbol.amount_usdt || finalAmount;
          }
        } else {
          // Already have a position, skip entry
          return;
        }
      } else if (!isEntryOrder) {
        // Exit signal but no position found
        if (openForSymbol) await liveTradeDb.updateOrder(openForSymbol.id, { status: 'CLOSED' });
        return;
      } else {
        // Entry signal, no position
        const s = (side || '').toLowerCase();
        if (s === 'buy' || s === 'long') orderSide = 'buy';
        else if (s === 'sell' || s === 'short') orderSide = 'sell';
        else return;
      }

      if (isEntryOrder && finalAmount < 20 && testnet) finalAmount = 20;
      
      const targetPrice = signal.price || signal.entry || signal.entry_price || null;

      log('info', `Signal → ${symbol} ${side.toUpperCase()} | strategy=${strategyId} | entry=${isEntryOrder} | margin=$${finalAmount} | price=${targetPrice || 'market'} | qty=${fixedQty || 'auto'}`);

      // 3. Place order
      // Force LIMIT for entries and MARKET for exits as requested for speed and precision
      const orderTypeToUse = isEntryOrder ? 'limit' : 'market';
      
      const order = await executor.placeOrder(
        symbol,
        orderSide,
        finalAmount,
        orderTypeToUse,
        targetPrice,
        strategyId,
        stratConfig.leverage || 1,
        fixedQty
      );

      if (order.error) {
        log('error', `Order failed: ${order.error}`);
        await liveTradeDb.insertOrder({
          user_id: userId, strategy_id: strategyId, signal_id: signalId, symbol, side: orderSide,
          order_type: stratConfig.order_type || 'market', amount_usdt: finalAmount,
          testnet: testnet ? 1 : 0, status: 'error', error_msg: order.error
        });
        return;
      }

      const orderId = await liveTradeDb.insertOrder({
        user_id: userId,
        strategy_id: strategyId,
        signal_id: signalId,
        binance_id: order.id,
        client_oid: order.clientOrderId || null,
        symbol,
        side: orderSide,
        order_type: order.type || 'market',
        amount_usdt: finalAmount,
        amount: order.amount,
        price: parseFloat(order.price) || 0,
        avg_fill_price: parseFloat(order.average || order.price) || 0,
        testnet: testnet ? 1 : 0,
        status: isEntryOrder ? (order.status || 'OPEN') : (order.status || 'CLOSED'),
      });

      if (orderToClose) await liveTradeDb.updateOrder(orderToClose.id, { status: 'CLOSED' });
      log('info', `Order saved | DB id=${orderId} | Binance id=${order.id}`);

    } catch (err) {
      log('error', `Error processing account: ${err.message}`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Map signal side labels to Binance buy/sell.
   * Entry signals: buy, long → "buy"
   *               short     → "sell" (for futures short)
   * Exit signals:  sell, cover → "sell" or "buy" (closing short)
   */
  _mapSide(side) {
    const s = (side || '').toLowerCase();
    switch (s) {
      case 'buy':
      case 'long':
        return { orderSide: 'buy', isEntryOrder: true };
      case 'short':
        return { orderSide: 'sell', isEntryOrder: true }; // open short = sell
      case 'sell':
        return { orderSide: 'sell', isEntryOrder: false };
      case 'cover':
        return { orderSide: 'buy', isEntryOrder: false }; // close short = buy
      default:
        return { orderSide: null, isEntryOrder: false };
    }
  }

  /**
   * Re-initialize executor with new credentials (called from admin routes).
   */
  async reinitExecutor() {
    await this._bootExecutorFromDb();
  }

  /**
   * Kill-switch: cancel all open orders + disable live trading globally.
   */
  async killSwitch() {
    console.log('[LiveTradeOrchestrator] 🚨 KILL SWITCH ACTIVATED');
    await liveTradeDb.setGlobalEnabled(false);
    const cancelled = await binanceExecutor.cancelAllOpenOrders();
    // Mark all open DB orders as cancelled
    const allOrders = await liveTradeDb.all("SELECT * FROM live_orders WHERE UPPER(status) IN ('OPEN', 'NEW', 'PARTIALLY_FILLED') AND user_id IS NULL");
    for (const o of allOrders) {
      await liveTradeDb.updateOrder(o.id, { status: 'CANCELLED' });
    }
    liveTradeDb.addLog('warn', 'Kill-switch activated — all open orders cancelled, live trading disabled').catch(() => {});
    return { cancelled: cancelled.length };
  }

  /**
   * User Kill-switch: cancel all open orders and disable live trading for a specific user.
   */
  async userKillSwitch(userId) {
    console.log(`[LiveTradeOrchestrator] 🚨 USER KILL SWITCH ACTIVATED [User ${userId}]`);
    await liveTradeDb.setUserEnabled(userId, false);

    const userCfg = await liveTradeDb.getUserBinanceConfig(userId);
    let cancelledCount = 0;
    if (userCfg) {
      const apiKey = decrypt(userCfg.api_key_enc);
      const apiSecret = decrypt(userCfg.api_sec_enc);
      if (apiKey && apiSecret) {
        const userExecutor = new BinanceExecutor();
        await userExecutor.init(apiKey, apiSecret, userCfg.testnet === 1);
        const cancelled = await userExecutor.cancelAllOpenOrders();
        cancelledCount = cancelled.length;
      }
    }

    // Mark all open DB orders for this user as cancelled
    const userOrders = await liveTradeDb.all("SELECT * FROM live_orders WHERE UPPER(status) IN ('OPEN', 'NEW', 'PARTIALLY_FILLED') AND user_id=?", [userId]);
    for (const o of userOrders) {
      await liveTradeDb.updateOrder(o.id, { status: 'CANCELLED' });
    }
    liveTradeDb.addLog('warn', `User kill-switch activated — disabled live trading and cancelled ${cancelledCount} orders`, { user_id: userId }).catch(() => {});
    return { cancelled: cancelledCount };
  }
}

module.exports = new LiveTradeOrchestrator();
