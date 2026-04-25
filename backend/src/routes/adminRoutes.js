const express = require('express');
const router = express.Router();
const db = require('../db');
const authMiddleware = require('./authMiddleware');

// Admin Check Middleware
const adminMiddleware = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Administrative access required' });
  }
  next();
};

// --- User Management ---

// Get all users with stats
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const q = req.query.q || '';
    const users = await db.query(
      "SELECT id, email, balance, role, status, createdAt FROM users WHERE email LIKE ? ORDER BY id DESC",
      [`%${q}%`]
    );

    // Enrich with actual plans
    const now = new Date().toISOString();
    for (let user of users) {
      const purchases = await db.query(
        "SELECT planId, expiresAt FROM purchases WHERE userId = ? AND (expiresAt IS NULL OR expiresAt > ?)", 
        [user.id, now]
      );
      user.purchasedPlans = purchases.map(p => p.planId);
      user.planCount = purchases.length;
    }

    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create user manually (Admin only)
router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { email, password, role = 'user' } = req.body;
    const authService = require('../services/authService');
    const user = await authService.signup(email, password);

    if (role === 'admin') {
      await db.run("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
    }

    res.status(201).json({ message: 'User created', user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update user (role, status, balance)
router.put('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role, status, balance } = req.body;
    await db.run(
      "UPDATE users SET role = ?, status = ?, balance = ? WHERE id = ?",
      [role, status, balance, req.params.id]
    );
    res.json({ message: 'User updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete user
router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.run("DELETE FROM users WHERE id = ?", [req.params.id]);
    await db.run("DELETE FROM subscriptions WHERE userId = ?", [req.params.id]);
    await db.run("DELETE FROM purchases WHERE userId = ?", [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- User Plan Management ---

// Get user purchases
router.get('/users/:id/purchases', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const purchases = await db.query("SELECT planId, timestamp, expiresAt FROM purchases WHERE userId = ?", [req.params.id]);
    res.json(purchases);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add plan manually
router.post('/users/:id/purchases', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.params.id;
    console.log(`[Admin API] Granting plan ${planId} to user ${userId}`);

    // Standardize to underscored plan IDs
    const normalizedPlanId = planId ? planId.toString().replace('-', '_') : planId;
    
    // Delegate to authService which handles both purchase recording AND strategy auto-subscription
    const authService = require('../services/authService');
    await authService.purchasePlan(userId, normalizedPlanId);
    
    res.json({ message: 'Plan granted and strategies subscribed' });
  } catch (e) {
    console.error(`[Admin API Error] POST /users/${req.params.id}/purchases:`, e);
    res.status(500).json({ error: e.message || 'Failed to update plan' });
  }
});

// Remove plan
router.delete('/users/:id/purchases/:planId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.run("DELETE FROM purchases WHERE userId = ? AND planId = ?", [req.params.id, req.params.planId]);
    res.json({ message: 'Plan revoked' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Platform Stats ---
router.get('/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userCount = await db.get("SELECT count(*) as count FROM users");
    const activeSignals = await db.get("SELECT count(*) as count FROM signals WHERE status = 'active'");
    const totalPurchases = await db.get("SELECT count(*) as count FROM purchases");

    // Revenue estimation (Static based on known plan prices)
    const purchases = await db.query("SELECT planId FROM purchases");
    const prices = { 'low_risk': 25, 'medium_risk': 20, 'high_risk': 15, 'bundle': 50 };
    const revenue = purchases.reduce((acc, p) => acc + (prices[p.planId] || 0), 0);

    res.json({
      totalUsers: userCount.count,
      activeSignals: activeSignals.count,
      totalRevenue: revenue,
      totalSales: totalPurchases.count
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Marketing Management (Events & Offers) ---

// Events
router.get('/marketing/events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const events = await db.query("SELECT * FROM events ORDER BY createdAt DESC");
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/marketing/events', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, planId, trialDays, startDate, endDate } = req.body;
    if (!name || !planId || !trialDays || !startDate || !endDate) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    await db.run(
      "INSERT INTO events (name, planId, trialDays, startDate, endDate) VALUES (?, ?, ?, ?, ?)",
      [name, planId, trialDays, startDate, endDate]
    );
    res.status(201).json({ message: 'Event created successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/marketing/events/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.run("DELETE FROM events WHERE id = ?", [req.params.id]);
    res.json({ message: 'Event deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Offers
router.get('/marketing/offers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const offers = await db.query("SELECT * FROM offers ORDER BY createdAt DESC");
    res.json(offers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/marketing/offers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { planId, discountPercentage, startDate, endDate } = req.body;
    if (!planId || !discountPercentage || !startDate || !endDate) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    await db.run(
      "INSERT INTO offers (planId, discountPercentage, startDate, endDate) VALUES (?, ?, ?, ?)",
      [planId, discountPercentage, startDate, endDate]
    );
    res.status(201).json({ message: 'Offer created successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/marketing/offers/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await db.run("DELETE FROM offers WHERE id = ?", [req.params.id]);
    res.json({ message: 'Offer deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
