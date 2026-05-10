'use strict';

/**
 * liveTradingAdminRoutes.js
 * =========================
 * Admin-only REST API for the live Binance trading system.
 * All routes require authMiddleware + adminMiddleware.
 *
 * Mount in app.js as:
 *   app.use('/admin/live-trading', liveTradingAdminRoutes);
 *
 * Endpoints:
 *   GET    /config                - Get config status (masked key)
 *   POST   /config                - Save/update Binance API credentials
 *   DELETE /config                - Remove credentials
 *   POST   /config/test           - Test connection (fetch balance)
 *   GET    /status                - Get global enabled state
 *   POST   /toggle                - Enable/disable live trading
 *   GET    /strategies            - List per-strategy configs
 *   PUT    /strategies/:id        - Update strategy config
 *   GET    /orders                - List orders (paginated)
 *   GET    /orders/:id            - Single order detail
 *   GET    /logs                  - Recent execution logs
 *   POST   /kill-switch           - Emergency stop
 */

const express = require('express');
const router = express.Router();

const authMiddleware = require('./authMiddleware');
const liveTradeDb = require('../liveTrading/liveTradeDb');
const binanceExecutor = require('../liveTrading/binanceExecutor');
const liveTradeOrchestrator = require('../liveTrading/liveTradeOrchestrator');
const { encrypt, decrypt, maskKey } = require('../liveTrading/encryptionUtils');

// ─── Admin guard ─────────────────────────────────────────────────────────────

const adminOnly = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Administrative access required' });
  }
  next();
};

// All routes require auth + admin
router.use(authMiddleware, adminOnly);

// ─── GET /config ──────────────────────────────────────────────────────────────

