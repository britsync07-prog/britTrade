'use strict';

/**
 * parityEnforcer.js
 * =========================
 * The "Bullet Proof" Parity Guardian.
 * 
 * Objective: 
 * Ensures that Binance (Exchange) NEVER has a trade or order that our Platform (Database) 
 * doesn't know about or thinks is closed.
 */

const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const liveTradeDb = require('../liveTrading/liveTradeDb');
const { BinanceExecutor } = require('../liveTrading/binanceExecutor');
const { decrypt } = require('../liveTrading/encryptionUtils');
const { normalizeSymbol } = require('../liveTrading/symbolUtils');

const GRACE_PERIOD_SECONDS = 90; 

class ParityEnforcer {
    constructor() {
        this._interval = null;
    }

    async start(intervalMs = 60000) {
        console.log('[ParityEnforcer] 🛡️ Service initialized. Syncing every', intervalMs / 1000, 'seconds.');
        
        // Initial run
        this.runEnforcement().catch(err => console.error('[ParityEnforcer] Initial run failed:', err.message));

        this._interval = setInterval(() => {
            this.runEnforcement().catch(err => console.error('[ParityEnforcer] Sync cycle failed:', err.message));
        }, intervalMs);
    }

    async runEnforcement() {
        console.log(`[ParityEnforcer] 🛡️ Starting global parity check: ${new Date().toISOString()}`);
        
        try {
            // 1. Get all active Binance configurations
            const adminCfg = await liveTradeDb.getBinanceConfig();
            const userCfgs = await liveTradeDb.getEnabledUserBinanceConfigs();

            const accounts = [];
            if (adminCfg && adminCfg.enabled === 1) {
                accounts.push({ userId: 'admin', cfg: adminCfg });
            }
            for (const u of userCfgs) {
                accounts.push({ userId: u.user_id, cfg: u });
            }

            for (const acc of accounts) {
                await this.enforceAccountParity(acc);
            }

        } catch (err) {
            console.error('[ParityEnforcer] Global Error:', err.message);
        }
    }

