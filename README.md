# BritTrade AI
> AI-driven crypto signal engine with automated Binance futures execution, paper-to-live parity, and an Android app.

BritTrade is a full-stack crypto trading platform: a React/Vite web app and Express API that generate AI-assisted trading signals, run strategy engines (paper and live), execute real orders on Binance futures via CCXT, and broadcast entries, DCA events, and exits to Telegram. It includes Stripe billing hooks, Google OAuth sign-in, an admin dashboard with live-trading controls and PnL sync, biometric (fingerprint) signup through a companion auth stack, and Capacitor packaging for Android.

## Overview

The backend is organized around a signal pipeline. A `signalEngine` evaluates strategies (notably `GridMeanReversion`) on market data enriched with technical indicators, emits signals to listeners, and persists paper trades. A `liveTradeOrchestrator` gates those signals into real Binance limit/market orders with a global per-symbol lock, allocated-capital enforcement, stale-order auto-cancellation, and explicit Dollar Cost Averaging (DCA) support. Supporting services keep paper and live results aligned (`parityEnforcer`), sync realized PnL back to the dashboard (`pnlSyncService` + `/sync-pnl`), guard accumulated profit (`profitGuard`), and encrypt user Binance API keys at rest with AES-256.

## Features

- Strategy engines with technical indicators; GridMeanReversion averages down (DCA) below -5% PnL up to 10 times
- Live trading orchestration: duplicate-position lock, `isDCA` bypass flag, allocated-capital safety net, 5-minute stale-limit-order auto-cancel
- Paper trading service plus a parity enforcer so simulated and live behavior match
- Telegram signal broadcasts with distinct "NEW SIGNAL" and "DCA ENTRY (Averaging Down)" messages
- Encrypted storage of user Binance API keys (AES-256-GCM via `LIVE_TRADE_ENCRYPTION_KEY`)
- Google OAuth authentication, JWT sessions, and admin role gating
- Stripe payment routes for subscriptions
- Admin dashboard: live-trading panel with force-IPv4 connectivity checks, support chat inbox, PnL sync endpoint, strategy detail pages
- Fingerprint signup subsystem: Spring Boot fingerprint-auth server, Kotlin `instantauth-sdk` (BiometricHelper, secure storage), and an Android Capacitor bridge
- Mobile-first responsive UI (Tailwind v4) with orbital timeline visuals, TradingView charts, performance ticker, PWA manifest/service worker, and Android APK builds
- Python research scripts for strategy prototyping (`GridMeanReversion.py`, `TrendFollower.py`, `UltimateFuturesScalper.py`, `place_trades.py`)

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion, Chart.js, React Router 7 |
| Backend | Node.js, Express 5, SQLite (`sqlite3` driver), Morgan logging |
| Exchange | Binance Futures via CCXT + `technicalindicators` |
| Auth | Google OAuth (`google-auth-library`, `@react-oauth/google`), JWT, bcryptjs |
| Payments | Stripe SDK and webhook test script |
| Notifications | `node-telegram-bot-api` signal broadcasts, support bot |
| Mobile | Capacitor 8 (Android), PWA (manifest + service worker), Netlify hosting config |
| Biometrics | Spring Boot fingerprint-auth server (Java/Maven/Docker), Kotlin instant-auth SDK |
| Research | Python strategy prototypes |

## Architecture

Signal flow: `signalEngine.js` detects setups and fires listener callbacks -> `liveTradeOrchestrator.js` applies the global lock and capital checks -> `binanceExecutor.js` places orders on Binance -> `liveTradeDb.js` records fills in a dedicated live-trading SQLite database -> `telegramService.js` notifies subscribers. Exits are tracked by the orchestrator's order watcher using stored `signal_id`s, which also lets the PnL sync service reconcile closed trades with the platform database.

Data is split across `platform.db` (users, strategies, paper trades, payments) and `live_trading.db` (live orders and executions). The frontend consumes a REST API at `VITE_API_BASE_URL` (default port 7286) and ships as both a web app and an Android package.

## Project Structure

