const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const dbPath = path.resolve(__dirname, 'platform.db');
const db = new sqlite3.Database(dbPath);

const [, , email, password] = process.argv;

if (!email || !password) {
  console.log('Usage: node create_admin.js <email> <password>');
  console.log('Example: node create_admin.js admin@example.com MySecurePass123');
  process.exit(1);
}

async function createAdmin() {
  try {
    const existing = await new Promise((resolve, reject) => {
      db.get("SELECT id FROM users WHERE email = ?", [email.trim().toLowerCase()], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    if (existing) {
      // Update existing user to admin
      await new Promise((resolve, reject) => {
        db.run("UPDATE users SET role = 'admin' WHERE email = ?", [email.trim().toLowerCase()], (err) => {
          if (err) reject(err); else resolve();
        });
      });
      console.log(`✅ User ${email} updated to admin role`);
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(password, 10);
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO users (email, password, balance, role, status) VALUES (?, ?, ?, ?, ?)",
          [email.trim().toLowerCase(), hashedPassword, 10000.0, 'admin', 'active'],
          function(err) { if (err) reject(err); else resolve(); }
        );
      });
      console.log(`✅ Admin user created: ${email}`);
    }

    // Verify
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT id, email, role FROM users WHERE email = ?", [email.trim().toLowerCase()], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    console.log(`   ID: ${user.id}, Email: ${user.email}, Role: ${user.role}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    db.close();
  }
}

createAdmin();
