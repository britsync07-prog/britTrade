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
        const allOrders = await liveTradeDb.all("SELECT * FROM live_orders WHERE UPPER(status) IN ('OPEN', 'NEW', 'PARTIALLY_FILLED')");
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
            const cleanId = order.client_oid || String(order.binance_id).split('.')[0];
            
            // --- Sync Status Check ---
            // Before cancelling, check if it was already FILLED on the exchange
            try {
              const exchangeOrder = await executor.getOrder(order.symbol, cleanId, order.strategy_id);
              if (exchangeOrder && exchangeOrder.status) {
                const exStatus = exchangeOrder.status.toUpperCase();
                if (exStatus === 'FILLED') {
                  await liveTradeDb.updateOrder(order.id, { 
                    status: 'FILLED',
                    avg_fill_price: parseFloat(exchangeOrder.avgPrice || exchangeOrder.price || 0),
                    filled: parseFloat(exchangeOrder.executedQty || exchangeOrder.origQty || 0)
                  });
                  console.log(`[OrderWatcher] ✅ Order ${cleanId} was already FILLED. Updated DB status.`);
                  continue; // Skip cancellation logic for this order
                } else if (exStatus === 'CANCELED' || exStatus === 'EXPIRED') {
                  await liveTradeDb.updateOrder(order.id, { status: 'CANCELLED' });
                  console.log(`[OrderWatcher] ℹ️ Order ${cleanId} was already ${exStatus}. Synced DB.`);
                  continue;
                }
              }
            } catch (syncErr) {
              console.warn(`[OrderWatcher] Status sync failed for ${cleanId}: ${syncErr.message}`);
            }

            console.log(`[OrderWatcher] ⏳ Order ${order.binance_id} expired for ${uid}. Cancelling...`);
            const cancelRes = await executor.cancelOrder(order.symbol, cleanId, order.strategy_id);

            if (cancelRes.success || cancelRes.error === 'NOT_FOUND') {
              await liveTradeDb.updateOrder(order.id, { status: 'CANCELLED' });
              const msg = cancelRes.success ? `Auto-cancelled stale limit order: ${order.symbol} @ ${order.price}` : `Order already closed on Binance: ${order.symbol} @ ${order.price}`;
              liveTradeDb.addLog('info', msg, { strategy_id: order.strategy_id, user_id: uid === 'admin' ? null : uid }).catch(() => {});
              console.log(`[OrderWatcher] ✅ Order ${cleanId} marked as CANCELLED in DB. Reason: ${cancelRes.success ? 'Exchange Success' : 'Not Found'}`);
            } else {
              const errMsg = `Failed to auto-cancel stale order ${order.symbol}: ${cancelRes.message || 'Unknown'}`;
              console.error(`[OrderWatcher] ${errMsg} (Order ID: ${cleanId})`);
              liveTradeDb.addLog('error', errMsg, { strategy_id: order.strategy_id, user_id: uid === 'admin' ? null : uid }).catch(() => {});
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

    const { strategyId, signalId, symbol, side } = signal;
    try {
      // 1. Get global admin config
      const globalConfig = await liveTradeDb.getBinanceConfig();
      const adminEnabled = globalConfig && globalConfig.enabled === 1;

      // 2. Get user subscribers (All active Admins + explicit subscribers)
      const subscribers = await db.query(
        `SELECT id as userId, role, email FROM users 
         WHERE (role = 'admin' AND status = 'active')
         OR id IN (SELECT userId FROM subscriptions WHERE strategyId = ? AND useSignal = 1)`,
        [strategyId]
      );

      if (!adminEnabled && !subscribers.length) {
        // Only log if there was potentially someone to trade for
        console.log(`[LiveTradeOrchestrator] No active trading accounts for Strategy ${strategyId}. Admin global: ${adminEnabled ? 'ON' : 'OFF'}, Subscribers: ${subscribers.length}`);
        return;
      }

      console.log(`[LiveTradeOrchestrator] Processing Signal: ${symbol} ${side.toUpperCase()} for Strategy ${strategyId}`);

      // 3. Process Admin Global Account if enabled
      let adminApiKey = null;
      if (adminEnabled) {
        const adminStratConfig = await liveTradeDb.getStrategyConfig(strategyId);
        if (adminStratConfig && adminStratConfig.enabled) {
          await this._processSignalForAccount(binanceExecutor, null, strategyId, signal, adminStratConfig, globalConfig.testnet === 1);
          try {
            adminApiKey = decrypt(globalConfig.api_key_enc);
          } catch (e) {
            console.error('[LiveTradeOrchestrator] Failed to decrypt admin API key:', e.message);
          }
        } else {
          console.log(`[LiveTradeOrchestrator] Admin global strategy ${strategyId} is disabled or missing config`);
        }
      }

      // 4. Process User accounts (including admins with personal keys)
      if (subscribers.length) {
        const enabledUserCfgs = await liveTradeDb.getEnabledUserBinanceConfigs();
        const enabledByUser = new Map(enabledUserCfgs.map(c => [Number(c.user_id), c]));

        for (const sub of subscribers) {
          const userId = Number(sub.userId);
          const userLabel = `User ${userId} (${sub.email})`;
          
          const userCfg = enabledByUser.get(userId);
          if (!userCfg) {
            if (sub.role === 'admin') {
              const msg = `Skipping ${userLabel}: Binance API config is disabled or not found for this user.`;
              console.log(`[LiveTradeOrchestrator] ${msg}`);
              liveTradeDb.addLog('warn', msg, { user_id: userId, strategy_id: strategyId, signal_id: signalId }).catch(() => {});
            }
            continue;
          }

          const apiKey = decrypt(userCfg.api_key_enc);
          const apiSecret = decrypt(userCfg.api_sec_enc);
          
          if (!apiKey || !apiSecret) {
            const msg = `Could not decrypt Binance credentials for ${userLabel}. Check your LIVE_TRADE_ENCRYPTION_KEY.`;
            console.warn(`[LiveTradeOrchestrator] ${msg}`);
            liveTradeDb.addLog('error', msg, { user_id: userId, strategy_id: strategyId, signal_id: signalId }).catch(() => {});
            continue;
          }

          if (adminEnabled && adminApiKey && apiKey === adminApiKey) {
            const msg = `Skipping personal trade for ${userLabel}: User API key is identical to the active Global Admin API key to prevent double trading.`;
            console.log(`[LiveTradeOrchestrator] ${msg}`);
            liveTradeDb.addLog('info', msg, { user_id: userId, strategy_id: strategyId, signal_id: signalId }).catch(() => {});
            continue;
          }

          const userExecutor = new BinanceExecutor();
          await userExecutor.init(apiKey, apiSecret, userCfg.testnet === 1);
          const userStratConfig = await liveTradeDb.getUserStrategyConfig(userId, strategyId);
          
          if (!userStratConfig || !userStratConfig.enabled) {
            const msg = `Skipping ${userLabel}: Strategy ${strategyId} is not enabled in your settings.`;
            console.log(`[LiveTradeOrchestrator] ${msg}`);
            liveTradeDb.addLog('info', msg, { user_id: userId, strategy_id: strategyId, signal_id: signalId }).catch(() => {});
            continue;
          }

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
    const label = (userId ? `U${userId}` : 'ADMIN') + `|S${strategyId}`;

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
        if (openOrders.length >= (stratConfig.max_open_orders || 5)) {
          log('info', `Skipping entry: Max open orders reached (${openOrders.length}/${stratConfig.max_open_orders || 5}). Close existing trades first.`);
          return;
        }
        if ((totalMarginUsed + stratConfig.trade_amount_usdt) > (stratConfig.allocated_capital || 100)) {
          log('info', `Skipping entry: Insufficient allocated capital. Used: $${totalMarginUsed.toFixed(2)}, Needed: $${stratConfig.trade_amount_usdt}, Total Allocated: $${stratConfig.allocated_capital || 100}. Increase your allocated capital in settings.`);
          return;
        }
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
          if (pos && Math.abs(parseFloat(pos.positionAmt)) > 0.000001) {
            hasPosition = true;
            positionAmt = parseFloat(pos.positionAmt);
            positionSide = positionAmt > 0 ? 'buy' : 'sell';
          }
        }
      } catch (e) {
        log('warn', `Binance position check failed: ${e.message}. Proceeding with cautious DB-only state.`);
      }

      let openForSymbol = openOrders.find(o => o.signal_id === signalId);
      if (!openForSymbol) {
        // Fallback for older orders that missed signal_id linkage due to previous bug
        openForSymbol = openOrders.find(o => normalizeSymbol(o.symbol, true) === normalizeSymbol(symbol, true));
      }
      
      if (hasPosition) {
        if (!isEntryOrder) {
          // Exit signal: Close the existing position
          // If we are LONG (positionAmt > 0), we need to SELL to close.
          // If we are SHORT (positionAmt < 0), we need to BUY to cover.
          orderSide = positionSide === 'buy' ? 'sell' : 'buy';
          fixedQty = Math.abs(positionAmt);
          if (openForSymbol) {
            orderToClose = openForSymbol;
            finalAmount = openForSymbol.amount_usdt || finalAmount;
          }
        } else {
          // Entry signal but we already have a position
          const s = (side || '').toLowerCase();
          const targetSide = (s === 'buy' || s === 'long') ? 'buy' : 'sell';

          if (targetSide === positionSide) {
             if (signal.isDCA) {
                 log('info', `DCA Triggered for ${symbol}: Averaging down existing position.`);
                 orderSide = targetSide; // REQUIRED FIX: Ensure the orchestrator knows whether to buy or sell
             } else {
                 log('info', `Skipping entry for ${symbol}: An active position already exists in the same direction and is not a DCA.`);
                 return;
             }
          } else {
             log('info', `Detected opposite signal for ${symbol}: Closing current ${positionSide} and opening ${targetSide}.`);
             // This would normally be handled by an exit signal, but if it happens here, we close first.
             orderSide = positionSide === 'buy' ? 'sell' : 'buy';
             fixedQty = Math.abs(positionAmt);
             isEntryOrder = false; // Treat this specific action as an exit
          }
        }
      } else if (!isEntryOrder) {
        // Exit signal but no position found
        log('info', `Skipping exit for ${symbol}: No active position found on Binance to close.`);
        if (openForSymbol) {
          await liveTradeDb.updateOrder(openForSymbol.id, { status: 'CLOSED' });
          log('info', `Marked stale DB order ${openForSymbol.id} as CLOSED as no Binance position exists.`);
        }
        return;
      } else {
        // Entry signal, no position
        const s = (side || '').toLowerCase();
        if (s === 'buy' || s === 'long') orderSide = 'buy';
        else if (s === 'sell' || s === 'short') orderSide = 'sell';
        else {
          log('warn', `Unknown signal side "${side}". Supported sides: buy, long, short, sell.`);
          return;
        }
      }

      // A. Check if we already processed this exact signal and side for this account (de-duplication)
      if (signalId) {
        const existingOrder = userId
          ? await liveTradeDb.get(
              "SELECT id FROM live_orders WHERE signal_id=? AND user_id=? AND side=? AND status != 'error'",
              [signalId, userId, orderSide]
            )
          : await liveTradeDb.get(
              "SELECT id FROM live_orders WHERE signal_id=? AND user_id IS NULL AND side=? AND status != 'error'",
              [signalId, orderSide]
            );

        if (existingOrder && !signal.isDCA) {
          log('info', `Order side ${orderSide ? orderSide.toUpperCase() : 'UNKNOWN'} for Signal ${signalId} has already been placed (Order ID: ${existingOrder.id}). Skipping duplicate execution.`);
          return;
        }
      }

      if (isEntryOrder && finalAmount < 20 && testnet) {
         // Some testnets have higher minimums
         finalAmount = 20;
      }
      
      const targetPrice = signal.price || signal.entry || signal.entry_price || null;

      // 3. Place order
      // STRICTOR REQUIREMENT: LIMIT for entry, MARKET for exit
      const orderTypeToUse = isEntryOrder ? 'limit' : 'market';
      
      if (isEntryOrder && !targetPrice) {
        log('error', `Cannot place LIMIT entry for ${symbol}: Signal provided no entry price.`);
        return;
      }

      log('info', `Placing ${orderTypeToUse.toUpperCase()} ${orderSide.toUpperCase()} order for ${symbol} | Amount: $${finalAmount} | Price: ${targetPrice || 'Market'}`);

      const order = await executor.placeOrder(
        symbol,
        orderSide,
        finalAmount,
        orderTypeToUse,
        targetPrice,
        strategyId,
        stratConfig.leverage || 1,
        fixedQty,
        !isEntryOrder // reduceOnly = true for exits
      );

      if (order.error) {
        log('error', `Order failed: ${order.error}`);
        await liveTradeDb.insertOrder({
          user_id: userId,
          strategy_id: strategyId,
          signal_id: signalId,
          symbol,
          side: orderSide,
          order_type: orderTypeToUse,
          amount_usdt: finalAmount,
          testnet: testnet ? 1 : 0,
          status: 'error',
          error_msg: String(order.error)
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
        status: isEntryOrder ? (order.status || 'OPEN') : 'CLOSED',
        error_msg: null
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

    // 1. Cancel global admin orders on both Spot and Futures
    const resSpot = await binanceExecutor.cancelAllOpenOrders(1);
    const resFutures = await binanceExecutor.cancelAllOpenOrders(3);
    const totalEx = (resSpot.count || 0) + (resFutures.count || 0);

    // 2. Sync DB status for admin orders
    const adminOrders = await liveTradeDb.all("SELECT * FROM live_orders WHERE UPPER(status) IN ('OPEN', 'NEW', 'PARTIALLY_FILLED') AND user_id IS NULL");
    let dbCount = 0;
    for (const o of adminOrders) {
      // Re-verify specific order cancellation
      const cr = await binanceExecutor.cancelOrder(o.symbol, o.client_oid || String(o.binance_id).split('.')[0], o.strategy_id);
      if (cr.success || cr.error === 'NOT_FOUND') {
        await liveTradeDb.updateOrder(o.id, { status: 'CANCELLED' });
        dbCount++;
      }
    }

    addLog('warn', `Global kill-switch activated — cancelled ${totalEx} orders on exchange and ${dbCount} in DB`).catch(() => {});
    return { cancelled: totalEx, dbUpdated: dbCount };
  }
  /**
   * User Kill-switch: cancel all open orders and disable live trading for a specific user.
   */
  async userKillSwitch(userId) {
    console.log(`[LiveTradeOrchestrator] 🚨 USER KILL SWITCH ACTIVATED [User ${userId}]`);
    await liveTradeDb.setUserEnabled(userId, false);

    const userCfg = await liveTradeDb.getUserBinanceConfig(userId);
    let cancelledCount = 0;
    let cancelledEx = 0;
    if (userCfg) {
      const apiKey = decrypt(userCfg.api_key_enc);
      const apiSecret = decrypt(userCfg.api_sec_enc);
      if (apiKey && apiSecret) {
        const userExecutor = new BinanceExecutor();
        await userExecutor.init(apiKey, apiSecret, userCfg.testnet === 1);
        const resSpot = await userExecutor.cancelAllOpenOrders(1);
        const resFutures = await userExecutor.cancelAllOpenOrders(3);
        cancelledEx = (resSpot.count || 0) + (resFutures.count || 0);

        // Mark all open DB orders for this user as cancelled, but only if they were confirmed or not found
        const userOrders = await liveTradeDb.all("SELECT * FROM live_orders WHERE UPPER(status) IN ('OPEN', 'NEW', 'PARTIALLY_FILLED') AND user_id=?", [userId]);
        for (const o of userOrders) {
          const cr = await userExecutor.cancelOrder(o.symbol, o.client_oid || String(o.binance_id).split('.')[0], o.strategy_id);
          if (cr.success || cr.error === 'NOT_FOUND') {
            await liveTradeDb.updateOrder(o.id, { status: 'CANCELLED' });
            cancelledCount++;
          }
        }
      }
    }

    liveTradeDb.addLog('warn', `User kill-switch activated — cancelled ${cancelledEx} orders on exchange and ${cancelledCount} in DB`, { user_id: userId }).catch(() => {});
    return { cancelled: cancelledCount, exchangeCancelled: cancelledEx };
  }
}

module.exports = new LiveTradeOrchestrator();
