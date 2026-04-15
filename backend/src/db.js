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
        balance REAL DEFAULT 10000.0,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'active'
      )`, (err) => {
        if (err) return reject(err);
        
        // Migration: Ensure role/status columns exist
        db.all("PRAGMA table_info(users)", (err, rows) => {
          if (err) return;
          const hasRole = rows.some(r => r.name === 'role');
          if (!hasRole) {
            db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
            db.run("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
          }
        });

        // Seed first user if empty
        db.get("SELECT count(*) as count FROM users", (err, row) => {
          if (!err && row && row.count === 0) {
            console.log('Seeding initial admin: mehedy303@gmail.com');
            db.run("INSERT INTO users (email, password, balance, role) VALUES (?, ?, ?, ?)", 
              ['mehedy303@gmail.com', '$2b$10$R/mdOipHB1McLKD.FDwCr.BkVzcYpFeS7xOQScxOhRr9iLXhJnKrm', 10000.0, 'admin']);
          } else {
            // Ensure first user is admin even if already exists
            db.run("UPDATE users SET role = 'admin' WHERE email = ?", ['mehedy303@gmail.com']);
          }
        });
      });

      // Strategies table
      db.run(`CREATE TABLE IF NOT EXISTS strategies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        risk TEXT DEFAULT 'Medium',
        description TEXT
      )`, (err) => {
        if (err) return reject(err);
        
        // Migration: Ensure new columns exist
        db.all("PRAGMA table_info(strategies)", (err, rows) => {
          if (err) return;
          const hasRisk = rows.some(r => r.name === 'risk');
          if (!hasRisk) {
            db.run("ALTER TABLE strategies ADD COLUMN risk TEXT DEFAULT 'Medium'");
            db.run("ALTER TABLE strategies ADD COLUMN description TEXT");
          }
        });

        // Seed strategies if empty
        db.get("SELECT count(*) as count FROM strategies", (err, row) => {
          if (err) return reject(err);
          if (row.count === 0) {
            db.run("INSERT INTO strategies (name, type, risk, description) VALUES ('GridMeanReversion', 'spot', 'Low', 'Stable grid strategy capturing small price movements in sideways markets.')");
            db.run("INSERT INTO strategies (name, type, risk, description) VALUES ('TrendFollower', 'spot', 'Medium', 'Dynamic trend tracking algorithm utilizing SuperTrend and ADX filters.')");
            db.run("INSERT INTO strategies (name, type, risk, description) VALUES ('UltimateFuturesScalper', 'futures', 'High', 'Aggressive futures scalping engine with RSI and volume momentum triggers.')");
          } else {
            // Update descriptions for existing ones
            db.run("UPDATE strategies SET risk = 'Low', description = 'Stable grid strategy capturing small price movements in sideways markets.' WHERE name = 'GridMeanReversion'");
            db.run("UPDATE strategies SET risk = 'Medium', description = 'Dynamic trend tracking algorithm utilizing SuperTrend and ADX filters.' WHERE name = 'TrendFollower'");
            db.run("UPDATE strategies SET risk = 'High', description = 'Aggressive futures scalping engine with RSI and volume momentum triggers.' WHERE name = 'UltimateFuturesScalper'");
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
        tp REAL,
        sl REAL,
        pnl REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => { 
        if (err) return reject(err); 
        // Migration: Ensure new columns exist
        db.all("PRAGMA table_info(signals)", (err, rows) => {
          if (err) return;
          const hasTp = rows.some(r => r.name === 'tp');
          if (!hasTp) {
            db.run("ALTER TABLE signals ADD COLUMN tp REAL");
            db.run("ALTER TABLE signals ADD COLUMN sl REAL");
            db.run("ALTER TABLE signals ADD COLUMN pnl REAL DEFAULT 0");
            db.run("ALTER TABLE signals ADD COLUMN status TEXT DEFAULT 'active'");
          }
        });
      });

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

      // Purchases table
      db.run(`CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        planId TEXT,
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