```text
britTrade/
├── backend/
│   ├── src/
│   │   ├── app.js                  # Express entry point (:7286)
│   │   ├── db.js                   # Platform SQLite setup
│   │   ├── routes/                 # auth, admin (+sync-pnl), payments,
│   │   │                           # support, liveTradingAdminRoutes
│   │   ├── middleware/             # JWT/auth guards
│   │   ├── services/
│   │   │   ├── signalEngine.js     # Strategies + DCA math + listeners
│   │   │   ├── paperTradeService.js
│   │   │   ├── parityEnforcer.js   # Paper/live parity checks
│   │   │   ├── pnlSyncService.js   # Realized-PnL reconciliation
│   │   │   ├── profitGuard.js      # Profit protection rules
│   │   │   ├── telegramService.js  # Entry vs DCA message formatting
│   │   │   ├── supportBotService.js
│   │   │   └── authService.js      # Google OAuth / JWT issue
│   │   └── liveTrading/
│   │       ├── liveTradeOrchestrator.js  # Locks, capital gate, order watcher
│   │       ├── binanceExecutor.js        # CCXT order placement
│   │       ├── encryptionUtils.js        # AES-256 key encryption
│   │       ├── liveTradeDb.js            # Separate live DB handle
│   │       └── symbolUtils.js
│   ├── create_admin.js             # Admin bootstrap script
│   ├── config_*.json               # Scalping/trend strategy configs
│   └── .env.example                # Documented environment template
├── frontend/
│   ├── src/pages/                  # Dashboard, login, strategy detail,
│   │                               # UserLiveTrading, AdminDashboard
│   ├── src/components/             # LiveTradingPanel, SupportChat,
│   │                               # SignalBroadcast, TradingViewChart
│   ├── android/                    # Capacitor project + FingerprintBridge
│   └── .env.example                # VITE_* variables
├── finger print sighup/
│   ├── fingerprint-auth-server/    # Spring Boot biometric credential server
│   └── instantauth-sdk/            # Kotlin SDK (biometric, secure storage)
├── DCA_PIPELINE_CONTEXT.txt        # DCA architecture notes
├── verification_context.txt        # Trade-verification findings
└── README.md
```

## Getting Started

### Prerequisites

- Node.js >= 18 and npm
- Android Studio (only for building the APK)
- A Binance account with API keys for live trading (optional; paper mode works without)
- Stripe and Google OAuth credentials for billing/social login features

### Installation

```bash
cd backend && npm install
cd ../frontend && npm install
```

Create an admin user:

```bash
cd backend
node create_admin.js admin@example.com YourSecurePass123
```

### Environment Variables

Backend `backend/.env` (see `backend/.env.example`; names only — never commit real values):

| Name | Purpose | Example Placeholder |
|---|---|---|
| NODE_ENV | Runtime mode | `development` |
| PORT | API listen port | `7286` |
| JWT_SECRET | Session token signing key (32+ chars) | `your_random_jwt_secret_key_at_least_32_chars` |
| GOOGLE_CLIENT_ID | Google OAuth client id | `your_google_client_id.apps.googleusercontent.com` |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret | `your_google_client_secret` |
| LIVE_TRADE_ENCRYPTION_KEY | 32-byte AES key encrypting stored Binance API keys | `your_64_char_hex_string_here` |

Frontend `frontend/.env` (see `frontend/.env.example`; the README also references Stripe variables):

| Name | Purpose | Example Placeholder |
|---|---|---|
| VITE_API_BASE_URL | Backend API base URL | `http://localhost:7286` |
| VITE_GOOGLE_CLIENT_ID | Google OAuth client id (must match backend) | `your_google_client_id.apps.googleusercontent.com` |
| VITE_API_URL | Alternate API base referenced in README | `http://localhost:7286` |
| VITE_STRIPE_PUBLISHABLE_KEY | Stripe publishable key for checkout | `pk_test_...` |

### Running

```bash
# Backend
cd backend
npm run dev          # nodemon development server on :7286
# or
npm start            # production start

# Frontend
cd frontend
npm run dev          # Vite dev server on :5173

# Android APK
cd frontend
npm run build
npx cap sync android
npx cap open android # Build APK from Android Studio
```

