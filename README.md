# 💸 Renewly — Subscription Tracker

Every subscription. One quiet place.

Renewly finds the recurring charges hiding in your bank transactions and your inbox, tracks what they cost you monthly and yearly, and emails you **before** each renewal so nothing sneaks through.

| | |
|---|---|
| 🖥️ **Frontend** | React 19 + Vite + Tailwind 4 + shadcn/ui + TanStack Router (`web/`) |
| 🔐 **Auth & data** | Firebase Auth (email/password + Google) + Firestore (realtime) |
| ⚙️ **Engine** | Express backend (`backend/`) — Plaid bank scanning, Gmail scanning, renewal reminder cron |
| 🏦 **Bank detection** | Plaid Link + Plaid's recurring-transactions API (the same tech Mint/Rocket Money use) |
| 📬 **Reminders** | Nodemailer via Gmail SMTP, daily cron at 08:00 IST |
| 🐳 **Deploy** | Docker Compose / Firebase Hosting + Render/Railway |

---

## ✨ Features

- **Beautiful dashboard** — monthly/yearly spend, category breakdown chart, upcoming renewals, add/edit/delete with realtime sync.
- **Auto-detection from your bank** — connect a bank account with [Plaid Link](https://plaid.com/), the same secure bank-hosted login flow used by Mint, Rocket Money, and Copilot. Your bank credentials never touch our servers — Plaid handles the login directly with your bank and hands us a token. Renewly then pulls Plaid's own ML-based recurring-transaction detection and proposes matches for one-click tracking. No Plaid keys configured? It runs in **demo mode** with realistic sample bank data so the whole flow still works.
- **Auto-detection from Gmail** — connect Gmail (read-only OAuth); the backend scans bank debit alerts and payment receipts (Netflix, Spotify, Google One, bank autopay alerts…), detects recurring charges by interval analysis, and proposes them for one-click tracking. Also has a demo mode.
- **One unified review queue** — candidates from both bank and Gmail scans land in the same dashboard panel, tagged by source, so you approve or dismiss each one regardless of where it was found.
- **AI-powered extraction (optional)** — with an `ANTHROPIC_API_KEY` configured, the Gmail scanner sends billing emails to Claude to fit *any* subscription into the (name, amount, cycle, category, date) tuple — merchants and phrasings the regex heuristics can't parse. Runs as a second pass and merges with heuristic results; without a key, scanning works exactly as before.
- **Email reminders** — a daily job emails you a digest N days before each renewal (you pick N in Settings, 1–7 days). Overdue renewal dates roll forward automatically.
- **Password reset** — "Forgot password?" on the sign-in screen, powered by Firebase's built-in email flow (no backend involved).

> **Why Plaid Link instead of a bank username/password form?** Because that's how every legitimate fintech app works — asking users to type bank credentials into a third-party form violates bank terms of service, is a massive security liability, and gets detected and blocked by banks anyway. Plaid (and India's RBI-regulated Account Aggregator framework) exist specifically so apps never see your bank password. Sandbox mode works instantly for free; connecting *real* bank accounts requires a Plaid production account (a short review, not a big lift) since Plaid is the one taking on the regulatory/security burden of touching real bank credentials.

---

## 🚀 Quick start (local dev)

Prerequisites: **Node 20+** and **npm**.

```bash
# 1. Backend (terminal 1) — runs on :5000
cd backend
npm install
npm run dev

# 2. Frontend (terminal 2) — runs on :3000, proxies /api to :5000
cd web
npm install
npm run dev
```

Open **http://localhost:3000**, create an account, and you're in.
With zero configuration you get: full auth, subscription tracking, charts, and **demo-mode** bank + Gmail scanning.

### Docker alternative

```bash
docker-compose up -d --build   # frontend on :80, backend on :5000
```

### Running the tests

```bash
cd backend && npm test   # Jest — detector heuristics + API auth guards
cd web && npm test       # Vitest — date/cost math (calculateNextDueDate, daysUntil, monthlyCost…)
```

---

## 🔧 Enabling the real integrations

All server configuration lives in `backend/.env` (copy from [backend/.env.example](backend/.env.example)).

### 1. Real bank scanning (Plaid)

