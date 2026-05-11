'use strict';

/**
 * test_live_trade.js
 * =================
 * Test script to verify the live trading orchestrator logic.
 */

const liveTradeOrchestrator = require('./src/liveTrading/liveTradeOrchestrator');
const liveTradeDb = require('./src/liveTrading/liveTradeDb');

async function test() {
  console.log('>>> Starting Live Trade Test <<<');
  
  // 1. Initialize DB and Orchestrator
  await liveTradeOrchestrator.initialize();
  
  // 2. Ensure Strategy 3 is enabled and has $21 trade amount
  console.log('Enabling Strategy 3 in DB...');
  await liveTradeDb.initLiveTradeDb(); // run migrations
  await liveTradeDb.updateStrategyConfig(3, {
    enabled: true,
    trade_amount_usdt: 100,
    allocated_capital: 1000,
    leverage: 5
  });

  // 3. Mock a BUY signal for Strategy 3
  const buySignal = {
    strategyId: 3,
    symbol: 'BTC/USDT',
    side: 'buy',
    price: 60000,
    signalId: 9999, // dummy
    isEntry: true
  };

  console.log('\n--- Sending BUY Signal ---');
  await liveTradeOrchestrator.handleSignal(buySignal);

  console.log('\nWaiting 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));

  // 4. Mock a SELL signal for Strategy 3 (to test closing)
  const sellSignal = {
    strategyId: 3,
    symbol: 'BTC/USDT',
    side: 'sell',
    price: 61000,
    signalId: 10000, // dummy
    isEntry: false
  };

  console.log('\n--- Sending SELL (Exit) Signal ---');
  await liveTradeOrchestrator.handleSignal(sellSignal);

  console.log('\n>>> Test Complete. Check your Binance Testnet / Live account (if configured) for orders. <<<');
  process.exit(0);
}

test().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
