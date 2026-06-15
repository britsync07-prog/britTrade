require('dotenv').config();
const liveTradeOrchestrator = require('./src/liveTrading/liveTradeOrchestrator');
const liveTradeDb = require('./src/liveTrading/liveTradeDb');

async function testTrade() {
  console.log('--- Starting Binance Trade Test ---');
  
  // 1. Initialize the orchestrator
  await liveTradeOrchestrator.initialize();
  
  // 2. Prepare a test signal (Strategy 3 - UltimateFuturesScalper)
  const testSignal = {
    strategyId: 3,
    symbol: 'BTC/USDT',
    side: 'buy', // This should open a LONG
    price: 30000, // Dummy price for limit order
    tp: 31000,
    sl: 29000,
    signalId: 999,
    isEntry: true
  };

  console.log('Manually firing signal:', testSignal);
  
  // 3. Handle the signal
  await liveTradeOrchestrator.handleSignal(testSignal);
  
  console.log('--- Test Signal Processed ---');
  console.log('Check live_trade_log and live_orders for results.');
  process.exit(0);
}

testTrade().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
