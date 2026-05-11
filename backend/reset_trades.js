'use strict';

/**
 * reset_trades.js
 * ===============
 * Wipes all live trading history and logs from the database.
 * Use this to start fresh.
 */

const liveTradeDb = require('./src/liveTrading/liveTradeDb');

async function reset() {
  console.log('>>> Wiping Live Trading History <<<');
  
  await liveTradeDb.initLiveTradeDb(); // Ensure DB is open
  
  // 1. Delete all orders
  console.log('Clearing live_orders...');
  await liveTradeDb.run('DELETE FROM live_orders');
  
  // 2. Delete all logs
  console.log('Clearing live_trade_log...');
  await liveTradeDb.run('DELETE FROM live_trade_log');
  
  // 3. Reset strategy configs (optional: disable them all)
  console.log('Resetting strategy configs...');
  await liveTradeDb.run('UPDATE live_trade_configs SET enabled=0');

  console.log('\n>>> SUCCESS: Database is clean. You can now start fresh. <<<');
  process.exit(0);
}

reset().catch(err => {
  console.error('Reset Failed:', err);
  process.exit(1);
});
