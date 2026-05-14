'use strict';

/**
 * liveTradeDb.js
 * ==============
 * Manages a dedicated SQLite database for live trading data.
 * Uses a separate file (live_trading.db) to keep concerns isolated
 * from the main platform.db.
 *
 * Tables:
 *   binance_config       — Encrypted API credentials + global settings
 *   live_trade_configs   — Per-strategy trading parameters
 *   live_orders          — Every order placed on Binance
 *   live_trade_log       — Execution log (success/errors)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, '../../live_trading.db');

let _db = null;

function getDb() {
  if (!_db) {
    _db = new sqlite3.Database(DB_PATH);
    _db.run('PRAGMA journal_mode=WAL');
    _db.run('PRAGMA foreign_keys=ON');
  }
  return _db;
}

// ─── Promise wrappers ─────────────────────────────────────────────────────────

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ─── Schema init ──────────────────────────────────────────────────────────────

async function initLiveTradeDb() {
  // Binance credentials + global on/off switch
  await run(`
    CREATE TABLE IF NOT EXISTS binance_config (
      id          INTEGER PRIMARY KEY CHECK (id = 1),
      api_key_enc TEXT NOT NULL,
      api_sec_enc TEXT NOT NULL,
      testnet     INTEGER DEFAULT 1,
      enabled     INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Per-user Binance credentials + on/off switch
  await run(`
    CREATE TABLE IF NOT EXISTS user_binance_config (
      user_id      INTEGER PRIMARY KEY,
      api_key_enc  TEXT NOT NULL,
      api_sec_enc  TEXT NOT NULL,
      testnet      INTEGER DEFAULT 1,
      enabled      INTEGER DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Per-strategy live trade settings
  await run(`
    CREATE TABLE IF NOT EXISTS live_trade_configs (
      strategy_id       INTEGER PRIMARY KEY,
      enabled           INTEGER DEFAULT 0,
      order_type        TEXT DEFAULT 'market',
      trade_amount_usdt REAL DEFAULT 10.0,
      allocated_capital REAL DEFAULT 100.0,
      leverage          INTEGER DEFAULT 5,
      max_open_orders   INTEGER DEFAULT 5,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_live_trade_configs (
      user_id           INTEGER NOT NULL,
      strategy_id       INTEGER NOT NULL,
      enabled           INTEGER DEFAULT 0,
      order_type        TEXT DEFAULT 'market',
      trade_amount_usdt REAL DEFAULT 10.0,
      allocated_capital REAL DEFAULT 100.0,
      leverage          INTEGER DEFAULT 5,
      max_open_orders   INTEGER DEFAULT 5,
      updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, strategy_id)
    )
  `);

  // Migration: add allocated_capital if missing
  const configCols = await all("PRAGMA table_info(live_trade_configs)");
  if (!configCols.some(c => c.name === 'allocated_capital')) {
    await run('ALTER TABLE live_trade_configs ADD COLUMN allocated_capital REAL DEFAULT 100.0');
  }

  // Seed default configs for strategies 1-3
  const strategies = [
    { id: 1, leverage: 5,  amount: 10.0, capital: 100.0 },
    { id: 2, leverage: 5,  amount: 10.0, capital: 100.0 },
    { id: 3, leverage: 5,  amount: 10.0, capital: 100.0 },
  ];
  for (const s of strategies) {
    await run(`
      INSERT OR IGNORE INTO live_trade_configs
        (strategy_id, enabled, order_type, trade_amount_usdt, leverage, allocated_capital)
      VALUES (?, 0, 'market', ?, ?, ?)
    `, [s.id, s.amount, s.leverage, s.capital]);
  }

  // Every Binance order placed
  await run(`
    CREATE TABLE IF NOT EXISTS live_orders (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER,
      strategy_id    INTEGER,
      signal_id      INTEGER,
      binance_id     TEXT,
      client_oid     TEXT,
      symbol         TEXT NOT NULL,
      side           TEXT NOT NULL,
      order_type     TEXT DEFAULT 'market',
      amount_usdt    REAL,
      amount         REAL,
      price          REAL,
      avg_fill_price REAL,
      filled         REAL DEFAULT 0,
      fee_usdt       REAL DEFAULT 0,
      status         TEXT DEFAULT 'pending',
      testnet        INTEGER DEFAULT 1,
      error_msg      TEXT,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add amount_usdt if missing from older schema
  const orderCols = await all("PRAGMA table_info(live_orders)");
  if (!orderCols.some(c => c.name === 'user_id')) {
    await run('ALTER TABLE live_orders ADD COLUMN user_id INTEGER');
  }
  if (!orderCols.some(c => c.name === 'amount_usdt')) {
    await run('ALTER TABLE live_orders ADD COLUMN amount_usdt REAL');
  }

  // Execution log
  await run(`
    CREATE TABLE IF NOT EXISTS live_trade_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      level       TEXT DEFAULT 'info',
      strategy_id INTEGER,
      signal_id   INTEGER,
      order_id    INTEGER,
      message     TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const logCols = await all("PRAGMA table_info(live_trade_log)");
  if (!logCols.some(c => c.name === 'user_id')) {
    await run('ALTER TABLE live_trade_log ADD COLUMN user_id INTEGER');
  }

  console.log('[LiveTradeDb] ✅ live_trading.db initialized');
}

// ─── Config helpers ───────────────────────────────────────────────────────────

async function getBinanceConfig() {
  return get('SELECT * FROM binance_config WHERE id = 1');
}

async function saveBinanceConfig(apiKeyEnc, apiSecEnc, testnet = true) {
  const existing = await getBinanceConfig();
  if (existing) {
    return run(
      'UPDATE binance_config SET api_key_enc=?, api_sec_enc=?, testnet=?, updated_at=CURRENT_TIMESTAMP WHERE id=1',
      [apiKeyEnc, apiSecEnc, testnet ? 1 : 0]
    );
  }
  return run(
    'INSERT INTO binance_config (id, api_key_enc, api_sec_enc, testnet) VALUES (1, ?, ?, ?)',
    [apiKeyEnc, apiSecEnc, testnet ? 1 : 0]
  );
}

async function setGlobalEnabled(enabled) {
  return run('UPDATE binance_config SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE id=1', [enabled ? 1 : 0]);
}

async function deleteBinanceConfig() {
  return run('DELETE FROM binance_config WHERE id=1');
}

async function getUserBinanceConfig(userId) {
  return get('SELECT * FROM user_binance_config WHERE user_id=?', [userId]);
}

async function getEnabledUserBinanceConfigs() {
  return all('SELECT * FROM user_binance_config WHERE enabled=1');
}

async function saveUserBinanceConfig(userId, apiKeyEnc, apiSecEnc, testnet = true) {
  const existing = await getUserBinanceConfig(userId);
  if (existing) {
    return run(
      'UPDATE user_binance_config SET api_key_enc=?, api_sec_enc=?, testnet=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?',
      [apiKeyEnc, apiSecEnc, testnet ? 1 : 0, userId]
    );
  }
  return run(
    'INSERT INTO user_binance_config (user_id, api_key_enc, api_sec_enc, testnet) VALUES (?, ?, ?, ?)',
    [userId, apiKeyEnc, apiSecEnc, testnet ? 1 : 0]
  );
}

async function setUserEnabled(userId, enabled) {
  return run('UPDATE user_binance_config SET enabled=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?', [enabled ? 1 : 0, userId]);
}

async function deleteUserBinanceConfig(userId) {
  return run('DELETE FROM user_binance_config WHERE user_id=?', [userId]);
}

// ─── Strategy config helpers ──────────────────────────────────────────────────

async function getAllStrategyConfigs() {
  return all('SELECT * FROM live_trade_configs ORDER BY strategy_id');
}

async function getStrategyConfig(strategyId) {
  return get('SELECT * FROM live_trade_configs WHERE strategy_id=?', [strategyId]);
}

async function updateStrategyConfig(strategyId, fields) {
  const allowed = ['enabled', 'order_type', 'trade_amount_usdt', 'leverage', 'max_open_orders', 'allocated_capital'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k}=?`); vals.push(v); }
  }
  if (!sets.length) return;
  sets.push('updated_at=CURRENT_TIMESTAMP');
  vals.push(strategyId);
  return run(`UPDATE live_trade_configs SET ${sets.join(',')} WHERE strategy_id=?`, vals);
}

// ─── Order helpers ────────────────────────────────────────────────────────────

async function insertOrder(data) {
  const {
    user_id = null,
    strategy_id, signal_id, binance_id, client_oid, symbol, side,
    order_type = 'market', amount_usdt, amount, price, avg_fill_price = null, testnet = 1, status = 'open'
  } = data;
  const res = await run(
    `INSERT INTO live_orders
      (user_id, strategy_id, signal_id, binance_id, client_oid, symbol, side, order_type, amount_usdt, amount, price, avg_fill_price, testnet, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [user_id, strategy_id, signal_id, binance_id, client_oid, symbol, side, order_type, amount_usdt ?? null, amount ?? null, price, avg_fill_price, testnet ? 1 : 0, status]
  );
  return res.lastID;
}

async function updateOrder(id, fields) {
  const allowed = ['status', 'avg_fill_price', 'filled', 'fee_usdt', 'error_msg', 'binance_id', 'amount', 'amount_usdt'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k}=?`); vals.push(v); }
  }
  if (!sets.length) return;
  sets.push('updated_at=CURRENT_TIMESTAMP');
  vals.push(id);
  return run(`UPDATE live_orders SET ${sets.join(',')} WHERE id=?`, vals);
}

async function getOrders(limit = 50, offset = 0) {
  return all(
    'SELECT * FROM live_orders ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
}

async function getOrdersByUser(userId, limit = 50, offset = 0) {
  return all(
    'SELECT * FROM live_orders WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [userId, limit, offset]
  );
}

async function getOrder(id) {
  return get('SELECT * FROM live_orders WHERE id=?', [id]);
}

async function getOpenOrders(strategyId) {
  return all("SELECT * FROM live_orders WHERE strategy_id=? AND UPPER(status) IN ('OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED') ORDER BY created_at DESC", [strategyId]);
}

async function getOpenOrdersByUser(strategyId, userId) {
  return all(
    "SELECT * FROM live_orders WHERE strategy_id=? AND user_id=? AND UPPER(status) IN ('OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED') ORDER BY created_at DESC",
    [strategyId, userId]
  );
}

// ─── Log helpers ──────────────────────────────────────────────────────────────

async function addLog(level, message, extras = {}) {
  const { user_id = null, strategy_id = null, signal_id = null, order_id = null } = extras;
  return run(
    'INSERT INTO live_trade_log (user_id, level, strategy_id, signal_id, order_id, message) VALUES (?,?,?,?,?,?)',
    [user_id, level, strategy_id, signal_id, order_id, message]
  );
}

async function getLogs(limit = 100) {
  return all('SELECT * FROM live_trade_log ORDER BY created_at DESC LIMIT ?', [limit]);
}

async function getLogsByUser(userId, limit = 100) {
  return all('SELECT * FROM live_trade_log WHERE user_id=? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
}

async function ensureUserStrategyConfigs(userId) {
  const strategies = [
    { id: 1, leverage: 5, amount: 10.0, capital: 100.0 },
    { id: 2, leverage: 5, amount: 10.0, capital: 100.0 },
    { id: 3, leverage: 5, amount: 10.0, capital: 100.0 },
  ];
  for (const s of strategies) {
    await run(
      `INSERT OR IGNORE INTO user_live_trade_configs
      (user_id, strategy_id, enabled, order_type, trade_amount_usdt, leverage, allocated_capital, max_open_orders)
      VALUES (?, ?, 0, 'market', ?, ?, ?, 5)`,
      [userId, s.id, s.amount, s.leverage, s.capital]
    );
  }
}

async function getUserStrategyConfigs(userId) {
  await ensureUserStrategyConfigs(userId);
  return all('SELECT * FROM user_live_trade_configs WHERE user_id=? ORDER BY strategy_id', [userId]);
}

async function getUserStrategyConfig(userId, strategyId) {
  await ensureUserStrategyConfigs(userId);
  return get('SELECT * FROM user_live_trade_configs WHERE user_id=? AND strategy_id=?', [userId, strategyId]);
}

async function updateUserStrategyConfig(userId, strategyId, fields) {
  await ensureUserStrategyConfigs(userId);
  const allowed = ['enabled', 'order_type', 'trade_amount_usdt', 'leverage', 'max_open_orders', 'allocated_capital'];
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) { sets.push(`${k}=?`); vals.push(v); }
  }
  if (!sets.length) return;
  sets.push('updated_at=CURRENT_TIMESTAMP');
  vals.push(userId, strategyId);
  return run(`UPDATE user_live_trade_configs SET ${sets.join(',')} WHERE user_id=? AND strategy_id=?`, vals);
}

module.exports = {
  initLiveTradeDb,
  getBinanceConfig,
  saveBinanceConfig,
  setGlobalEnabled,
  deleteBinanceConfig,
  getUserBinanceConfig,
  getEnabledUserBinanceConfigs,
  saveUserBinanceConfig,
  setUserEnabled,
  deleteUserBinanceConfig,
  getAllStrategyConfigs,
  getStrategyConfig,
  updateStrategyConfig,
  ensureUserStrategyConfigs,
  getUserStrategyConfigs,
  getUserStrategyConfig,
  updateUserStrategyConfig,
  insertOrder,
  updateOrder,
  getOrders,
  getOrdersByUser,
  getOrder,
  getOpenOrders,
  getOpenOrdersByUser,
  addLog,
  getLogs,
  getLogsByUser,
  run,
  all
};
