const express = require('express');
const router = express.Router();
const db = require('../db');
const supportBotService = require('../services/supportBotService');

// Middleware to ensure admin access
const adminMiddleware = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'Administrative access required' });
  }
  next();
};

router.use(adminMiddleware);

// Get all support chats
router.get('/chats', async (req, res) => {
  try {
    const chats = await db.query(
      `SELECT * FROM support_chats ORDER BY lastMessageAt DESC`
    );
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a specific chat
router.get('/chats/:chatId/messages', async (req, res) => {
  try {
    const messages = await db.query(
      `SELECT * FROM support_messages WHERE chatId = ? ORDER BY timestamp ASC`,
      [req.params.chatId]
    );
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a message to a user
router.post('/chats/:chatId/messages', async (req, res) => {
  const { text } = req.body;
  const { chatId } = req.params;

  if (!text) {
    return res.status(400).json({ error: 'Message text is required' });
  }

  try {
    await supportBotService.sendMessage(chatId, text);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