Log in at `http://localhost:5173/login`, then open `/admin` for the admin dashboard.

## Challenges Faced & Solutions

- **Race condition in the live-trade capital check** — concurrent signals could pass the affordability check simultaneously and overspend a strategy's allocation. **Solution:** dedicated fix commit `fix: prevent race condition in capital check for live trades` made the check-and-reserve atomic in the orchestrator.
- **Silent DCA math diverged from live execution** — the engine averaged down on paper while Binance never saw follow-up buys. **Solution:** an explicit DCA pipeline (documented in `DCA_PIPELINE_CONTEXT.txt`) threads `isDCA: true` from `signalEngine` through the orchestrator — bypassing the duplicate-position lock but still enforcing the allocated-capital limit — and fires a distinct Telegram `formatDCAMessage` so users understand the averaging-down buy.
- **Ghost trades stranded on Binance** — the TP/SL tracker closed trades in the database without notifying the orchestrator, leaving positions open (documented in `verification_context.txt`). **Solution:** fixed `result.lastID` to `result.id` so `live_orders.signal_id` populates, switched exit logic to close precisely by `signal_id`, and added automatic cancellation of stale limit orders after five minutes.
- **Binance connectivity failures from IPv6/keep-alive issues** — requests intermittently stalled or failed. **Solution:** forced IPv4 for all Binance API calls and enabled connection keep-alive (`feat: force IPv4 ... and enable connection keep-alive`).
- **Orders below Binance minimum notional were rejected** — small allocations produced invalid order sizes. **Solution:** round order quantity up when it falls below the exchange minimum notional (`fix: round up order quantity if below minimum notional`).
- **Fingerprint-signup users could not log in** — credentials were only saved on a custom path, and the `fingerprint_user` flag was lost between sessions. **Solution:** recover fingerprint users via email pattern and always set/persist the flag (`df8def6`, `3724b2c`), save random credentials during signup so login always works (`2659cf9`), and expose an `/auth/credentials` endpoint for later custom saves.
- **Dev-mode caching and CORS breakage across ports** — the service worker cached dev assets and the Vite alternate port (5174) was blocked. **Solution:** register the service worker only in production (`25e5493`) and add dynamic CORS origins including `localhost:5174` with a dynamic error-handler origin (`44fb8b1`).
- **Admin PnL reconciliation silently failed** — the frontend called a route the backend had never registered. **Solution:** added the missing `POST /sync-pnl` admin route backing `pnlSyncService` (`162fa51`).

## Known Limitations & Roadmap

- No automated backend test suite yet (`npm test` is a placeholder); the verification workflow relies on manual trade review notes.
- `verification_context.txt` tracks remaining work: wiring `_fireSignalListeners` inside `startSignalTracker` so TP/SL hits always trigger real executions, and strict per-strategy config standardization.
- DCA currently exists only in Strategy 1 (GridMeanReversion); extending it requires following the documented three-step pipeline.
- The committed `frontend_next_backup/` directory contains a stale Next.js prototype and should be pruned.
- iOS target and multi-exchange support are natural next steps given the executor abstraction.

## Security Notes

Observed practices: bcrypt password hashing, JWT sessions, admin-gated routes, Google OAuth, AES-256 encryption of user Binance API keys at rest with a dedicated key env var, and `.env.example` templates that document variable names without values.

Hygiene warnings (filenames only):

- `live_trading.db` — live trading database committed at repo root.
- `platform.db` — platform database committed at repo root.
- `backend/database.sqlite` — additional SQLite database committed.
- `backend/platform.db.bak_20260416_195949` and `backend/platform.db.corrupt_1776369378` — database backup/corrupt copies committed.
- `trade-out.log` — trading output log committed.
- `Binance-Futures-Trade-History-202606181441(UTC+6)-part1-of1.csv` — exported Binance trade history (personal financial data) committed.
- `frontend/.env` — environment file committed alongside its `.env.example`.
- No `LICENSE` file currently exists in the repository.

Remove these files, ignore them via `.gitignore`, and purge history before publishing.

## License

MIT License — Copyright (c) 2026 Musfiqur Rahman Saimon. See [LICENSE](./LICENSE).
