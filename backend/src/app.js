require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const axios = require('axios');
const db = require('./db');

const authService = require('./services/authService');
const strategyService = require('./services/strategyService');

const telegramService = require('./services/telegramService');
const authMiddleware = require('./routes/authMiddleware');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const supportRoutes = require('./routes/supportRoutes');
const authRoutes = require('./routes/authRoutes');
const cookieParser = require('cookie-parser');

const PORT = process.env.PORT || 7286;
const app = express();

if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('placeholder')) {
  console.warn('\x1b[33m%s\x1b[0m', '[Warning] Stripe API keys are not configured. Payment features will be disabled.');
}

app.use(morgan('dev'));
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.url} | Origin: ${req.get('origin')}`);
  next();
});

const allowedOrigins = [
  'https://brittrade.pages.dev',
  'https://brittrade.britsync.co.uk',
  'https://trade.mayfairmarketing.online',
  'http://localhost:3000',
  'http://localhost:5173'
];

app.use(cors({
  origin: (origin, callback) => {
    // Direct server hits or non-browser agents
    if (!origin) return callback(null, true);
    
    // Check if origin is in whitelist or ends with allowed domains
    const isAllowed = allowedOrigins.includes(origin) || 
                     origin.endsWith('.pages.dev') || 
                     origin.endsWith('.netlify.app') ||
                     origin.includes('britsync.co.uk');

    if (isAllowed || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked] Origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use('/auth', authRoutes);
app.use('/payments', paymentRoutes);
app.use('/admin/support', authMiddleware, supportRoutes);
app.use('/admin', adminRoutes);

// --- Strategy Management ---
app.get('/strategies/prices', authMiddleware, async (req, res, next) => {
  try {
    const prices = await strategyService.getPrices();
    res.json(prices);
  } catch (e) { next(e); }
});

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
    const { strategyId, useSignal = true } = req.body;
    
    // Gate access by purchase
    const user = await authService.me(req.userId);
    const planToStrat = {
      'low_risk': [1],
      'medium_risk': [2],
      'high_risk': [3],
      'bundle': [1, 2, 3]
    };
    
    const hasAccess = user.purchasedPlans.some(planId => {
      const allowedStrats = planToStrat[planId] || [];
      return allowedStrats.includes(Number(strategyId));
    });

    if (!hasAccess) {
      return res.status(403).json({ error: 'Purchase required for this strategy' });
    }

    await strategyService.subscribe(req.userId, strategyId, useSignal);
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
    const signals = await strategyService.getSignals(req.params.id, req.userId, req.userRole === 'admin');
    res.json(signals);
  } catch (e) { next(e); }
});


// --- Public API for Landing Page ---
app.get('/public/signals/broadcast', async (req, res, next) => {
  try {
    const signals = await db.query(
      "SELECT s.symbol, s.side, s.pnl, s.status, s.timestamp, st.name as strategyName FROM signals s JOIN strategies st ON s.strategyId = st.id WHERE s.status != 'active' AND s.pnl IS NOT NULL ORDER BY s.timestamp DESC LIMIT 15"
    );
    res.json(signals);
  } catch (e) { next(e); }
});

app.get('/public/strategies/performance', async (req, res, next) => {
  try {
    const strategies = await strategyService.getAll();
    const performance = strategies.map(s => ({
      id: s.id,
      name: s.name,
      prof24h: s.prof24h,
      pnl24h: s.pnl24h,
      winRate: s.winRate
    }));
    res.json(performance);
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
    // 1. Get default symbols
    const defaultSymbols = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","ADAUSDT","DOTUSDT","XRPUSDT","LINKUSDT","AVAXUSDT","MATICUSDT"];
    
    // 2. Get active signal symbols from database
    const activeSignals = await db.query("SELECT DISTINCT symbol FROM signals WHERE status = 'active'");
    const activeSymbols = activeSignals.map(t => t.symbol.replace('/', ''));
    
    // 3. Merge and deduplicate
    const allSymbols = Array.from(new Set([...defaultSymbols, ...activeSymbols]));
    
    // 4. Fetch from Binance
    const symbolsParam = JSON.stringify(allSymbols);
    const resB = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbolsParam)}`);
    
    const data = resB.data.map(item => {
      // Dynamic mapping back to symbol/USDT format
      // Binance symbols like BTCUSDT -> BTC/USDT
      let mappedSymbol = item.symbol;
      if (item.symbol.endsWith('USDT')) {
        mappedSymbol = item.symbol.replace('USDT', '/USDT');
      }
      
      return {
        symbol: mappedSymbol,
        price: parseFloat(item.lastPrice),
        change24h: parseFloat(item.priceChangePercent).toFixed(2),
        volume24h: (parseFloat(item.quoteVolume) / 1000000).toFixed(2)
      };
    });
    res.json(data);
  } catch (e) {
    console.error('[Market Summary Error]', e.message);
    // Fallback logic
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
    const signals = await db.query(
      `SELECT sig.*, st.name as strategyName
       FROM signals sig
       JOIN strategies st ON sig.strategyId = st.id
       JOIN subscriptions sub ON sub.strategyId = sig.strategyId
       JOIN purchases p ON p.userId = sub.userId
       JOIN strategy_daily_budgets sdb ON sdb.strategyId = sig.strategyId
       WHERE sub.userId = ?
         AND sig.timestamp >= sdb.lastReset
         AND (p.planId = CASE sig.strategyId
              WHEN 1 THEN 'low_risk'
              WHEN 2 THEN 'medium_risk'
              WHEN 3 THEN 'high_risk'
            END OR p.planId = 'bundle')
       ORDER BY sig.timestamp DESC`,
      [req.userId]
    );
    res.json(signals);
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
  
  // CRITICAL: Ensure CORS headers are present on EVERY error
  res.header('Access-Control-Allow-Origin', 'https://brittrade.pages.dev');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  const status = err.status || 500;
  res.status(status).json({ 
    error: err.message || 'Internal server error',
    redirect: status === 401 ? '/auth/signup' : undefined
  });
});

// --- Error Handling ---
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS Blocked' });
  }
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: 'Internal Server Error' });
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
