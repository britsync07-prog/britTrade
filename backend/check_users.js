const db = require('./src/db');
async function check() {
  try {
    await db.initDb();
    const users = await db.query("SELECT id, email, role, status, createdAt FROM users");
    console.log('USERS:', JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
check();
