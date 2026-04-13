const TelegramBot = require('node-telegram-bot-api');
const db = require('../db');

const authService = require('./authService');

const token = process.env.TELEGRAM_TOKEN;
let bot;

if (token && token !== 'your_telegram_bot_token_here') {
  bot = new TelegramBot(token, { polling: true });
  console.log('Telegram Bot initialized.');

  // Handle bot logic
  const sessions = {}; // tracks login state per user

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Welcome to Ultimate Trading Bot! 🚀\n\nPlease provide your account email to log in:");
    sessions[chatId] = { step: 'email' };
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const session = sessions[chatId];

    if (!session || !text || text.startsWith('/')) return;

    if (session.step === 'email') {
      session.email = text.trim();
      session.step = 'password';
      bot.sendMessage(chatId, "Great! Now enter your password:");
    } 
    else if (session.step === 'password') {
      try {
        const { user } = await authService.login(session.email, text);
        await db.run("UPDATE users SET telegramId = ? WHERE id = ?", [chatId.toString(), user.id]);
        
        bot.sendMessage(chatId, `✅ Success! You are now logged in as *${user.email}*.\n\nYou will receive real-time trading signals for all strategies you've subscribed to on the dashboard.`, { parse_mode: 'Markdown' });
        delete sessions[chatId];
      } catch (e) {
        bot.sendMessage(chatId, `❌ Login failed: ${e.message}\n\nPlease try /start again.`);
        delete sessions[chatId];
      }
    }
  });

  bot.onText(/\/logout/, async (msg) => {
    await db.run("UPDATE users SET telegramId = NULL WHERE telegramId = ?", [msg.chat.id.toString()]);
    bot.sendMessage(msg.chat.id, "👋 You have been logged out from Telegram alerts.");
  });

} else {
  console.log('TELEGRAM_TOKEN missing or not configured in .env. Bot features disabled.');
}

class TelegramService {
  async connect(userId, telegramId) {
    if (!telegramId) throw new Error('telegramId is required');
    return await db.run("UPDATE users SET telegramId = ? WHERE id = ?", [telegramId.toString(), userId]);
  }

  async sendDirectNotification(telegramId, message) {
    if (!bot || !telegramId) return;
    bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' }).catch(console.error);
  }

  async notifyTradeClosed(telegramId, strategyName, symbol, side, price, pnl) {
    if (!bot || !telegramId) return;
    const message = `✅ *TRADE CLOSED* [${strategyName}]\n*Symbol:* ${symbol}\n*Exit Side:* ${side.toUpperCase()}\n*Exit Price:* ${price.toFixed(4)}\n*PnL:* ${pnl >= 0 ? '🟢 +' : '🔴 '}$${pnl.toFixed(4)}`;
    bot.sendMessage(telegramId, message, { parse_mode: 'Markdown' }).catch(console.error);
  }

  async disconnect(userId) {
    return await db.run("UPDATE users SET telegramId = NULL WHERE id = ?", [userId]);
  }

  async broadcastSignal(signal) {
    if (!bot) return;

    const { strategyId, symbol, side, price } = signal;

    const strategy = await db.get("SELECT name FROM strategies WHERE id = ?", [strategyId]);
    if (!strategy) return;

    const users = await db.query(
      "SELECT DISTINCT telegramId FROM users u JOIN subscriptions s ON u.id = s.userId WHERE s.strategyId = ? AND u.telegramId IS NOT NULL",
      [strategyId]
    );

    const message = signal.pnl !== undefined
      ? `✅ *TRADE CLOSED* [${strategy.name}]\n*Symbol:* ${symbol}\n*Exit Side:* ${side.toUpperCase()}\n*Exit Price:* ${price.toFixed(4)}\n*PnL:* ${signal.pnl >= 0 ? '🟢 +' : '🔴 '}$${signal.pnl.toFixed(4)}`
      : `🔔 *SIGNAL* [${strategy.name}]\n*Symbol:* ${symbol}\n*Side:* ${side.toUpperCase()}\n*Price:* ${price.toFixed(4)}`;

    for (const user of users) {
      bot.sendMessage(user.telegramId, message, { parse_mode: 'Markdown' }).catch(console.error);
    }
  }
}

module.exports = new TelegramService();
