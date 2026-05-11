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

router.get('/orders/open', async (req, res) => {
  try {
    const { strategyId } = req.query;
    let orders;
    if (strategyId && strategyId !== 'all') {
      orders = await liveTradeDb.getOpenOrders(Number(strategyId));
    } else {
      orders = await liveTradeDb.all("SELECT * FROM live_orders WHERE UPPER(status) IN ('OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED') ORDER BY created_at DESC");
    }
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PUT /strategies/:id ──────────────────────────────────────────────────────

router.put('/strategies/:id', async (req, res) => {
  try {
    const strategyId = parseInt(req.params.id, 10);
    if (isNaN(strategyId)) return res.status(400).json({ error: 'Invalid strategy id' });

    const { enabled, order_type, trade_amount_usdt, leverage, max_open_orders, allocated_capital } = req.body;

    const updates = {};
    if (typeof enabled === 'boolean') updates.enabled = enabled ? 1 : 0;
    if (order_type) updates.order_type = order_type;
    if (trade_amount_usdt != null) updates.trade_amount_usdt = parseFloat(trade_amount_usdt);
    if (allocated_capital != null) updates.allocated_capital = parseFloat(allocated_capital);
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

router.get('/dashboard', async (req, res) => {
  try {
    const config = await liveTradeDb.getBinanceConfig();
    const strategyConfigs = await liveTradeDb.getAllStrategyConfigs();
    let orders = await liveTradeDb.getOrders(100, 0);

    // Initial values
    let totalLivePnlUSDT = 0;
    let futuresBalance = 0;
    let spotBalance = 0;
    let enrichedOrders = orders;

    if (binanceExecutor.isReady()) {
      try {
        const positions = await binanceExecutor.getPositions();
        const accountInfo = await binanceExecutor.getAccount();
        
        if (!positions.error && !accountInfo.error) {
          // 1. RECONCILE: Close positions in DB if they are 0 on Binance
          const activeInDb = orders.filter(o => ['OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED'].includes((o.status || '').toUpperCase()));
          for (const order of activeInDb) {
            const sym = order.symbol.replace('/', '').replace(':', '');
            const binancePos = positions.find(p => p.symbol === sym);
            const amt = parseFloat(binancePos?.positionAmt || 0);
            if (amt === 0) {
              await liveTradeDb.updateOrder(order.id, { status: 'CLOSED' });
              order.status = 'CLOSED';
            }
          }

          // 2. STATS: Pull real balance/pnl from account
          totalLivePnlUSDT = parseFloat(accountInfo.totalUnrealizedProfit || 0);
          futuresBalance = parseFloat(accountInfo.totalMarginBalance || 0);
        }

        const spot = await binanceExecutor.getBalance();
        spotBalance = spot.spot || 0;

        // 3. ENRICH: Add live data to active orders
        enrichedOrders = orders.map(order => {
          const s = (order.status || '').toUpperCase();
          const isActive = ['OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED'].includes(s);
          if (!isActive) return { ...order, livePnlUSDT: null, livePnlPct: null };

          const sym = order.symbol.replace('/', '').replace(':', '');
          const binancePos = Array.isArray(positions) ? positions.find(p => p.symbol === sym) : null;

          if (binancePos && parseFloat(binancePos.positionAmt) !== 0) {
            const markPrice = parseFloat(binancePos.markPrice);
            const entryPrice = parseFloat(binancePos.entryPrice);
            const leverage = parseFloat(binancePos.leverage);
            
            let pnlPct = 0;
            if (entryPrice > 0) {
              if (order.side === 'buy') pnlPct = ((markPrice - entryPrice) / entryPrice) * 100 * leverage;
              else pnlPct = ((entryPrice - markPrice) / entryPrice) * 100 * leverage;
            }

            return {
              ...order,
              currentPrice: markPrice,
              avg_fill_price: entryPrice, // Sync entry price with Binance
              livePnlUSDT: +parseFloat(binancePos.unRealizedProfit || 0).toFixed(4),
              livePnlPct: +pnlPct.toFixed(2)
            };
          } else {
            // Position not found on Binance or is 0
            return { ...order, livePnlUSDT: 0, livePnlPct: 0 };
          }
        });
      } catch (e) {
        console.error('Binance Data Fetch Failed:', e.message);
      }
    }

    // Summary stats
    const openOrders = enrichedOrders.filter(o => {
      const s = (o.status || '').toUpperCase();
      return ['OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED'].includes(s);
    });
    const closedOrders = enrichedOrders.filter(o => {
      const s = (o.status || '').toUpperCase();
      return ['CLOSED', 'CANCELLED', 'ERROR', 'REJECTED', 'EXPIRED'].includes(s);
    });

    res.json({
      status: {
        configured: !!config,
        enabled: config?.enabled === 1,
        testnet: config?.testnet === 1,
        executorReady: binanceExecutor.isReady(),
      },
      balance: {
        spot: spotBalance,
        futures: futuresBalance,
        error: null
      },
      strategyConfigs,
      orders: enrichedOrders,
      summary: {
        openCount: openOrders.length,
        closedCount: closedOrders.length,
        totalOrders: enrichedOrders.length,
        totalLivePnlUSDT: +totalLivePnlUSDT.toFixed(4),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

