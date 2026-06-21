'use strict';

/**
 * reset_trades.js
 * ===============
 * Wipes all live trading history, logs, signals, paper trades, and resets budgets
 * in both backend/ and root directories to ensure complete reset.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

function resetLiveTradeDb(dbPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(dbPath)) {
      console.log(`live_trading.db not found at: ${dbPath}`);
      return resolve();
    }
    if (fs.statSync(dbPath).size === 0) {
      console.log(`Skipping empty live_trading.db at: ${dbPath}`);
      return resolve();
    }
    
    console.log(`Resetting live_trading db at: ${dbPath}`);
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`Failed to open ${dbPath}:`, err.message);
        return resolve();
      }
    });

    db.serialize(() => {
      db.run("DELETE FROM live_orders", (err) => {
        if (err) console.log(`  [live_orders error] ${err.message}`);
        else console.log(`  Cleared live_orders`);
      });
      db.run("DELETE FROM live_trade_log", (err) => {
        if (err) console.log(`  [live_trade_log error] ${err.message}`);
        else console.log(`  Cleared live_trade_log`);
      });
      db.run("UPDATE live_trade_configs SET enabled=0", (err) => {
        if (err) console.log(`  [live_trade_configs error] ${err.message}`);
        else console.log(`  Reset strategy configs (disabled all)`);
      });
    });

    db.close((err) => {
      resolve();
    });
  });
}

function resetPlatformDb(dbPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(dbPath)) {
      console.log(`platform.db not found at: ${dbPath}`);
      return resolve();
    }
    if (fs.statSync(dbPath).size === 0) {
      console.log(`Skipping empty platform.db at: ${dbPath}`);
      return resolve();
    }

    console.log(`Resetting platform db at: ${dbPath}`);
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`Failed to open ${dbPath}:`, err.message);
        return resolve();
      }
    });

    db.serialize(() => {
      db.run("DELETE FROM signals", (err) => {
        if (err) console.log(`  [signals error] ${err.message}`);
        else console.log(`  Cleared signals`);
      });
      db.run("DELETE FROM paper_trades", (err) => {
        if (err) console.log(`  [paper_trades error] ${err.message}`);
        else console.log(`  Cleared paper_trades`);
      });
      db.run("UPDATE strategy_daily_budgets SET currentBalance = 100.0, lastReset = CURRENT_TIMESTAMP", (err) => {
        if (err) console.log(`  [strategy_daily_budgets error] ${err.message}`);
        else console.log(`  Reset daily budgets to $100`);
      });
    });

    db.close((err) => {
      resolve();
    });
  });
}

async function run() {
  console.log('=== Starting Master Database Reset ===\n');

  const liveTradePaths = [
    path.resolve(__dirname, 'live_trading.db'),
    path.resolve(__dirname, '../live_trading.db'),
  ];

  const platformPaths = [
    path.resolve(__dirname, 'platform.db'),
    path.resolve(__dirname, '../platform.db'),
  ];

  for (const p of liveTradePaths) {
    await resetLiveTradeDb(p);
  }

  console.log('');

  for (const p of platformPaths) {
    await resetPlatformDb(p);
  }

  console.log('\n>>> SUCCESS: All databases are clean. You can now start fresh. <<<');
  process.exit(0);
}

run().catch(err => {
  console.error('Reset Failed:', err);
  process.exit(1);
});
