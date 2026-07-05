# CribFlow — Deployment (DirectAdmin + Supabase)

How CribFlow is hosted for live usage.

```
                 Cloudflare / DNS  (cribflow.co.ke)
                          │
        ┌─────────────────┴──────────────────┐
        │                                     │
  app.cribflow.co.ke                    api.cribflow.co.ke
  (public_html static site)            (DirectAdmin Node.js app)
   frontend/*.html,css,js               backend/  (Express + Passenger)
        │                                     │
        │  supabase-js (anon key, RLS)        │  service-role key
        └──────────────┬──────────────────────┘
                       ▼
              Supabase (PAID / Pro)   ← Postgres, Auth, Storage, backups
                       ▲
                       │  M-Pesa C2B callbacks (HTTPS) → api.cribflow.co.ke/api/mpesa/*
                Safaricom Daraja
```

Assumptions (adjust to your real domain): frontend at `app.cribflow.co.ke`,
backend at `api.cribflow.co.ke`. Both get free Let's Encrypt SSL in DirectAdmin.

---

## 1. Frontend (static) on DirectAdmin

1. **Create the site**: DirectAdmin → *Domain Setup* (or a subdomain
   `app.cribflow.co.ke`). Its document root is `.../public_html`.
2. **Enable SSL**: DirectAdmin → *SSL Certificates* → Let's Encrypt for the
   domain. Force HTTPS redirect.
3. **Configure**: copy `frontend/js/config.example.js` → `config.js` and set:
   ```js
   SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
   SUPABASE_ANON_KEY: 'YOUR_ANON_KEY',      // public-safe (RLS enforces access)
   API_URL: 'https://api.cribflow.co.ke',
   CURRENCY: 'KSh', COUNTRY: 'KE',
   ```
4. **Upload**: put the contents of `frontend/` into `public_html/`
   (File Manager or FTP/SFTP). `index.html` / `auth.html` are the entry points.
5. **Cache headers** (later, Phase 4): long cache for `css/`,`js/`,`images/`;
   `config.js` no-cache.

> The anon key is meant to be public — access is controlled by Row Level
> Security. The **service-role key never goes in the frontend.**

---

## 2. Backend (Express) via DirectAdmin Node.js app

DirectAdmin's Node.js feature runs the app under **Passenger** (CloudLinux
NodeJS Selector).

1. **Create subdomain** `api.cribflow.co.ke` and enable Let's Encrypt SSL on it
   (M-Pesa requires public HTTPS).
2. **Upload** the `backend/` folder somewhere in the account (e.g.
   `~/nodeapps/cribflow-api`). Do **not** upload `node_modules` or `.env` blindly.
3. DirectAdmin → **Node.js** → *Create Application*:
   - **Node version**: 18+ (matches `engines`).
   - **Application mode**: Production.
   - **Application root**: the uploaded `backend/` path.
   - **Application URL**: `api.cribflow.co.ke`.
   - **Application startup file**: `server.js`.
4. **Environment variables** (set in the Node.js app UI — this replaces `.env`
   on shared hosting; you can also place a `.env` in the app root):
   ```
   NODE_ENV=production
   FRONTEND_URL=https://app.cribflow.co.ke
   SUPABASE_URL=...            SUPABASE_SERVICE_KEY=...   (service role — secret!)
   MPESA_ENV=production        MPESA_CONSUMER_KEY=...     MPESA_CONSUMER_SECRET=...
   MPESA_SHORTCODE=...         MPESA_PASSKEY=...
   MPESA_VALIDATION_URL=https://api.cribflow.co.ke/api/mpesa/validation
   MPESA_CONFIRMATION_URL=https://api.cribflow.co.ke/api/mpesa/confirmation
   GMAIL_USER=...              GMAIL_APP_PASSWORD=...     EMAIL_FROM_NAME=CribFlow
   ```
5. **Install deps**: click *Run NPM Install* (or SSH: activate the app's venv,
   `npm install --production`).
6. **Start / Restart**: use the app's *Restart* button. Passenger keeps the
   process alive and restarts on crash. To force a restart after code changes:
   `touch ~/nodeapps/cribflow-api/tmp/restart.txt`.
7. **Verify**: `https://api.cribflow.co.ke/health` returns `{status:"ok"}`.

**Passenger notes**
- The app listens on `process.env.PORT` (Passenger provides it) — `server.js`
  already does `process.env.PORT || 3000`, so no change needed.
- No PM2 needed under Passenger (it manages the process). If you deploy on a
  plain VPS instead, use PM2 (`pm2 start server.js --name cribflow-api`).
- Ensure outbound HTTPS is allowed (Daraja OAuth + Gmail SMTP). Usually fine.

---

## 3. Database — Supabase (Pro)

- Create the project (region closest to Kenya, e.g. `eu-central`/`eu-west`).
- SQL Editor → run `database/schema.sql`, then `database/policies.sql`.
- Auth → Providers → Email: enable; decide on email confirmations for prod
  (ON for real users; can be OFF for early testing).
- Settings → API: copy **Project URL**, **anon key** (→ frontend `config.js`),
  **service_role key** (→ backend env only).
- Enable **daily backups** (Pro) and, before handling real money, **PITR**
  (point-in-time recovery add-on). See `docs/SUPABASE-PLAN.md`.

---

## 4. Integrations

- **M-Pesa**: follow `docs/MPESA-SETUP.md`. Register the `api.` validation/
  confirmation URLs, test in sandbox, then go live.
- **Email**: Gmail App Password in backend env. (Consider a transactional
  provider — Postmark/Resend/SES — for deliverability at scale.)

---

## 5. Scheduled jobs (Phase 3) — the DirectAdmin way

Shared hosting doesn't love long-lived in-process schedulers. Instead:
- Add a **protected** endpoint (e.g. `POST /api/jobs/run` guarded by a secret
  header), then use **DirectAdmin → Cron Jobs** to `curl` it on a schedule
  (monthly bill generation, daily reminders, daily late-fee accrual).
- Alternative: Supabase **pg_cron** / an Edge Function if you prefer the jobs
  next to the data. Decide in Phase 3.

---

## 6. Release checklist (per deploy)
1. Commit + tag. 2. Upload changed frontend files / backend code. 3. `npm install`
if deps changed. 4. Restart the Node app. 5. Hit `/health`. 6. Smoke-test login,
a payment, and a bill. 7. Watch logs for errors.
