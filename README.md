# BritTrade: AI Signal & Paper Trading Engine

BritTrade is a professional-grade cryptocurrency signal intelligence and automated paper-trading simulation ecosystem. It constantly feeds real-time market data through proprietary technical algorithms to generate high-probability trade setups across Spot and Futures markets.

## What It Does
1. **Automated Market Scanning:** Continuously scans the Binance market for exact setups utilizing RSI, ADX, SuperTrend, ATR, and Bollinger Bands.
2. **Paper Trading Simulator:** Simulates an isolated `$100` daily budget per strategy to evaluate live performance without exposing genuine capital. Trades are virtually placed, tracked, and closed—with fees and leverages mapped to realistic PnL.
3. **Signal Broadcasts:** Streams executed signals directly into an authenticated dashboard and broadcasts them to subscribed users via an integrated Telegram Bot.
4. **Subscription Management:** Features an embedded tiered payment and access system, allowing users to unlock access to specific Risk Tier strategies via Stripe. 

## How It Works (The Engine)
- **Signal Engine (`backend/src/services/signalEngine.js`):** Polls 1-minute OHLC market data from Binance every 30 seconds for all whitelisted assets. It runs the algorithmic logic per-strategy. If a trigger is struck, a `buy`/`sell`/`short`/`cover` signal is recorded. It also manages Take Profit (TP), Stop Loss (SL), and dynamic Trailing Stops.
- **Paper Trader (`backend/src/services/paperTradeService.js`):** Intercepts live signals and deducts a strict `$10.0` margin from the daily simulated budget. It calculates isolated entry prices, position sizing, and a 0.1% transaction fee, then feeds net-profit back into the budget queue upon trade closure.
- **Frontend Core:** A React & Vite powered Cyber-Dark dashboard mapping real-time data, TradingView Chart structures, and historical performance breakdowns for users.

## Built-In Strategies

### 1. GridMeanReversion (Low Risk)
- **Type:** Spot Trading
- **Logic:** Identifies oversold assets moving horizontally. Triggers when the price drops below the Lower Bollinger Band and RSI dips under 20 on expanding volume. Aims for a quick 1% bounce while employing a strict 15% stop reduction or martingale averaging if trailing occurs.
- **Market:** Choppy/Sideways

### 2. TrendFollower (Medium Risk)
- **Type:** Spot Trading
- **Logic:** Waits for explosive trending volume. Validated by ADX momentum (ADX > 25) converging with a SuperTrend breakout and a breach above the Upper Bollinger Band. Implements aggressive trailing stop execution (dynamically locking at 2% under the rolling highest tracking price).
- **Market:** Clean Bull/Bear Trends

### 3. UltimateFuturesScalper (High Risk)
- **Type:** Futures (5x Simulated Leverage)
- **Logic:** An aggressive high-frequency velocity engine. Opens `Longs` on extreme weakness (RSI < 30) and `Shorts` on overextended euphoria (RSI > 70). Seeks micro-scalp limits (0.5% targets) rapidly amplified by the 5x cross-margin architecture. 
- **Market:** High Volatility

## Tech Stack Summary
- **Frontend:** React, HTML DOM, TailwindCSS (Shadcn/ui), Lucide-React
- **Backend:** Node.js (Express), SQLite3 (SQLite Local Storage for strict I/O limits) 
- **Integrations:** Binance REST API, TechnicalIndicators.js, Stripe, Telegram Bot API
