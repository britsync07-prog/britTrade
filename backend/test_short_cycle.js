const liveTradeOrchestrator = require('./src/liveTrading/liveTradeOrchestrator');
const liveTradeDb = require('./src/liveTrading/liveTradeDb');

async function testShortCycle() {
  console.log('>>> Starting SHORT CYCLE Trade Test (Sell Entry -> Buy Exit) <<<');
  
  // 1. Initialize
  await liveTradeOrchestrator.initialize();
  await liveTradeDb.initLiveTradeDb();

  const STRATEGY_ID = 3;
  const SYMBOL = 'ETH/USDT';

  // 2. Configure Strategy
  console.log(`\n[1/4] Configuring Strategy ${STRATEGY_ID} for SHORTING...`);
  await liveTradeDb.updateStrategyConfig(STRATEGY_ID, {
    enabled: true,
    trade_amount_usdt: 20,
    allocated_capital: 100,
    leverage: 5,
    max_open_orders: 10
  });

  // CLEANUP: Close any old ETH/USDT trades
  await liveTradeDb.run("UPDATE live_orders SET status='CLOSED' WHERE symbol=? AND status IN ('OPEN', 'FILLED')", [SYMBOL]);

  // 3. Step A: SEND SHORT ENTRY SIGNAL
  // Many strategies send "sell" or "short" for entry
  const entrySignal = {
    strategyId: STRATEGY_ID,
    symbol: SYMBOL,
    side: 'short', 
    isEntry: true,
    signalId: 'TEST_SHORT_ENTRY_' + Date.now()
  };

  console.log(`\n[2/4] Sending SHORT ENTRY (SELL) Signal for ${SYMBOL}...`);
  await liveTradeOrchestrator.handleSignal(entrySignal);

  // Check DB
  const openOrders = await liveTradeDb.getOpenOrders(STRATEGY_ID);
  const myOrder = openOrders.find(o => o.symbol === SYMBOL);
  if (myOrder) {
    console.log(`✅ Short opened. DB id: ${myOrder.id}, Side: ${myOrder.side}, Qty: ${myOrder.amount}`);
  } else {
    console.error('❌ Short entry failed!');
    process.exit(1);
  }

  // 4. Wait for 10 seconds
  console.log('\n[3/4] Waiting 10 seconds before closing short...');
  await new Promise(r => setTimeout(r, 10000));

  // 5. Step B: SEND EXIT SIGNAL
  // Even if the signal says "sell" for exit, our new logic should flip it to "buy"
  const exitSignal = {
    strategyId: STRATEGY_ID,
    symbol: SYMBOL,
    side: 'sell', // <--- This was the problematic label!
    isEntry: false,
    signalId: 'TEST_SHORT_EXIT_' + Date.now()
  };

  console.log(`\n[4/4] Sending EXIT Signal for ${SYMBOL} (Bot should automatically BUY)...`);
  await liveTradeOrchestrator.handleSignal(exitSignal);

  // 6. Final Verification
  const stillOpen = await liveTradeDb.getOpenOrders(STRATEGY_ID);
  const isClosed = stillOpen.filter(o => o.symbol === SYMBOL).length === 0;

  if (isClosed) {
    console.log('\n>>> SUCCESS: Short opened with SELL and closed with BUY correctly! <<<');
  } else {
    console.error('\n❌ FAILURE: Trade is still showing as OPEN in the database!');
  }

  process.exit(0);
}

testShortCycle().catch(err => {
  console.error('Test Error:', err);
  process.exit(1);
});
