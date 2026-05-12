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
const { decrypt } = require('./encryptionUtils');

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

  /**
   * Background task that runs every 30s to cancel stale limit orders.
   */
  _startOrderWatcher() {
    setInterval(async () => {
      try {
        if (!this._ready) return;

        // 1. Get all orders with OPEN or NEW status from DB
        const allOrders = await liveTradeDb.getOrders(100, 0);
        const openLimitOrders = allOrders.filter(o => {
          const s = (o.status || '').toUpperCase();
          return (s === 'OPEN' || s === 'NEW' || s === 'PARTIALLY_FILLED') && o.order_type === 'limit';
        });

        const now = Math.floor(Date.now() / 1000);
        const EXPIRY_SECONDS = 300; // 2 minutes

        for (const order of openLimitOrders) {
          // Convert DB string timestamp to Unix seconds
          const createdAt = Math.floor(new Date(order.created_at + ' UTC').getTime() / 1000);
          const age = now - createdAt;

          console.log(`[OrderWatcher] Checking ${order.symbol} (${order.binance_id}). Age: ${age}s`);

          if (age > EXPIRY_SECONDS) {
            console.log(`[OrderWatcher] ⏳ Order ${order.binance_id} expired. Cancelling...`);
            
            // Force binance_id to string and remove any ".0"
            const cleanId = String(order.binance_id).split('.')[0];
            const cancelRes = await binanceExecutor.cancelOrder(order.symbol, cleanId);
            
            // If success OR if order is already gone, mark as CANCELLED in DB
            if (cancelRes.success || cancelRes.error?.includes('Order not found')) {
              await liveTradeDb.updateOrder(order.id, { status: 'CANCELLED' });
              liveTradeDb.addLog('info', `Auto-cancelled stale limit order: ${order.symbol} @ ${order.price}`, { strategy_id: order.strategy_id });
              console.log(`[OrderWatcher] ✅ Order ${cleanId} marked as CANCELLED in DB.`);
            } else {
              console.error(`[OrderWatcher] Failed to cancel order ${cleanId}:`, cancelRes.error);
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

    const { strategyId, symbol, side, price, signalId, isEntry } = signal;
    const log = (level, msg) => {
      console.log(`[LiveTrading][${level.toUpperCase()}] ${msg}`);
      liveTradeDb.addLog(level, msg, { strategy_id: strategyId, signal_id: signalId }).catch(() => {});
    };

    try {
      // 1. Global enabled check
      const config = await liveTradeDb.getBinanceConfig();
      if (!config || !config.enabled) {
        return; // Live trading globally off — silently skip
      }

      // 2. Executor ready?
      if (!binanceExecutor.isReady()) {
        log('warn', `Signal received but executor not ready. Reinitializing...`);
        await this._bootExecutorFromDb();
        if (!binanceExecutor.isReady()) return;
      }

      // 3. Per-strategy config check
      const stratConfig = await liveTradeDb.getStrategyConfig(strategyId);
      if (!stratConfig || !stratConfig.enabled) {
        return; // Strategy not enabled for live trading
      }

      // 4. Capital & Max open orders guard
      const openOrders = await liveTradeDb.getOpenOrders(strategyId);
      console.log(`[LiveTradeOrchestrator] Found ${openOrders.length} active trades in DB for strategy ${strategyId}`);
      const totalMarginUsed = openOrders.reduce((sum, o) => sum + (o.amount_usdt || 0), 0);
      
      if (isEntry) {
        if (openOrders.length >= (stratConfig.max_open_orders || 5)) {
          log('info', `Max open orders reached (${openOrders.length}) — skipping entry`);
          return;
        }
        if ((totalMarginUsed + stratConfig.trade_amount_usdt) > (stratConfig.allocated_capital || 100)) {
          log('info', `Insufficient allocated capital (Used: $${totalMarginUsed.toFixed(2)} / Limit: $${stratConfig.allocated_capital}) — skipping entry`);
          return;
        }
      }

      // 5. Determine Binance side intelligently (using Binance as source of truth)
      let isEntryOrder = signal.isEntry;
      let orderSide = null;
      let orderToClose = null;
      let fixedQty = null;
      let finalAmount = stratConfig.trade_amount_usdt;

      let hasPosition = false;
      let positionAmt = 0;
      let positionSide = null;

      try {
        const positionsRes = await binanceExecutor.getPositions();
        if (Array.isArray(positionsRes)) {
          // Normalize symbol for comparison (e.g. BTC/USDT -> BTCUSDT)
          const bSymbol = symbol.replace('/', '').replace(':', '').replace('USDTUSDT', 'USDT');
          const pos = positionsRes.find(p => p.symbol === bSymbol);
          if (pos && Math.abs(parseFloat(pos.positionAmt)) > 0) {
            hasPosition = true;
            positionAmt = parseFloat(pos.positionAmt);
            positionSide = positionAmt > 0 ? 'buy' : 'sell'; // buy=long, sell=short
          }
        }
      } catch (e) {
        log('warn', `Could not fetch positions from Binance: ${e.message}`);
      }

      // Find if we have a local record for this symbol/strategy
      const openForSymbol = openOrders.find(o => o.symbol === symbol);

      if (hasPosition) {
        if (!isEntryOrder) {
          // Engine wants to EXIT, and we HAVE a position.
          orderSide = positionSide === 'buy' ? 'sell' : 'buy';
          fixedQty = Math.abs(positionAmt);
          if (openForSymbol) {
            orderToClose = openForSymbol;
            finalAmount = openForSymbol.amount_usdt || finalAmount;
          }
          log('info', `Active position found on Binance (${positionSide} ${fixedQty}). Exiting with a ${orderSide.toUpperCase()} order.`);
        } else {
          // Engine wants to ENTER, but we ALREADY have a position.
          log('info', `Active position already exists for ${symbol} (${positionSide}). Skipping redundant entry signal.`);
          return;
        }
      } else {
        if (!isEntryOrder) {
          // Engine wants to EXIT, but we have NO position on Binance.
          // CRITICAL: We skip to prevent opening a naked short in the wrong direction.
          log('warn', `Exit signal received for ${symbol}, but no open position found on Binance. Ignoring to prevent naked shorts.`);
          if (openForSymbol) {
            await liveTradeDb.updateOrder(openForSymbol.id, { status: 'CLOSED' });
            log('info', `Cleaned up stale local DB entry for ${symbol}`);
          }
          return;
        } else {
          // Engine wants to ENTER, and we have NO position.
          const s = (side || '').toLowerCase();
          if (s === 'buy' || s === 'long') orderSide = 'buy';
          else if (s === 'sell' || s === 'short') orderSide = 'sell';
          else {
            log('warn', `Unrecognized signal side for entry: ${side}`);
            return;
          }
          log('info', `No active position found. Proceeding with new ${orderSide.toUpperCase()} entry.`);
        }
      }

      // 5b. Minimum Notional Guard (Binance Futures Testnet needs ~$20)
      if (isEntryOrder && finalAmount < 20 && config.testnet) {
        log('warn', `Adjusting amount from $${finalAmount} to $20 to meet Binance minimum notional`);
        finalAmount = 20;
      }

      log('info', `Signal → ${symbol} ${side.toUpperCase()} | strategy=${strategyId} | entry=${isEntryOrder} | margin=$${finalAmount} | qty=${fixedQty || 'auto'}`);

      // 6. Get Price for Limit Orders
      const targetPrice = signal.price || signal.entry || signal.entry_price || null;

      // 7. Place order
      const order = await binanceExecutor.placeOrder(
        symbol,
        orderSide,
        finalAmount,
        stratConfig.order_type || 'market',
        targetPrice, // Pass the price from the signal
        strategyId,
        stratConfig.leverage || 1,
        fixedQty
      );

      if (order.error) {
        log('error', `Order failed: ${order.error}`);
        // ... (rest of error handling)
        this._consecutiveErrors++;
        if (this._consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log('error', `🚨 Kill-switch triggered after ${MAX_CONSECUTIVE_ERRORS} consecutive errors!`);
          await liveTradeDb.setGlobalEnabled(false);
          this._consecutiveErrors = 0;
        }
        await liveTradeDb.insertOrder({
          strategy_id: strategyId, signal_id: signalId, symbol, side: orderSide,
          order_type: stratConfig.order_type || 'market', amount_usdt: finalAmount,
          testnet: config.testnet, status: 'error', error_msg: order.error
        });
        return;
      }

      // 7. Success — reset error counter and save order
      this._consecutiveErrors = 0;
      const orderId = await liveTradeDb.insertOrder({
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
        testnet: config.testnet,
        status: isEntryOrder ? (order.status || 'OPEN') : 'CLOSED',
      });

      // 8. If we closed an existing order, mark it as closed in the DB
      if (orderToClose) {
        await liveTradeDb.updateOrder(orderToClose.id, { status: 'CLOSED' });
        log('info', `Marked DB trade ${orderToClose.id} as CLOSED`);
      }

      log('info', `✅ Order saved | DB id=${orderId} | Binance id=${order.id} | ${symbol} ${orderSide} @ $${parseFloat(order.price).toFixed(4)}`);    } catch (err) {
      console.error('[LiveTradeOrchestrator] handleSignal error:', err.message);
      liveTradeDb.addLog('error', `Unexpected error in handleSignal: ${err.message}`, { strategy_id: strategyId, signal_id: signalId }).catch(() => {});
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
    const allOrders = await liveTradeDb.getOrders(500, 0);
    const openOrders = allOrders.filter(o => o.status === 'open');
    for (const o of (openOrders || [])) {
      await liveTradeDb.updateOrder(o.id, { status: 'cancelled' });
    }
    liveTradeDb.addLog('warn', 'Kill-switch activated — all open orders cancelled, live trading disabled').catch(() => {});
    return { cancelled: cancelled.length };
  }
}

module.exports = new LiveTradeOrchestrator();
