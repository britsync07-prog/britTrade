const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../platform.db');
const db = new sqlite3.Database(dbPath);

const initDb = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        telegramId TEXT,
        balance REAL DEFAULT 10000.0
      )`, (err) => { if (err) return reject(err); });

      // Strategies table
      db.run(`CREATE TABLE IF NOT EXISTS strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL
      )`, (err) => {
        if (err) return reject(err);
        // Seed strategies if empty
        db.get("SELECT count(*) as count FROM strategies", (err, row) => {
          if (err) return reject(err);
          if (row.count === 0) {
            db.run("INSERT INTO strategies (name, type) VALUES ('GridMeanReversion', 'spot')");
            db.run("INSERT INTO strategies (name, type) VALUES ('TrendFollower', 'spot')");
            db.run("INSERT INTO strategies (name, type) VALUES ('UltimateFuturesScalper', 'futures')");
          }
        });
      });

      // Signals table
      db.run(`CREATE TABLE IF NOT EXISTS signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategyId INTEGER,
        symbol TEXT,
        side TEXT,
        price REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => { if (err) return reject(err); });

      // Paper Trades table
      db.run(`CREATE TABLE IF NOT EXISTS paper_trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        strategyId INTEGER,
        symbol TEXT,
        entryPrice REAL,
        exitPrice REAL,
        amount REAL,
        pnl REAL,
        side TEXT,
        status TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => { if (err) return reject(err); });

      // User Subscriptions
      db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        userId INTEGER,
        strategyId INTEGER,
        useSignal BOOLEAN DEFAULT 1,
        useVirtualBalance BOOLEAN DEFAULT 1,
        allocatedBalance REAL DEFAULT 0,
        initialAllocation REAL DEFAULT 0,
        PRIMARY KEY (userId, strategyId)
      )`);

      // Trading Ledger
      db.run(`CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        strategyId INTEGER,
        symbol TEXT,
        side TEXT,
        price REAL,
        amount REAL,
        status TEXT,
        pnl REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // User Notes / Journal
      db.run(`CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        strategyId INTEGER,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) return reject(err);
        
        // Migration: Ensure initialAllocation exists in subscriptions
        db.all("PRAGMA table_info(subscriptions)", (err, rows) => {
          if (err) {
            console.error('Migration check failed', err);
            return resolve(); // Continue anyway 
          }
          const hasCol = rows.some(r => r.name === 'initialAllocation');
          if (!hasCol) {
            console.log('Migrating database: Adding initialAllocation to subscriptions...');
            db.run("ALTER TABLE subscriptions ADD COLUMN initialAllocation REAL DEFAULT 0", (err) => {
              if (err) console.error('Migration failed', err);
              console.log('Database initialized successfully (migrated).');
              resolve();
            });
          } else {
            console.log('Database initialized successfully.');
            resolve();
          }
        });
      });
    });
  });
};

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

module.exports = { initDb, query, get, run };
