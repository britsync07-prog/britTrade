const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

class AuthService {
  async signup(email, password) {
    if (!email || !email.trim()) throw new Error('Email is required');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.run(
      "INSERT INTO users (email, password) VALUES (?, ?)",
      [email.trim().toLowerCase(), hashedPassword]
    );
    return { id: result.id, email };
  }

  async login(email, password) {
    if (!email || !password) throw new Error('Email and password are required');

    const user = await db.get("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (!user) throw new Error("User not found");

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new Error("Invalid password");

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '24h' });
    return { token, user: { id: user.id, email: user.email } };
  }

  async me(userId) {
    const user = await db.get("SELECT id, email, telegramId, balance FROM users WHERE id = ?", [userId]);
    return user;
  }

  async updateBalance(userId, newBalance) {
    if (newBalance === undefined || isNaN(newBalance)) throw new Error('Valid balance is required');
    await db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, userId]);
    return { balance: newBalance };
  }
}

module.exports = new AuthService();
