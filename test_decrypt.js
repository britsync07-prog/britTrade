
const { decrypt } = require('./backend/src/liveTrading/encryptionUtils');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database('./live_trading.db');

db.get('SELECT api_key_enc, api_sec_enc FROM user_binance_config WHERE user_id = 1', (err, row) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  if (!row) {
    console.log('No config for user 1');
    process.exit(0);
  }
  const key = decrypt(row.api_key_enc);
  const sec = decrypt(row.api_sec_enc);
  console.log('Decrypted Key Length:', key ? key.length : 0);
  console.log('Decrypted Secret Length:', sec ? sec.length : 0);
  db.close();
});
