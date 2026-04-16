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
    console.log(`[Admin API] Fetching users matching "${q}"`);
    
    const users = await db.query(
      "SELECT id, email, balance, role, status, createdAt FROM users WHERE email LIKE ? ORDER BY id DESC",
      [`%${q}%`]
    );

    console.log(`[Admin API] Found ${users.length} users`);

    // Enrich with actual plans
    for (let user of users) {
      try {
        const purchases = await db.query("SELECT planId FROM purchases WHERE userId = ?", [user.id]);
        user.purchasedPlans = purchases.map(p => p.planId) || [];
        user.planCount = purchases.length;
        console.log(`[Admin API] User ${user.email} (ID: ${user.id}) has ${user.purchasedPlans.length} plans`);
      } catch (enrichErr) {
        console.error(`[Admin API] Enrichment failed for user ${user.id}:`, enrichErr.message);
        user.purchasedPlans = [];
        user.planCount = 0;
      }
    }

    res.json(users);
  } catch (e) {
    console.error('[Admin API] GET /users failed:', e.message);
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
    
    // Fetch current user data to preserve existing values if they're not in the request body
    const currentUser = await db.get("SELECT role, status, balance FROM users WHERE id = ?", [req.params.id]);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const finalRole = role !== undefined ? role : currentUser.role;
    const finalStatus = status !== undefined ? status : currentUser.status;
    const finalBalance = balance !== undefined ? balance : currentUser.balance;

    await db.run(
      "UPDATE users SET role = ?, status = ?, balance = ? WHERE id = ?",
      [finalRole, finalStatus, finalBalance, req.params.id]
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
    const purchases = await db.query("SELECT planId, timestamp FROM purchases WHERE userId = ?", [req.params.id]);
    res.json(purchases);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add plan manually
router.post('/users/:id/purchases', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { planId } = req.body;
    // Standardize to underscored plan IDs
    const normalizedPlanId = planId ? planId.replace('-', '_') : planId;
    
    // Delegate to authService which handles both purchase recording AND strategy auto-subscription
    const authService = require('../services/authService');
    await authService.purchasePlan(req.params.id, normalizedPlanId);
    
    res.json({ message: 'Plan granted and strategies subscribed' });
  } catch (e) {
    console.error('[Admin API Error] POST /purchases:', e);
    res.status(500).json({ error: e.message });
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

module.exports = router;
