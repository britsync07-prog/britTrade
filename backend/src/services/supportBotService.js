const TelegramBot = require('node-telegram-bot-api');
const db = require('../db');

const token = process.env.SUPPORT_BOT_TOKEN;
let bot;

if (token && token !== 'your_support_bot_token_here') {
  bot = new TelegramBot(token, { polling: true });

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const telegramId = msg.chat.id.toString();
    const { first_name, last_name, username } = msg.from;

    try {
      // Upsert chat
      await db.run(
        `INSERT INTO support_chats (telegramId, firstName, lastName, username, lastMessageAt)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(telegramId) DO UPDATE SET
         firstName = excluded.firstName,
         lastName = excluded.lastName,
         username = excluded.username,
         lastMessageAt = CURRENT_TIMESTAMP`,
        [telegramId, first_name, last_name, username]
      );

      // Insert message
      await db.run(
        `INSERT INTO support_messages (chatId, sender, text) VALUES (?, 'user', ?)`,
        [telegramId, msg.text]
      );

      console.log(`[SupportBot] Message from ${username || telegramId}: ${msg.text}`);
    } catch (err) {
      console.error('[SupportBot] Error handling message:', err);
    }
  });

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 
      "👋 Hello! This is the BritSyncAI Support Bot.\n\n" +
      "Send us a message here and our team will get back to you shortly."
    );
  });

  console.log('[SupportBot] Initialized and polling.');
} else {
  console.log('[SupportBot] SUPPORT_BOT_TOKEN missing. Support bot disabled.');
}

class SupportBotService {
  async sendMessage(telegramId, text) {
    if (!bot) throw new Error('Support bot not initialized');
    
    await bot.sendMessage(telegramId, text);
    
    // Log admin message
    await db.run(
      `INSERT INTO support_messages (chatId, sender, text) VALUES (?, 'admin', ?)`,
      [telegramId.toString(), text]
    );
    
    // Update lastMessageAt
    await db.run(
      `UPDATE support_chats SET lastMessageAt = CURRENT_TIMESTAMP WHERE telegramId = ?`,
      [telegramId.toString()]
    );
  }
}

module.exports = new SupportBotService();
