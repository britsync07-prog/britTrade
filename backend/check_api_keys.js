const axios = require('axios');
const crypto = require('crypto');

async function checkApiKey(apiKey, secretKey) {
  const endpoints = [
    { name: 'LIVE (Mainnet)', url: 'https://fapi.binance.com' },
    { name: 'TESTNET', url: 'https://testnet.binancefuture.com' }
  ];

  console.log('>>> Checking API Key Connectivity <<<');

  for (const env of endpoints) {
    try {
      const timestamp = Date.now();
      const query = `timestamp=${timestamp}&recvWindow=10000`;
      const signature = crypto.createHmac('sha256', secretKey).update(query).digest('hex');

      const response = await axios.get(`${env.url}/fapi/v2/account?${query}&signature=${signature}`, {
        headers: { 'X-MBX-APIKEY': apiKey },
        timeout: 5000
      });

      if (response.data && response.data.totalWalletBalance !== undefined) {
        console.log(`\n✅ SUCCESS: These keys are for ${env.name}!`);
        console.log(`Balance Found: ${response.data.totalWalletBalance} USDT`);
        return;
      }
    } catch (err) {
      const msg = err.response ? JSON.stringify(err.response.data) : err.message;
      console.log(`❌ ${env.name}: ${msg}`);
    }
  }

  console.log('\n❌ Result: These keys do not seem to work for either Live or Testnet. Please check your API permissions (Enable Futures).');
}

const keys = {
  apiKey: "f1WQUmYMGKCCPWGXIEvlkaKZW47LWk4kDYWZIAcGkotx0Am65IXyl5qByz6OZIXL",
  secret: "oTwQdkTD4JZhDCiNvkWwg2dpgIwyFcNqkf9UjpEvH0HKIcZ8lY0kzicVNO8f0YCc"
};

checkApiKey(keys.apiKey, keys.secret);
