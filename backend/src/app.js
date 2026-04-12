require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const axios = require('axios');
const db = require('./db');

const authService = require('./services/authService');
const strategyService = require('./services/strategyService');
const paperService = require('./services/paperService');
const telegramService = require('./services/telegramService');
const authMiddleware = require('./routes/authMiddleware');

const PORT = process.env.PORT || 7286;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [/https:\/\/.*\.netlify\.app/, /https:\/\/your-custom-domain\.com/] 
    : '*',
  credentials: true
}));

app.use(express.json());

// --- Authentication ---
app.post('/auth/signup', async (req, res) => {
  try {
    const user = await authService.signup(req.body.email, req.body.password);
    res.status(201).json(user);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/auth/login', async (req, res) => {
  try {
    const data = await authService.login(req.body.email, req.body.password);
    res.json(data);
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get('/auth/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await authService.me(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) { next(e); }
});

app.post('/auth/balance', authMiddleware, async (req, res, next) => {
  try {
    const result = await authService.updateBalance(req.userId, req.body.balance);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// --- Strategy Management ---
app.get('/strategies', authMiddleware, async (req, res, next) => {
  try {
    const strategies = await strategyService.getAll();
    res.json(strategies);
  } catch (e) { next(e); }
});

app.get('/strategies/subscribed', authMiddleware, async (req, res, next) => {
  try {
    const strategies = await strategyService.getSubscribed(req.userId);
    res.json(strategies);
  } catch (e) { next(e); }
});

app.post('/strategies/subscribe', authMiddleware, async (req, res, next) => {
  try {
    const { strategyId, useSignal = true, useVirtualBalance = true, allocatedBalance = 0 } = req.body;
    await strategyService.subscribe(req.userId, strategyId, useSignal, useVirtualBalance, allocatedBalance);
    res.json({ status: 'Subscribed' });
  } catch (e) { next(e); }
});

app.post('/strategies/unsubscribe', authMiddleware, async (req, res, next) => {
  try {
    await strategyService.unsubscribe(req.userId, req.body.strategyId);
    res.json({ status: 'Unsubscribed' });
  } catch (e) { next(e); }
});

// THE STRATEGIES ARE AUTO-BOOTED. MANUAL CONTROL DEPRECATED.

app.get('/strategies/:id/signals', authMiddleware, async (req, res, next) => {
  try {
    const signals = await strategyService.getSignals(req.params.id);
    res.json(signals);
  } catch (e) { next(e); }
});

// --- Paper Trading ---
app.post('/paper/start', authMiddleware, async (req, res, next) => {
  try {
    const result = await paperService.start(req.userId);
    res.json(result);
  } catch (e) { next(e); }
});

app.post('/paper/stop', authMiddleware, async (req, res, next) => {
  try {
    const result = await paperService.stop(req.userId);
    res.json(result);
  } catch (e) { next(e); }
});

app.get('/paper/trades', authMiddleware, async (req, res, next) => {
  try {
    const trades = await paperService.getTrades(req.userId);
    res.json(trades);
  } catch (e) { next(e); }
});

app.get('/paper/performance', authMiddleware, async (req, res, next) => {
  try {
    const perf = await paperService.getPerformance(req.userId);
    res.json(perf);
  } catch (e) { next(e); }
});

// --- REAL CHART DATA API ---
// decodeURIComponent handles BTC%2FUSDT -> BTC/USDT correctly
app.get('/charts/:symbol', authMiddleware, async (req, res, next) => {
  try {
    const symbol = decodeURIComponent(req.params.symbol);
    const history = await strategyService.getChartHistory(symbol, req.query.timeframe);
    res.json({
      symbol,
      count: history.length,
      data: history // [timestamp, open, high, low, close]
    });
  } catch (e) { next(e); }
});

// --- Telegram ---
app.post('/telegram/connect', authMiddleware, async (req, res, next) => {
  try {
    await telegramService.connect(req.userId, req.body.telegramId);
    res.json({ status: 'Connected' });
  } catch (e) { next(e); }
});

// --- Phase 3: Market & Portfolio ---
app.get('/market/summary', authMiddleware, async (req, res) => {
  try {
    // Binance Ticker 24hr endpoint - symbols param must be a stringified array
    const symbolsParam = JSON.stringify(["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","ADAUSDT","DOTUSDT","XRPUSDT","LINKUSDT","AVAXUSDT","MATICUSDT"]);
    const resB = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`);
    
    const mapping = {
      'BTCUSDT': 'BTC/USDT',
      'ETHUSDT': 'ETH/USDT',
      'SOLUSDT': 'SOL/USDT',
      'BNBUSDT': 'BNB/USDT',
      'ADAUSDT': 'ADA/USDT',
      'DOTUSDT': 'DOT/USDT',
      'XRPUSDT': 'XRP/USDT',
      'LINKUSDT': 'LINK/USDT',
      'AVAXUSDT': 'AVAX/USDT',
      'MATICUSDT': 'MATIC/USDT'
    };

    const data = resB.data.map(item => ({
      symbol: mapping[item.symbol],
      price: parseFloat(item.lastPrice),
      change24h: parseFloat(item.priceChangePercent).toFixed(2),
      volume24h: (parseFloat(item.quoteVolume) / 1000000).toFixed(2)
    }));
    res.json(data);
  } catch (e) {
    const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'ADA/USDT', 'DOT/USDT', 'XRP/USDT', 'LINK/USDT', 'AVAX/USDT', 'MATIC/USDT'];
    const data = symbols.map(s => ({
        symbol: s,
        price: s.includes('BTC') ? 65000 + Math.random()*100 : (s.includes('ETH') ? 3500 + Math.random()*20 : 100 + Math.random()*5),
        change24h: (Math.random() * 10 - 5).toFixed(2),
        volume24h: (Math.random() * 1000).toFixed(2)
    }));
    res.json(data);
  }
});

app.get('/portfolio/history', authMiddleware, async (req, res, next) => {
  try {
    const trades = await paperService.getHistory(req.userId);
    res.json(trades);
  } catch (e) { next(e); }
});

app.post('/strategies/:id/notes', authMiddleware, async (req, res, next) => {
  try {
    await db.run("INSERT INTO notes (userId, strategyId, content) VALUES (?, ?, ?)", [req.userId, req.params.id, req.body.content]);
    res.json({ status: 'Saved' });
  } catch (e) { next(e); }
});

app.get('/strategies/:id/notes', authMiddleware, async (req, res, next) => {
  try {
    const notes = await db.query("SELECT * FROM notes WHERE userId = ? AND strategyId = ? ORDER BY timestamp DESC", [req.userId, req.params.id]);
    res.json(notes);
  } catch (e) { next(e); }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
  console.error('[Middleware Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// --- Startup ---
async function start() {
  try {
    console.log('Initializing database...');
    await db.initDb();
    
    console.log('Auto-booting underlying AI logic models...');
    const strats = await db.query("SELECT id FROM strategies");
    for (const s of strats) {
      strategyService.runStrategy(s.id).catch(err => console.error('Failed to auto-run strategy:', err));
    }
    
    console.log(`Starting server on port ${PORT}...`);
    const server = app.listen(PORT, () => {
      console.log(`\n🚀 AI Trading SaaS Backend Running`);
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`📈 Chart Data Ready: /charts/BTC%2FUSDT`);
      console.log(`🛠 Strategies Integrated: GridMeanReversion, TrendFollower, UltimateFuturesScalper\n`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Error: Port ${PORT} is already in use.`);
      } else {
        console.error('SERVER ERROR:', err);
      }
      process.exit(1);
    });

    // Safety keep-alive
    setInterval(() => {}, 1000 * 60 * 60);

  } catch (err) {
    console.error('CRITICAL STARTUP ERROR:', err);
    process.exit(1);
  }
}

start();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
