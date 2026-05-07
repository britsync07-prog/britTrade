const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { protect } = require('../middleware/authMiddleware');

const authService = require('../services/authService');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/google', async (req, res) => {
  const { idToken } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { token, user } = await authService.googleLogin(payload);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({ ...user, name: payload.name, picture: payload.picture });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { email, password, agreedToTerms, riskAccepted } = req.body;
    const user = await authService.signup(email, password, agreedToTerms, riskAccepted);
    res.status(201).json(user);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const { token, user } = await authService.login(req.body.email, req.body.password);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });
    res.json({ token, user });
  } catch (e) { res.status(401).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  res.cookie('token', '', { httpOnly: true, expires: new Date(0) });
  res.json({ message: 'Logged out' });
});

router.get('/me', protect, async (req, res) => {
  try {
    const user = await authService.me(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/balance', protect, async (req, res) => {
  try {
    const result = await authService.updateBalance(req.userId, req.body.balance);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post('/purchase', protect, async (req, res) => {
  try {
    const result = await authService.purchasePlan(req.userId, req.body.planId);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
