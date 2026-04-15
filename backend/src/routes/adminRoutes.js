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
      "SELECT id, email, balance, role, status FROM users WHERE email LIKE ? ORDER BY id DESC",
      [`%${q}%`]
    );

    // Enrich with purchase count
    for (let user of users) {
      const p = await db.get("SELECT count(*) as count FROM purchases WHERE userId = ?", [user.id]);
      user.planCount = p.count;
    }

    res.json(users);
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

module.exports = router;
