const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../platform.db');
const db = new sqlite3.Database(dbPath);
let corruptionShutdownStarted = false;

function isCorruptionError(err) {
  return err && (
    err.code === 'SQLITE_CORRUPT' ||
    (err.message && (err.message.includes('SQLITE_CORRUPT') || err.message.includes('malformed')))
  );
}

function moveIfExists(sourcePath, suffix) {
  if (!fs.existsSync(sourcePath)) return;

  const targetPath = `${dbPath}.corrupt_${suffix}${sourcePath.slice(dbPath.length)}`;
  fs.renameSync(sourcePath, targetPath);
  console.log(`Corrupted DB file moved: ${sourcePath} -> ${targetPath}`);
}

function handleCorruptDatabase(context, err) {
  if (!isCorruptionError(err) || corruptionShutdownStarted) return false;

  corruptionShutdownStarted = true;
  console.error('\x1b[31m%s\x1b[0m', `!!! CRITICAL: Runtime database corruption detected during ${context} !!!`);
  console.error(err);
  console.log('Auto-healing: closing SQLite, moving corrupted database files aside, and exiting for PM2 restart...');

  const suffix = Date.now();
  db.close((closeErr) => {
    if (closeErr) {
      console.error('[DB Close Error during corruption handling]', closeErr);
    }

    try {
      moveIfExists(dbPath, suffix);
      moveIfExists(`${dbPath}-journal`, suffix);
      moveIfExists(`${dbPath}-wal`, suffix);
      moveIfExists(`${dbPath}-shm`, suffix);
    } catch (moveErr) {
      console.error('[DB Move Error during corruption handling]', moveErr);
    }

    process.exit(1);
  });

  setTimeout(() => process.exit(1), 3000).unref();
  return true;
}

const initDb = async () => {
  // Wait to ensure tables are created
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    telegramId TEXT,
    balance REAL DEFAULT 10000.0,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  const userRows = await query("PRAGMA table_info(users)");
  if (!userRows.some(r => r.name === 'role')) {
    await run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  }
  if (!userRows.some(r => r.name === 'status')) {
    await run("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
  }
  if (!userRows.some(r => r.name === 'createdAt')) {
    await run("ALTER TABLE users ADD COLUMN createdAt DATETIME DEFAULT '2026-01-01 00:00:00'");
  }

  const userCount = await get("SELECT count(*) as count FROM users");
  if (userCount && userCount.count === 0) {
    console.log('Seeding initial admin: mehedy303@gmail.com');
    await run("INSERT INTO users (email, password, balance, role) VALUES (?, ?, ?, ?)",
      ['mehedy303@gmail.com', '$2b$10$zoHU1/AyxSNY6vB2Yb.X9.HGSJ0JTb4rWBlNUFtYsq6m3Yj0ZP7rC', 10000.0, 'admin']);
  } else {
    try { await run("UPDATE users SET role = 'admin' WHERE email = ?", ['mehedy303@gmail.com']); } catch(e){}
  }

  await run(`CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    risk TEXT DEFAULT 'Medium',
    description TEXT
  )`);

  const stratRows = await query("PRAGMA table_info(strategies)");
  if (!stratRows.some(r => r.name === 'risk')) {
    await run("ALTER TABLE strategies ADD COLUMN risk TEXT DEFAULT 'Medium'");
  }
  if (!stratRows.some(r => r.name === 'description')) {
    await run("ALTER TABLE strategies ADD COLUMN description TEXT");
  }

  const stratCount = await get("SELECT count(*) as count FROM strategies");
  if (stratCount && stratCount.count === 0) {
    await run("INSERT INTO strategies (name, type, risk, description) VALUES ('GridMeanReversion', 'spot', 'Low', 'Stable grid strategy capturing small price movements in sideways markets.')");
    await run("INSERT INTO strategies (name, type, risk, description) VALUES ('TrendFollower', 'spot', 'Medium', 'Dynamic trend tracking algorithm utilizing SuperTrend and ADX filters.')");
    await run("INSERT INTO strategies (name, type, risk, description) VALUES ('UltimateFuturesScalper', 'futures', 'High', 'Aggressive futures scalping engine with RSI and volume momentum triggers.')");
  } else {
    await run("UPDATE strategies SET risk = 'Low', description = 'Stable grid strategy capturing small price movements in sideways markets.' WHERE name = 'GridMeanReversion'");
    await run("UPDATE strategies SET risk = 'Medium', description = 'Dynamic trend tracking algorithm utilizing SuperTrend and ADX filters.' WHERE name = 'TrendFollower'");
    await run("UPDATE strategies SET risk = 'High', description = 'Aggressive futures scalping engine with RSI and volume momentum triggers.' WHERE name = 'UltimateFuturesScalper'");
  }

  await run(`CREATE TABLE IF NOT EXISTS signals (
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
  )`);

  const sigRows = await query("PRAGMA table_info(signals)");
  if (!sigRows.some(r => r.name === 'tp')) {
    try { await run("ALTER TABLE signals ADD COLUMN tp REAL"); } catch(e){}
    try { await run("ALTER TABLE signals ADD COLUMN sl REAL"); } catch(e){}
    try { await run("ALTER TABLE signals ADD COLUMN pnl REAL DEFAULT 0"); } catch(e){}
    try { await run("ALTER TABLE signals ADD COLUMN status TEXT DEFAULT 'active'"); } catch(e){}
  }
  if (!sigRows.some(r => r.name === 'entryCount')) {
    try { await run("ALTER TABLE signals ADD COLUMN entryCount INTEGER DEFAULT 1"); } catch(e){}
  }
  if (!sigRows.some(r => r.name === 'highestPrice')) {
    try { await run("ALTER TABLE signals ADD COLUMN highestPrice REAL"); } catch(e){}
  }

  await run("DROP TABLE IF EXISTS paper_trades");
  await run("DROP TABLE IF EXISTS trades");

  await run(`CREATE TABLE IF NOT EXISTS subscriptions (
    userId INTEGER,
    strategyId INTEGER,
    useSignal BOOLEAN DEFAULT 1,
    PRIMARY KEY (userId, strategyId)
  )`);

  await run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    planId TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    strategyId INTEGER,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('Database initialized successfully.');
};

const safeInitDb = async () => {
  try {
    await initDb();
  } catch (err) {
    if (handleCorruptDatabase('startup', err)) {
      return;
    }
    throw err;
  }
};

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error(`[DB Query Error] SQL: ${sql} | Params: ${JSON.stringify(params)} | Error:`, err);
        handleCorruptDatabase('query', err);
        reject(err);
      } else resolve(rows);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error(`[DB Get Error] SQL: ${sql} | Params: ${JSON.stringify(params)} | Error:`, err);
        handleCorruptDatabase('get', err);
        reject(err);
      } else resolve(row);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error(`[DB Run Error] SQL: ${sql} | Params: ${JSON.stringify(params)} | Error:`, err);
        handleCorruptDatabase('run', err);
        reject(err);
      } else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

module.exports = { initDb: safeInitDb, query, get, run };
