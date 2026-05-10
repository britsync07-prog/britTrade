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

      // 4. Max open orders guard
      const openOrders = await liveTradeDb.getOpenOrders(strategyId);
      if (isEntry && openOrders.length >= (stratConfig.max_open_orders || 1)) {
        log('info', `Max open orders reached for strategy ${strategyId} — skipping entry signal`);
        return;
      }

      // 5. Map signal side to Binance order side
      const { orderSide, isEntryOrder } = this._mapSide(side);
      if (!orderSide) {
        log('warn', `Unrecognized signal side: ${side}`);
        return;
      }

      log('info', `Signal → ${symbol} ${side.toUpperCase()} | strategy=${strategyId} | entry=${isEntryOrder}`);

      // 6. Place order
      const order = await binanceExecutor.placeOrder(
        symbol,
        orderSide,
        stratConfig.trade_amount_usdt,
        stratConfig.order_type || 'market',
        null,
        strategyId
      );

      if (order.error) {
        log('error', `Order failed: ${order.error}`);
        this._consecutiveErrors++;
        if (this._consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log('error', `🚨 Kill-switch triggered after ${MAX_CONSECUTIVE_ERRORS} consecutive errors!`);
          await liveTradeDb.setGlobalEnabled(false);
          this._consecutiveErrors = 0;
        }
        // Save failed order record
        await liveTradeDb.insertOrder({
          strategy_id: strategyId,
          signal_id: signalId,
          binance_id: null,
          client_oid: null,
          symbol,
          side: orderSide,
          order_type: stratConfig.order_type || 'market',
          amount_usdt: stratConfig.trade_amount_usdt,  // always USDT
          amount: null,
          price,
          testnet: config.testnet,
          status: 'error',
        });
        return;
      }

      // 7. Success — reset error counter and save order
      this._consecutiveErrors = 0;
      const orderId = await liveTradeDb.insertOrder({
        strategy_id: strategyId,
        signal_id: signalId,
        binance_id: order.id || order.orderId,
        client_oid: order.clientOrderId || null,
        symbol,
        side: orderSide,
        order_type: order.type || 'market',
        amount_usdt: stratConfig.trade_amount_usdt,      // always USDT reference
        amount: order.amount || null,                    // base-asset qty from Binance
        price: order.average || order.price || price,
        avg_fill_price: order.average || order.price || null,
        testnet: config.testnet,
        status: order.status || 'open',
      });

      log('info', `✅ Order saved | DB id=${orderId} | Binance id=${order.id} | ${symbol} ${orderSide}`);

    } catch (err) {
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
