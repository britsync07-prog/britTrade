const axios = require('axios');
const RSI = require('technicalindicators').RSI;

async function checkSignals() {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SHIBUSDT', 'TRXUSDT', 'DOGEUSDT', 'LTCUSDT', 'AVAXUSDT', 'DOTUSDT'];
  console.log('--- Current RSI Check (5m timeframe) ---');
  
  for (const s of symbols) {
    try {
      const res = await axios.get(`https://api.binance.com/api/v3/klines?symbol=${s}&interval=5m&limit=100`);
      const closes = res.data.map(k => parseFloat(k[4]));
      const rsiValues = RSI.calculate({ period: 14, values: closes });
      const currentRsi = rsiValues[rsiValues.length - 1];
      
      let signal = 'WAITING';
      if (currentRsi < 30) signal = 'BUY (RSI < 30)';
      if (currentRsi > 70) signal = 'SHORT (RSI > 70)';
      
      console.log(`${s.padEnd(10)}: Price: ${closes[closes.length-1].toFixed(4)} | RSI: ${currentRsi.toFixed(2)} | State: ${signal}`);
    } catch (e) {
      console.error(`Error checking ${s}`);
    }
  }
}

checkSignals();
