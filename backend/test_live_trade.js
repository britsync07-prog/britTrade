'use strict';

/**
 * test_live_trade.js
 * =================
 * Test script to OPEN a trade and leave it open for dashboard testing.
 */

const liveTradeOrchestrator = require('./src/liveTrading/liveTradeOrchestrator');
const liveTradeDb = require('./src/liveTrading/liveTradeDb');

async function test() {
  console.log('>>> Starting Live Trade Open-Only Test <<<');

  // 1. Initialize DB and Orchestrator
  await liveTradeOrchestrator.initialize();

  // 2. Ensure Strategy 3 is enabled and has $20 trade amount + 5x leverage
  console.log('Configuring Strategy 3...');
  await liveTradeDb.initLiveTradeDb();
  await liveTradeDb.updateStrategyConfig(3, {
    enabled: true,
    trade_amount_usdt: 10,
    allocated_capital: 100,
    leverage: 5,
    max_open_orders: 100
  });

  // 3. Mock a BUY signal for Strategy 3
  const buySignal = {
    strategyId: 3,
    symbol: 'ETH/USDT',
    side: 'buy',
    price: 81000,
    signalId: Math.floor(Date.now() / 1000), // Unique ID
    isEntry: true
  };

  console.log('\n--- Sending BUY Signal (Position will stay OPEN) ---');
  await liveTradeOrchestrator.handleSignal(buySignal);

  console.log('\n>>> SUCCESS: Trade opened. Check your Admin Panel "Open Trades" now! <<<');
  process.exit(0);
}

test().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
