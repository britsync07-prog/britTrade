const liveTradeOrchestrator = require('./src/liveTrading/liveTradeOrchestrator');
const liveTradeDb = require('./src/liveTrading/liveTradeDb');

async function testLimitExpiry() {
  console.log('>>> Starting LIMIT ORDER EXPIRY Test <<<');
  console.log('Goal: Place a $10,000 BTC order and see if the bot cancels it after 2 minutes.');
  
  // 1. Initialize
  await liveTradeOrchestrator.initialize();
  await liveTradeDb.initLiveTradeDb();

  const STRATEGY_ID = 3;
  const SYMBOL = 'BTC/USDT';

  // 2. Configure Strategy for LIMIT orders
  console.log(`\n[1/3] Configuring Strategy ${STRATEGY_ID} for LIMIT orders...`);
  await liveTradeDb.updateStrategyConfig(STRATEGY_ID, {
    enabled: true,
    trade_amount_usdt: 20,
    allocated_capital: 100,
    leverage: 5,
    max_open_orders: 10,
    order_type: 'limit'
  });

  // CLEANUP: Close any old BTC trades
  await liveTradeDb.run("UPDATE live_orders SET status='CLOSED' WHERE symbol=? AND status IN ('OPEN', 'NEW')", [SYMBOL]);

  // 3. Step A: SEND LIMIT ENTRY AT IMPOSSIBLE PRICE
  const entrySignal = {
    strategyId: STRATEGY_ID,
    symbol: SYMBOL,
    side: 'buy',
    isEntry: true,
    price: 10000.00, // This price will NEVER hit today
    signalId: 'TEST_EXPIRY_' + Date.now()
  };

  console.log(`\n[2/3] Placing LIMIT BUY for ${SYMBOL} at $10,000...`);
  await liveTradeOrchestrator.handleSignal(entrySignal);

  // Check DB to ensure it's "OPEN" or "NEW"
  const allOrders = await liveTradeDb.getOrders(10, 0);
  const myOrder = allOrders.find(o => 
    o.symbol === SYMBOL && 
    ['OPEN', 'NEW', 'new', 'open'].includes(o.status)
  );

  if (myOrder) {
    console.log(`✅ Order placed on Binance! ID: ${myOrder.binance_id} (Status: ${myOrder.status}). Now waiting 130 seconds...`);
  } else {
    console.log('Last orders in DB:', allOrders.map(o => `${o.symbol}: ${o.status}`));
    console.error('❌ Order failed to place or was already closed.');
    process.exit(1);
  }

  // 4. Wait for 130 seconds (just over the 120s limit)
  // We check every 10 seconds to show progress
  for (let i = 0; i < 13; i++) {
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 10000));
  }
  console.log('\nTime is up! Checking status...');

  // 5. Final Verification
  const checkOrder = await liveTradeDb.all("SELECT status FROM live_orders WHERE binance_id=?", [myOrder.binance_id]);
  const status = checkOrder[0].status;

  if (status === 'CANCELLED') {
    console.log(`\n>>> SUCCESS: Order ${myOrder.binance_id} was automatically CANCELLED by the bot! <<<`);
  } else {
    console.error(`\n❌ FAILURE: Order is still ${status}. Background watcher might not be running.`);
  }

  process.exit(0);
}

testLimitExpiry().catch(err => {
  console.error('Test Error:', err);
  process.exit(1);
});
