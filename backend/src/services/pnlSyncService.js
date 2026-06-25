'use strict';

/**
 * pnlSyncService.js
 * =========================
 * REAL Profit/Loss Fetcher.
 */

const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const liveTradeDb = require('../liveTrading/liveTradeDb');
const { decrypt } = require('../liveTrading/encryptionUtils');
const { normalizeSymbol } = require('../liveTrading/symbolUtils');

class PnlSyncService {
    constructor() {
        this._interval = null;
    }

    async start(intervalMs = 300000) { // Default 5 mins
        console.log('[PnlSyncService] 🔍 Realized PnL sync initialized.');
        
        // Ensure schema columns exist
        await this.ensureSchema();

        // Initial run
        this.runSync().catch(err => console.error('[PnlSyncService] Initial run failed:', err.message));

        this._interval = setInterval(() => {
            this.runSync().catch(err => console.error('[PnlSyncService] Sync cycle failed:', err.message));
        }, intervalMs);
    }

    async ensureSchema() {
        try {
            const cols = await liveTradeDb.all("PRAGMA table_info(live_orders)");
            if (!cols.some(c => c.name === 'real_pnl')) {
                console.log("[PnlSyncService] 🛠️ Adding 'real_pnl' and 'commission' columns to live_orders...");
                await liveTradeDb.run("ALTER TABLE live_orders ADD COLUMN real_pnl REAL");
                await liveTradeDb.run("ALTER TABLE live_orders ADD COLUMN commission REAL");
            }
        } catch (e) {
            console.error('[PnlSyncService] Schema update failed:', e.message);
        }
    }

    async runSync() {
        console.log(`[PnlSyncService] 🔄 Starting Realized PnL sync cycle...`);
        try {
            // Get ALL users who have CLOSED orders missing real_pnl (regardless of enabled status)
            const pendingRows = await liveTradeDb.all(
                "SELECT DISTINCT user_id FROM live_orders WHERE status = 'CLOSED' AND real_pnl IS NULL AND binance_id IS NOT NULL"
            );

            const accounts = [];

            // Admin account
            const adminCfg = await liveTradeDb.getBinanceConfig();
            const hasAdminPending = pendingRows.some(r => r.user_id === null);
            if (adminCfg && hasAdminPending) {
                accounts.push({ userId: 'admin', cfg: adminCfg });
            }

            // User accounts — fetch config for every user with pending PnL (even if disabled)
            for (const row of pendingRows) {
                if (row.user_id === null) continue;
                const userCfg = await liveTradeDb.get(
                    'SELECT * FROM user_binance_config WHERE user_id=?',
                    [row.user_id]
                );
                if (userCfg) {
                    accounts.push({ userId: row.user_id, cfg: userCfg });
                }
            }

            for (const acc of accounts) {
                await this.syncAccountPnl(acc);
            }
        } catch (err) {
            console.error('[PnlSyncService] Global Error:', err.message);
        }
    }

    async syncAccountPnl(acc) {
        const label = `[Account:${acc.userId}]`;
        const apiKey = decrypt(acc.cfg.api_key_enc);
        const apiSecret = decrypt(acc.cfg.api_sec_enc);
        if (!apiKey || !apiSecret) return;

        try {
            const pendingOrders = acc.userId === 'admin'
                ? await liveTradeDb.all("SELECT * FROM live_orders WHERE user_id IS NULL AND status = 'CLOSED' AND real_pnl IS NULL AND binance_id IS NOT NULL LIMIT 20")
                : await liveTradeDb.all("SELECT * FROM live_orders WHERE user_id = ? AND status = 'CLOSED' AND real_pnl IS NULL AND binance_id IS NOT NULL LIMIT 20", [acc.userId]);

            if (pendingOrders.length === 0) return;
            console.log(`${label} Found ${pendingOrders.length} orders missing PnL. Fetching from Binance...`);

            for (const order of pendingOrders) {
                const bSymbol = normalizeSymbol(order.symbol, true);
                const pnlData = await this.fetchBinanceRealizedPnl(apiKey, apiSecret, bSymbol, order.binance_id, acc.cfg.testnet === 1);

                if (pnlData) {
                    console.log(`${label} ✅ Synced PnL for ${order.symbol}: $${pnlData.pnl.toFixed(4)} (fee: $${pnlData.commission.toFixed(4)})`);
                    await liveTradeDb.updateOrder(order.id, { real_pnl: pnlData.pnl, commission: pnlData.commission });
                } else {
                    // If older than 1 hour and still no PnL data, mark as $0 to stop retrying
                    const ageSec = (Date.now() - new Date(order.updated_at + ' UTC').getTime()) / 1000;
                    if (ageSec > 3600) {
                        console.log(`${label} ⚠️ No PnL data after 1hr for order ${order.binance_id} (${order.symbol}). Marking as 0.`);
                        await liveTradeDb.updateOrder(order.id, { real_pnl: 0, commission: 0 });
                    }
                }
            }
        } catch (e) {
            console.error(`${label} PnL sync failed: ${e.message}`);
        }
    }

    async fetchBinanceRealizedPnl(apiKey, apiSecret, symbol, binanceOrderId, isTestnet) {
        // Try multiple environments for testnet
        const urls = isTestnet
            ? [
                'https://testnet.binancefuture.com/fapi/v1',
                'https://demo-fapi.binance.com/fapi/v1',
              ]
            : ['https://fapi.binance.com/fapi/v1'];

        const cleanOrderId = String(binanceOrderId).split('.')[0];

        for (const baseUrl of urls) {
            try {
                // First try: get server time for accurate timestamp
                let timestamp = Date.now();
                try {
                    const timeRes = await axios.get(`${baseUrl}/time`, { timeout: 10000 });
                    timestamp = timeRes.data.serverTime;
                } catch (_) {}

                const query = `symbol=${symbol}&orderId=${cleanOrderId}&limit=100&timestamp=${timestamp}&recvWindow=10000`;
                const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');

                const res = await axios.get(`${baseUrl}/userTrades?${query}&signature=${signature}`, {
                    headers: { 'X-MBX-APIKEY': apiKey },
                    timeout: 15000
                });

                if (Array.isArray(res.data) && res.data.length > 0) {
                    let totalPnl = 0, totalComm = 0;
                    for (const t of res.data) {
                        totalPnl += parseFloat(t.realizedPnl || 0);
                        totalComm += parseFloat(t.commission || 0);
                    }
                    return { pnl: totalPnl, commission: totalComm };
                }
            } catch (e) {
                // Try next URL silently
            }
        }
        return null;
    }
}

module.exports = new PnlSyncService();