    async enforceAccountParity(acc) {
        const label = `[Account:${acc.userId}]`;
        const apiKey = decrypt(acc.cfg.api_key_enc);
        const apiSecret = decrypt(acc.cfg.api_sec_enc);

        if (!apiKey || !apiSecret) return;

        const executor = new BinanceExecutor();
        await executor.init(apiKey, apiSecret, acc.cfg.testnet === 1);

        try {
            // A. Get Data from Exchange
            const binancePositions = await executor.getPositions();
            const binanceOrdersRes = await this.fetchOpenOrders(executor);

            if (binancePositions.error) throw new Error(binancePositions.error);

            // B. Get Data from Platform DB
            const activeSignals = await db.query("SELECT * FROM signals WHERE status = 'active'");
            
            const activeOrders = acc.userId === 'admin' 
                ? await liveTradeDb.all("SELECT * FROM live_orders WHERE user_id IS NULL AND UPPER(status) IN ('OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED')")
                : await liveTradeDb.all("SELECT * FROM live_orders WHERE user_id = ? AND UPPER(status) IN ('OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED')", [acc.userId]);

            const activeSymbols = new Set([
                ...activeSignals.map(s => normalizeSymbol(s.symbol, true)),
                ...activeOrders.map(o => normalizeSymbol(o.symbol, true))
            ]);

            // --- 1. Reconcile Positions ---
            for (const pos of binancePositions) {
                const amount = Math.abs(parseFloat(pos.positionAmt));
                if (amount === 0) continue;

                const bSymbol = normalizeSymbol(pos.symbol, true);
                if (!activeSymbols.has(bSymbol)) {
                    const ageSeconds = (Date.now() - parseInt(pos.updateTime)) / 1000;
                    
                    if (ageSeconds > GRACE_PERIOD_SECONDS) {
                        // PRE-FLIGHT CHECK: Re-verify against DB state
                        // We fetch all active signals again and normalize them for a precise match
                        const latestSignals = await db.query("SELECT symbol, side FROM signals WHERE status = 'active'");
                        const latestOrders = await liveTradeDb.all("SELECT symbol, side FROM live_orders WHERE UPPER(status) IN ('OPEN', 'FILLED', 'NEW', 'PARTIALLY_FILLED')");

                        const sideOnBinance = parseFloat(pos.positionAmt) > 0 ? 'long' : 'short';
                        
                        // Check if ANY active signal or order matches both Symbol AND Side
                        const isValidSignal = latestSignals.some(s => 
                            normalizeSymbol(s.symbol, true) === bSymbol && 
                            (s.side === sideOnBinance || (s.side === 'buy' && sideOnBinance === 'long') || (s.side === 'sell' && sideOnBinance === 'short'))
                        );
                        const isValidOrder = latestOrders.some(o => 
                            normalizeSymbol(o.symbol, true) === bSymbol && 
                            (o.side === sideOnBinance || (o.side === 'buy' && sideOnBinance === 'long') || (o.side === 'sell' && sideOnBinance === 'short'))
                        );

                        if (isValidSignal || isValidOrder) {
                            console.log(`${label} 🛡️ ABORT CLOSE: Legitimate signal/order found for ${pos.symbol} [${sideOnBinance}] in pre-flight check.`);
                            continue;
                        }

                        console.log(`${label} 🚨 ORPHANED POSITION: ${pos.symbol} (${pos.positionAmt}) | Age: ${ageSeconds.toFixed(0)}s`);
                        console.log(`${label} 🛡️ No matching Signal or Order found in DB for this side. Closing position...`);
                        
                        const sideToClose = sideOnBinance === 'long' ? 'sell' : 'buy';
                        const res = await executor.placeOrder(pos.symbol, sideToClose, 0, 'market', null, 3, 1, amount, true);
                        
                        if (res.error) console.error(`${label} ❌ Close failed: ${res.error}`);
                        else console.log(`${label} ✅ Closed orphaned position.`);
                    }
                }
            }

            // --- 2. Reconcile Limit Orders ---
            for (const order of binanceOrdersRes) {
                const clientOid = order.clientOrderId;
                const dbOrder = activeOrders.find(o => o.client_oid === clientOid || String(o.binance_id) === String(order.orderId));
                
                if (!dbOrder) {
                    const ageSeconds = (Date.now() - parseInt(order.time)) / 1000;
                    if (ageSeconds > GRACE_PERIOD_SECONDS) {
                        // PRE-FLIGHT CHECK:
                        const lastMinuteOrder = await liveTradeDb.all("SELECT id FROM live_orders WHERE client_oid = ? OR binance_id = ?", [clientOid, String(order.orderId)]);
                        if (lastMinuteOrder.length > 0) {
                            console.log(`${label} 🛡️ ABORT CANCEL: Order ${clientOid} was found in a last-second check.`);
                            continue;
                        }

                        console.log(`${label} 🚨 ORPHANED LIMIT ORDER: ${order.symbol} ${order.side} | Age: ${ageSeconds.toFixed(0)}s`);
                        console.log(`${label} 🛡️ Cancelling order...`);
                        
                        const res = await executor.cancelOrder(order.symbol, clientOid, 3);
                        if (!res.success) console.error(`${label} ❌ Cancel failed: ${res.message}`);
                        else console.log(`${label} ✅ Cancelled orphaned order.`);
                    }
                }
            }

        } catch (e) {
            console.error(`${label} Parity check failed: ${e.message}`);
        }
    }

    async fetchOpenOrders(executor) {
        const envs = executor._getEnvs(true);
        for (const env of envs) {
            try {
                const timestamp = Date.now();
                const query = `timestamp=${timestamp}&recvWindow=10000`;
                const signature = crypto.createHmac('sha256', executor._apiSecret).update(query).digest('hex');
                const res = await axios.get(`${env.url}/v1/openOrders?${query}&signature=${signature}`, {
                    headers: { 'X-MBX-APIKEY': executor._apiKey },
                    timeout: 10000
                });
                if (Array.isArray(res.data)) return res.data;
            } catch (e) { continue; }
        }
        return [];
    }
}

module.exports = new ParityEnforcer();
