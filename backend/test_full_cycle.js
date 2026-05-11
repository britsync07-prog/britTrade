const liveTradeOrchestrator = require('./src/liveTrading/liveTradeOrchestrator');
const liveTradeDb = require('./src/liveTrading/liveTradeDb');

async function testFullCycle() {
  console.log('>>> Starting FULL CYCLE Trade Test (Entry + Exit) <<<');
  
  // 1. Initialize
  await liveTradeOrchestrator.initialize();
  await liveTradeDb.initLiveTradeDb();

  const STRATEGY_ID = 3;
  const SYMBOL = 'ETH/USDT';

  // 2. Configure Strategy
  console.log(`\n[1/4] Configuring Strategy ${STRATEGY_ID}...`);
  await liveTradeDb.updateStrategyConfig(STRATEGY_ID, {
    enabled: true,
    trade_amount_usdt: 10,
    allocated_capital: 100,
    leverage: 5,
    max_open_orders: 10
  });

  // 3. Step A: SEND ENTRY SIGNAL
  const entrySignal = {
    strategyId: STRATEGY_ID,
    symbol: SYMBOL,
    side: 'buy',
    isEntry: true,
    signalId: 'TEST_ENTRY_' + Date.now()
  };

  console.log(`\n[2/4] Sending ENTRY Signal for ${SYMBOL}...`);
  await liveTradeOrchestrator.handleSignal(entrySignal);

  // Check DB
  const openOrders = await liveTradeDb.getOpenOrders(STRATEGY_ID);
  if (openOrders.length > 0) {
    console.log(`✅ Entry successful. Order ID: ${openOrders[0].binance_id}, Qty: ${openOrders[0].amount}`);
  } else {
    console.error('❌ Entry failed! No open orders found in DB.');
    process.exit(1);
  }

  // 4. Wait for 10 seconds
  console.log('\n[3/4] Waiting 10 seconds before closing...');
  await new Promise(r => setTimeout(r, 10000));

  // 5. Step B: SEND EXIT SIGNAL
  const exitSignal = {
    strategyId: STRATEGY_ID,
    symbol: SYMBOL,
    side: 'sell', // Exit a BUY with a SELL
    isEntry: false,
    signalId: 'TEST_EXIT_' + Date.now()
  };

  console.log(`\n[4/4] Sending EXIT Signal for ${SYMBOL}...`);
  await liveTradeOrchestrator.handleSignal(exitSignal);

  // 6. Final Verification
  const stillOpen = await liveTradeDb.getOpenOrders(STRATEGY_ID);
  const isClosed = stillOpen.filter(o => o.symbol === SYMBOL).length === 0;

  if (isClosed) {
    console.log('\n>>> SUCCESS: Trade opened and closed correctly! <<<');
    console.log('Check your Binance history and Dashboard History tab.');
  } else {
    console.error('\n❌ FAILURE: Trade is still showing as OPEN in the database!');
  }

  process.exit(0);
}

testFullCycle().catch(err => {
  console.error('Test Error:', err);
  process.exit(1);
});
