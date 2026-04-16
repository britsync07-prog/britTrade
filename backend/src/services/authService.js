const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'your_super_secret_key';
const strategyService = require('./strategyService');

class AuthService {
  async signup(email, password) {
    if (!email || !email.trim()) throw new Error('Email is required');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

    const emailNormalized = email.trim().toLowerCase();
    const existing = await db.get("SELECT id FROM users WHERE email = ?", [emailNormalized]);
    if (existing) throw new Error('Account with this email already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.run(
      "INSERT INTO users (email, password) VALUES (?, ?)",
      [emailNormalized, hashedPassword]
    );
    return { id: result.id, email };
  }

  async login(email, password) {
    if (!email || !password) throw new Error('Email and password are required');

    const user = await db.get("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (!user) throw new Error("User not found");

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new Error("Invalid password");

    if (user.status === 'suspended') throw new Error("Account suspended. Contact support.");

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: '24h' });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  }

  async me(userId) {
    const user = await db.get("SELECT id, email, telegramId, balance, role, status FROM users WHERE id = ?", [userId]);
    if (!user) return null;
    
    if (user.role === 'admin') {
      user.purchasedPlans = ['low_risk', 'medium_risk', 'high_risk', 'bundle'];
    } else {
      const purchases = await db.query("SELECT planId FROM purchases WHERE userId = ?", [userId]);
      user.purchasedPlans = purchases.map(p => p.planId);
    }
    return user;
  }

  async purchasePlan(userId, planId) {
    if (!planId) throw new Error('Plan ID is required');
    
    // Check if already purchased
    const existing = await db.get("SELECT id FROM purchases WHERE userId = ? AND planId = ?", [userId, planId]);
    if (existing) return { status: 'Already purchased' };

    await db.run("INSERT INTO purchases (userId, planId) VALUES (?, ?)", [userId, planId]);
    
    // Automatic subscription logic
    const planToStrat = {
      'low_risk': [1],
      'medium_risk': [2],
      'high_risk': [3],
      'bundle': [1, 2, 3]
    };

    const stratIds = planToStrat[planId] || [];
    for (const sid of stratIds) {
      await strategyService.subscribe(userId, sid, true, true, 1000); // Auto-subscribe with $1000 balance
    }

    return { status: 'Success', planId };
  }

  async updateBalance(userId, newBalance) {
    if (newBalance === undefined || isNaN(newBalance)) throw new Error('Valid balance is required');
    await db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, userId]);
    return { balance: newBalance };
  }
}

module.exports = new AuthService();