1. Sign up free at [dashboard.plaid.com/signup](https://dashboard.plaid.com/signup) — no approval needed for Sandbox.
2. **Team Settings → Keys** → copy your `client_id` and the **Sandbox** `secret`.
3. Put the values in `backend/.env`:
   ```env
   PLAID_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxx
   PLAID_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   PLAID_ENV=sandbox
   ```

Now **Settings → Connect bank** opens the real Plaid Link modal. In Sandbox, use username `user_good` / password `pass_good` for any test institution (e.g. "Chase") — Plaid pre-seeds it with realistic transaction history, so **Scan now** immediately finds recurring charges via Plaid's own detection engine.

Sandbox only offers Plaid's test institutions, not real Indian banks (Plaid doesn't cover India — see the note above). To go live with real bank accounts, apply for [Production access](https://dashboard.plaid.com/overview) in the Plaid dashboard and set `PLAID_ENV=production` with your production secret.

### 2. Real Gmail scanning (Google OAuth)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. **APIs & Services → Library** → enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen** → External → add yourself as a test user.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized redirect URI: `http://localhost:5000/api/gmail/callback`
5. Put the values in `backend/.env`:
   ```env
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
   ```

Now **Settings → Connect Gmail** does a real OAuth flow, and **Scan now** reads (read-only) your bank-alert and receipt emails from the last 180 days.

### 3. Email reminders (Gmail SMTP)

1. Google Account → **Security → 2-Step Verification → App passwords** → create one for "Mail".
2. In `backend/.env`:
   ```env
   SMTP_USER=you@gmail.com
   SMTP_PASS=abcd efgh ijkl mnop   # the app password
   ```

Test it from **Settings → Send me a test reminder**.

### 4. Daily reminder cron (server-side Firestore)

The daily job needs Firebase Admin access:

1. [Firebase Console](https://console.firebase.google.com/) → Project settings → **Service accounts** → Generate new private key.
2. Save as `backend/serviceAccountKey.json` (gitignored), then in `backend/.env`:
   ```env
   FIREBASE_SERVICE_ACCOUNT_FILE=./serviceAccountKey.json
   ```

With this set, the backend runs the reminder pass **daily at 08:00 IST** (and you can trigger it manually: `POST /api/reminders/run`).

### 5. Firestore security rules

After changing rules, deploy them:

```bash
firebase deploy --only firestore:rules
```

---

## 📂 Project structure

```
subscription-tracker/
├── web/                        ← React frontend (Vite SPA)
│   └── src/
│       ├── routes/             ← / (auth) · /dashboard · /settings
│       ├── components/         ← AppShell, SubscriptionDialog, shadcn/ui
│       ├── lib/                ← firebase.ts, data.ts (Firestore), api.ts, types.ts
│       └── hooks/useAuth.tsx
│
├── backend/                    ← Express engine
│   └── src/
│       ├── server.js           ← routes + startup
│       ├── firebase.js         ← Firebase Admin init (graceful degradation)
│       ├── middleware/auth.js  ← Firebase ID-token verification
│       ├── services/
│       │   ├── plaid.js            ← Plaid Link + recurring-transactions scanning
│       │   ├── plaidTokenStore.js  ← Plaid access tokens (Firestore or local file)
│       │   ├── gmail.js            ← OAuth flow + inbox scanning
│       │   ├── detector.js         ← recurring-charge heuristics + demo data
│       │   ├── mailer.js           ← reminder emails (Nodemailer)
│       │   └── tokenStore.js       ← Gmail refresh tokens (Firestore or local file)
│       └── jobs/reminders.js   ← daily cron: roll dates + send digests
│
├── functions/                  ← legacy Firebase Cloud Functions (optional)
├── .ci/                        ← Dockerfiles, nginx.conf, Jenkinsfile
├── docker-compose.yml
├── firestore.rules
└── firebase.json               ← hosting serves web/dist
```

---

## 🌐 API reference

All `/api/*` routes (except the OAuth callback) require `Authorization: Bearer <Firebase ID token>`.

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/health` | Liveness + feature flags (`firestoreAdmin`, `gmailOAuth`, `plaidBank`, `email`) |
| GET | `/api/plaid/status` | Bank connection state for the signed-in user |
| POST | `/api/plaid/link-token` | Creates a Plaid Link token (or `{demo:true}`) |
| POST | `/api/plaid/exchange` | Exchanges Link's `public_token` for a stored access token |
| POST | `/api/plaid/scan` | Pulls Plaid's recurring-transactions → subscription candidates |
| POST | `/api/plaid/disconnect` | Revokes and forgets the stored bank connection |
| GET | `/api/gmail/status` | Connection state for the signed-in user |
| GET | `/api/gmail/auth-url` | Google OAuth consent URL (or `{demo:true}`) |
| GET | `/api/gmail/callback` | OAuth redirect target (Google calls this) |
| POST | `/api/gmail/scan` | Scan inbox → subscription candidates |
| POST | `/api/gmail/disconnect` | Forget the stored refresh token |
| POST | `/api/reminders/test` | Email the caller a real reminder now |
| POST | `/api/reminders/run` | Run the daily job (header `x-cron-secret` in prod) |

---

## 🚢 Deploying (100% free tier)

The stack deploys at zero cost: **Firebase Hosting** (frontend, Spark plan) + **Render** (backend, free plan) + **cron-job.org** (daily reminder trigger, since free Render instances sleep when idle).

### 1. Backend → Render

1. Push this repo to GitHub.
2. [render.com](https://render.com) → sign in with GitHub → **New → Blueprint** → pick this repo. Render reads [render.yaml](render.yaml) and creates the `renewly-api` web service (free plan).
3. In the service's **Environment** tab, paste the secret values (each key is pre-declared by the blueprint):
   - `FRONTEND_URL` — your Firebase Hosting URL, e.g. `https://subscription-hub-19cf9.web.app`
   - `FIREBASE_SERVICE_ACCOUNT` — the full contents of `backend/serviceAccountKey.json` on one line
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from `backend/.env`
   - `GOOGLE_REDIRECT_URI` — `https://<your-render-url>/api/gmail/callback`
   - `PLAID_CLIENT_ID` / `PLAID_SECRET` — from `backend/.env`
   - `SMTP_USER` / `SMTP_PASS` — from `backend/.env`
   - `CRON_SECRET` — from `backend/.env`
4. Note the service URL Render assigns (e.g. `https://renewly-api.onrender.com`). If it differs from the value in [web/.env.production](web/.env.production), update that file and rebuild the frontend.
5. Google Cloud Console → **APIs & Services → Credentials** → your OAuth client → add the production redirect URI from step 3 alongside the localhost one.

### 2. Frontend → Firebase Hosting

```bash
firebase login                          # one-time, opens a browser
cd web && npm run build                 # picks up web/.env.production
cd .. && firebase deploy --only hosting,firestore:rules
```

Deploying `firestore:rules` at the same time replaces any permissive test-mode rules (which expire!) with the locked-down rules in [firestore.rules](firestore.rules). The `*.web.app` domain is automatically authorized for Firebase Auth — no extra step.

### 3. Daily reminders → cron-job.org

Free Render instances sleep after ~15 min idle, so the in-process cron can't be trusted. [cron-job.org](https://cron-job.org) (free) fires it externally — and its request also wakes the instance:

- URL: `https://<your-render-url>/api/reminders/run`, method **POST**, schedule daily (e.g. 08:00 IST)
- Custom header: `x-cron-secret: <your CRON_SECRET>`

### Free-tier honesty

- **Cold starts**: a sleeping Render instance takes ~50s to wake on first request. Fine for a portfolio app; mention it in demos.
- **Plaid stays in Sandbox** (test banks, `user_good`/`pass_good`) — real bank data needs Plaid Production access, which requires a business application.
- **Gmail OAuth stays in Testing mode** — only the test users you added in the consent screen can connect Gmail. That's you, which is all a portfolio needs.

---

## 🧯 Troubleshooting

| Problem | Fix |
|---------|-----|
| `Settings` says backend isn't reachable | Start it: `cd backend && npm run dev` |
| "Demo mode" shown in Bank card | Expected without `PLAID_CLIENT_ID/SECRET` — see §1 above |
| Plaid Link modal login fails | Sandbox only accepts `user_good` / `pass_good` (or other [documented test credentials](https://plaid.com/docs/sandbox/test-credentials/)) |
| "Demo mode" shown in Gmail card | Expected without `GOOGLE_CLIENT_ID/SECRET` — see §2 above |
| Test reminder says email isn't configured | Set `SMTP_USER` / `SMTP_PASS` (app password, not your real password) |
| Reminder cron disabled at startup | Needs both SMTP config **and** a Firebase service account |
| Firestore `permission-denied` in console | Deploy the updated rules: `firebase deploy --only firestore:rules` |
| Google OAuth error `redirect_uri_mismatch` | The redirect URI in Google Cloud must exactly match `GOOGLE_REDIRECT_URI` |

---

**Made by Abdullah** — full-stack subscription tracking with automatic detection and reminders.
