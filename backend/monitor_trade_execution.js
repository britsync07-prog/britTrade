'use strict';

/**
 * monitor_trade_execution.js
 * Standalone script to verify if TP/SL hits are correctly triggering Binance orders.
 * Run with: node monitor_trade_execution.js
 */

const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');

// Paths to databases (Active databases are in the backend folder)
// The user clarified that root DBs are testing data and backend DBs are production.
const PLATFORM_DB_PATH = path.join(__dirname, 'platform.db');
const LIVE_TRADING_DB_PATH = path.join(__dirname, 'live_trading.db');
const MAIN_TRADING_DB_PATH = path.join(__dirname, 'trading.db'); // Main platform DB as per user

// Helper to open DB and query
function query(dbPath, sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) return reject(err);
        });
        db.all(sql, params, (err, rows) => {
            db.close();
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function getBinancePrice(symbol) {
    const bSymbol = symbol.replace('/', '').toUpperCase();
    try {
        const res = await axios.get(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${bSymbol}`, { timeout: 5000 });
        return parseFloat(res.data.price);
    } catch (e) {
        return null;
    }
}

async function monitor() {
    console.log(`\n================================================================`);
    console.log(`[Monitor] Starting Execution Monitor at ${new Date().toLocaleString()}`);
    console.log(`[Monitor] Goal: Confirm TP/SL hits trigger Binance orders.`);
    console.log(`================================================================\n`);

    const processedSignals = new Set();

    while (true) {
        try {
            // 1. Fetch active signals to check for "Ghost" potential
            const activeSignals = await query(PLATFORM_DB_PATH, "SELECT * FROM signals WHERE status = 'active'");
            
            for (const sig of activeSignals) {
                const currentPrice = await getBinancePrice(sig.symbol);
                if (!currentPrice) continue;

                let targetHit = false;
                let targetType = '';
                if (sig.side === 'buy' || sig.side === 'long') {
                    if (currentPrice >= sig.tp) { targetHit = true; targetType = 'TP'; }
                    else if (currentPrice <= sig.sl) { targetHit = true; targetType = 'SL'; }
                } else {
                    if (currentPrice <= sig.tp) { targetHit = true; targetType = 'TP'; }
                    else if (currentPrice >= sig.sl) { targetHit = true; targetType = 'SL'; }
                }

                if (targetHit) {
                    console.warn(`[ALERT] ${sig.symbol} (${sig.side}) reached ${targetType} at ${currentPrice} (Target: ${targetType === 'TP' ? sig.tp : sig.sl}) but status is still ACTIVE in DB.`);
                }
            }

            // 2. Fetch all signals that have HIT TP/SL to verify they have orders
            const hits = await query(PLATFORM_DB_PATH, "SELECT * FROM signals WHERE status IN ('tp_hit', 'sl_hit') ORDER BY id DESC LIMIT 20");

            for (const hit of hits) {
                if (processedSignals.has(hit.id)) continue;

                const liveOrders = await query(LIVE_TRADING_DB_PATH, "SELECT * FROM live_orders WHERE signal_id = ?", [hit.id]);
                
                // An exit order should have the opposite side of the entry signal
                const exitOrder = liveOrders.find(o => 
                    (hit.side === 'buy' || hit.side === 'long') ? o.side === 'sell' : o.side === 'buy'
                );

                if (exitOrder) {
                    console.log(`[SUCCESS] Signal ${hit.id} (${hit.symbol} ${hit.status.toUpperCase()}) -> Executed on Binance: Order ${exitOrder.binance_id} (Price: ${exitOrder.avg_fill_price})`);
                    processedSignals.add(hit.id);
                } else {
                    // Check if the signal is very old. If it's recent (last few mins), it might be a failure.
                    // Since we don't have updated_at, we'll just flag it if it's in the last 20 signals and has no exit order.
                    console.error(`[CRITICAL] Signal ${hit.id} (${hit.symbol} ${hit.status.toUpperCase()}) HIT but HAS NO BINANCE EXIT ORDER.`);
                }
            }

            if (activeSignals.length === 0 && hits.length === 0) {
                 process.stdout.write('.');
            }

        } catch (err) {
            console.error(`[Monitor Error] ${err.message}`);
        }

        await new Promise(resolve => setTimeout(resolve, 15000)); // Check every 15 seconds
    }
}

monitor();
