# BritTrade AI

AI-powered crypto trading signals and automated futures trading platform.

## Prerequisites

- **Node.js** >= 18
- **npm**
- **Android Studio** (only for APK build)

---

## Quick Start

### 1. Backend

```bash
cd backend
npm install
```

Check/update `.env` (JWT_SECRET, GOOGLE_CLIENT_ID, etc.)

```bash
npm run dev    # Development with nodemon
# OR
npm start      # Production
```

Server starts at `http://localhost:7286`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at `http://localhost:5173`

Default API points to production; for local dev update `frontend/.env`:
```
VITE_API_URL=http://localhost:7286
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Admin User

### Existing default admin
- Email: `mehedy303@gmail.com`
- Password: (hashed in DB — use the create script to set a new one)

### Create a new admin user

```bash
cd backend
node create_admin.js <email> <password>
# Example:
node create_admin.js admin@example.com MySecurePass123
```

### Login
1. Open `http://localhost:5173/login`
2. Enter email + password
3. Navigate to `/admin` for the admin dashboard

---

## Building APK (Android)

```bash
cd frontend
npm run build         # Build the web app
npx cap sync android  # Sync web build to Capacitor
npx cap open android  # Open in Android Studio
```

In Android Studio:
1. Wait for Gradle sync
2. Click **Build > Build Bundle(s) / APK(s) > Build APK(s)**
3. Find the APK at `android/app/build/outputs/apk/debug/`

---

## Responsive Design

The app is fully responsive with mobile-first design using Tailwind CSS v4. It works on:
- Mobile phones (320px+)
- Tablets (768px+)
- Desktops (1024px+)

Key responsive features:
- Collapsible nav elements on mobile
- Stacked grids on small screens
- Touch-friendly buttons and inputs
- Horizontally scrollable tables on mobile
- Adaptive orbital timeline
- PWA-ready for mobile install

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Framer Motion
- **Backend**: Node.js, Express 5, SQLite (better-sqlite3), JWT, Stripe
- **Trading**: Binance API (CCXT), Technical Indicators
- **Mobile**: Capacitor (Android APK), PWA