router.get('/config', async (req, res) => {
  try {
    const config = await liveTradeDb.getBinanceConfig();
    if (!config) return res.json({ configured: false });

    const rawKey = decrypt(config.api_key_enc);
    res.json({
      configured: true,
      apiKeyMasked: maskKey(rawKey),
      testnet: config.testnet === 1,
      enabled: config.enabled === 1,
      updatedAt: config.updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /config ─────────────────────────────────────────────────────────────

router.post('/config', async (req, res) => {
  try {
    const { apiKey, apiSecret, testnet = true } = req.body;
    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'apiKey and apiSecret are required' });
    }

    const cleanKey = apiKey.replace(/\s/g, '');
    const cleanSecret = apiSecret.replace(/\s/g, '');

    const apiKeyEnc = encrypt(cleanKey);
    const apiSecEnc = encrypt(cleanSecret);

    await liveTradeDb.saveBinanceConfig(apiKeyEnc, apiSecEnc, testnet);

    // Re-initialize executor with new credentials
    await liveTradeOrchestrator.reinitExecutor();

    res.json({
      message: 'Binance API credentials saved',
      testnet,
      apiKeyMasked: maskKey(apiKey),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /config ───────────────────────────────────────────────────────────

router.delete('/config', async (req, res) => {
  try {
    await liveTradeDb.deleteBinanceConfig();
    binanceExecutor.destroy();
    res.json({ message: 'Binance API credentials removed. Live trading disabled.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /config/test ────────────────────────────────────────────────────────

router.post('/config/test', async (req, res) => {
  try {
    if (!binanceExecutor.isReady()) {
      // Try to boot from DB first
      await liveTradeOrchestrator.reinitExecutor();
      if (!binanceExecutor.isReady()) {
        return res.status(400).json({ error: 'No Binance credentials configured' });
      }
    }

    const balance = await binanceExecutor.getBalance();
    if (balance.error) {
      return res.status(400).json({ error: `Connection test failed: ${balance.error}` });
    }

    const config = await liveTradeDb.getBinanceConfig();
    res.json({
      success: true,
      testnet: config?.testnet === 1,
      balance: {
        spot: balance.spot,
        futures: balance.futures,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /status ──────────────────────────────────────────────────────────────

router.get('/status', async (req, res) => {
  try {
    const config = await liveTradeDb.getBinanceConfig();
    res.json({
      configured: !!config,
      enabled: config?.enabled === 1,
      testnet: config?.testnet === 1,
      executorReady: binanceExecutor.isReady(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /toggle ─────────────────────────────────────────────────────────────

router.post('/toggle', async (req, res) => {
  try {
    const config = await liveTradeDb.getBinanceConfig();
    if (!config) {
      return res.status(400).json({ error: 'No Binance API config found. Save credentials first.' });
    }

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" (boolean) is required' });
    }

    // Make sure executor is ready before enabling
    if (enabled && !binanceExecutor.isReady()) {
      await liveTradeOrchestrator.reinitExecutor();
      if (!binanceExecutor.isReady()) {
        return res.status(400).json({ error: 'Cannot enable — credentials could not be decrypted' });
      }
    }

    await liveTradeDb.setGlobalEnabled(enabled);
    liveTradeDb.addLog('info', `Live trading globally ${enabled ? 'ENABLED' : 'DISABLED'} by admin`).catch(() => {});

    res.json({ enabled, message: `Live trading ${enabled ? 'enabled' : 'disabled'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /strategies ──────────────────────────────────────────────────────────

router.get('/strategies', async (req, res) => {
  try {
    const configs = await liveTradeDb.getAllStrategyConfigs();
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /strategies/:id ──────────────────────────────────────────────────────

router.put('/strategies/:id', async (req, res) => {
  try {
    const strategyId = parseInt(req.params.id, 10);
    if (isNaN(strategyId)) return res.status(400).json({ error: 'Invalid strategy id' });

    const { enabled, order_type, trade_amount_usdt, leverage, max_open_orders } = req.body;

    const updates = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled ? 1 : 0;
    if (order_type) updates.order_type = order_type;
    if (trade_amount_usdt != null) updates.trade_amount_usdt = parseFloat(trade_amount_usdt);
    if (leverage != null) updates.leverage = parseInt(leverage, 10);
    if (max_open_orders != null) updates.max_open_orders = parseInt(max_open_orders, 10);

    await liveTradeDb.updateStrategyConfig(strategyId, updates);
    const updated = await liveTradeDb.getStrategyConfig(strategyId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /orders ──────────────────────────────────────────────────────────────

router.get('/orders', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;
    const orders = await liveTradeDb.getOrders(limit, offset);
    res.json({ orders, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /orders/:id ──────────────────────────────────────────────────────────

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await liveTradeDb.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /logs ────────────────────────────────────────────────────────────────

router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const logs = await liveTradeDb.getLogs(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /kill-switch ────────────────────────────────────────────────────────

router.post('/kill-switch', async (req, res) => {
  try {
    const result = await liveTradeOrchestrator.killSwitch();
    res.json({
      message: '🚨 Kill-switch activated. Live trading disabled. All open orders cancelled.',
      cancelledCount: result.cancelled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /dashboard ──────────────────────────────────────────────────────────
// Returns everything needed for the admin live-trading panel in one call:
//   balance, status, strategy configs, recent orders with live PnL

router.get('/dashboard', async (req, res) => {
  try {
    const config = await liveTradeDb.getBinanceConfig();

    // Balance — only fetch if executor is ready
    let balance = { spot: null, futures: null, error: null };
    if (binanceExecutor.isReady()) {
      const b = await binanceExecutor.getBalance();
      if (b.error) balance.error = b.error;
      else { balance.spot = b.spot; balance.futures = b.futures; }
    }

    // Recent orders (last 100)
    const orders = await liveTradeDb.getOrders(100, 0);

    // Per-strategy configs
    const strategyConfigs = await liveTradeDb.getAllStrategyConfigs();

    // Compute live PnL for open orders using current Binance prices
    const axios = require('axios');
    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      if (order.status !== 'open' || !order.price || !order.amount_usdt) {
        return { ...order, livePnlUSDT: null, livePnlPct: null };
      }
      try {
        const sym = order.symbol.replace('/', '').replace(':USDT', '');
        const ticker = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}`);
        const currentPrice = parseFloat(ticker.data.price);
        const entryPrice = order.avg_fill_price || order.price;
        const leverage = strategyConfigs.find(s => s.strategy_id === order.strategy_id)?.leverage || 1;

        let pnlPct = 0;
        if (order.side === 'buy') {
          pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100 * leverage;
        } else {
          pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100 * leverage;
        }
        // PnL in USDT = notional (USDT) * pnl%/100 — clean formula
        const pnlUSDT = order.amount_usdt * (pnlPct / 100);

        return { ...order, currentPrice, livePnlUSDT: +pnlUSDT.toFixed(4), livePnlPct: +pnlPct.toFixed(2) };
      } catch (_) {
        return { ...order, livePnlUSDT: null, livePnlPct: null };
      }
    }));

    // Summary stats
    const openOrders = enrichedOrders.filter(o => o.status === 'open');
    const closedOrders = enrichedOrders.filter(o => ['closed', 'filled', 'cancelled', 'error'].includes(o.status));
    const totalPnlUSDT = enrichedOrders.reduce((acc, o) => acc + (o.livePnlUSDT || 0), 0);

    res.json({
      status: {
        configured: !!config,
        enabled: config?.enabled === 1,
        testnet: config?.testnet === 1,
        executorReady: binanceExecutor.isReady(),
      },
      balance,
      strategyConfigs,
      orders: enrichedOrders,
      summary: {
        openCount: openOrders.length,
        closedCount: closedOrders.length,
        totalOrders: enrichedOrders.length,
        totalLivePnlUSDT: +totalPnlUSDT.toFixed(4),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

