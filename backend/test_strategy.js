const db = require('./src/db');
const strategyService = require('./src/services/strategyService');

(async () => {
    try {
        await db.initDb();
        console.log('Testing TrendFollower (ID: 2)...');
        await strategyService.runStrategy(2);
        console.log('Testing GridMeanReversion (ID: 1)...');
        await strategyService.runStrategy(1);
        console.log('Testing UltimateFuturesScalper (ID: 3)...');
        await strategyService.runStrategy(3);
    } catch (e) {
        console.error(e);
    }
})();
