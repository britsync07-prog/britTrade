const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

class AuthService {
  async signup(email, password, agreedToTerms, riskAccepted) {
    if (!email || !email.trim()) throw new Error('Email is required');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
    if (!agreedToTerms || !riskAccepted) throw new Error('You must agree to the Terms and Risk Disclosure');

    const emailNormalized = email.trim().toLowerCase();
    const existing = await db.get("SELECT id FROM users WHERE email = ?", [emailNormalized]);
    if (existing) throw new Error('Account with this email already exists');

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await db.run(
      "INSERT INTO users (email, password, agreedToTerms, riskAccepted) VALUES (?, ?, ?, ?)",
      [emailNormalized, hashedPassword, agreedToTerms ? 1 : 0, riskAccepted ? 1 : 0]
    );

    // Check for active events for free trials
    try {
      const now = new Date().toISOString();
      const activeEvent = await db.get(
        "SELECT * FROM events WHERE status = 'active' AND startDate <= ? AND endDate >= ? LIMIT 1",
        [now, now]
      );

      if (activeEvent) {
        console.log(`[AuthService] Active event found: ${activeEvent.name}. Granting ${activeEvent.trialDays} days trial of ${activeEvent.planId} to ${emailNormalized}`);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + activeEvent.trialDays);
        await this.purchasePlan(result.id, activeEvent.planId, expiresAt.toISOString());
      }
    } catch (eventError) {
      console.error('[AuthService] Failed to check for active events during signup:', eventError);
    }

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
      const now = new Date().toISOString();
      const purchases = await db.query(
        "SELECT planId FROM purchases WHERE userId = ? AND (expiresAt IS NULL OR expiresAt > ?)", 
        [userId, now]
      );
      user.purchasedPlans = purchases.map(p => p.planId);
    }
    return user;
  }

  async purchasePlan(userId, planId, expiresAt = null) {
    try {
      if (!planId) throw new Error('Plan ID is required');
      
      // Check if already purchased/active
      const now = new Date().toISOString();
      const existing = await db.get(
        "SELECT id FROM purchases WHERE userId = ? AND planId = ? AND (expiresAt IS NULL OR expiresAt > ?)", 
        [userId, planId, now]
      );
      if (existing) return { status: 'Already active' };

      await db.run(
        "INSERT INTO purchases (userId, planId, expiresAt) VALUES (?, ?, ?)", 
        [userId, planId, expiresAt]
      );
      
      // Automatic subscription logic
      const strategyService = require('./strategyService');
      const planToStrat = {
        'low_risk': [1],
        'medium_risk': [2],
        'high_risk': [3],
        'bundle': [1, 2, 3]
      };

      const stratIds = planToStrat[planId] || [];
      for (const sid of stratIds) {
        await strategyService.subscribe(userId, sid, true);
      }

      return { status: 'Success', planId };
    } catch (error) {
      console.error(`[AuthService] purchasePlan failed for user ${userId}, plan ${planId}:`, error);
      throw error;
    }
  }

  async updateBalance(userId, newBalance) {
    if (newBalance === undefined || isNaN(newBalance)) throw new Error('Valid balance is required');
    await db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, userId]);
    return { balance: newBalance };
  }
}

module.exports = new AuthService();
