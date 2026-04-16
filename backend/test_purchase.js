const db = require('./src/db');
const authService = require('./src/services/authService');

async function test() {
  try {
    await db.initDb();
    const userId = 4;
    const planId = 'low_risk';
    console.log(`Testing purchasePlan for userId=${userId}, planId=${planId}`);
    const result = await authService.purchasePlan(userId, planId);
    console.log('Result:', result);
    process.exit(0);
  } catch (e) {
    console.error('TEST FAILED:', e);
    process.exit(1);
  }
}
test();
