# CribFlow

Property management for Kenyan landlords — track rent, water bills, and M-Pesa payments across all your properties from one calm dashboard.

## What's inside

- **Frontend** — Vanilla HTML/CSS/JavaScript, no build step. Runs on any static file server.
- **Backend** — Node.js + Express. Handles M-Pesa Daraja callbacks, email sending, and PDF reports.
- **Database** — Supabase (PostgreSQL) with Row Level Security so each landlord only sees their own data.

## Folder structure

```
rentflow/
├── frontend/                  # Static web app
│   ├── *.html                 # Each page (auth, dashboard, properties…)
│   ├── css/                   # Design system, components, layout
│   └── js/
│       ├── *.js               # Shared modules (supabase-client, sidebar, utils, icons)
│       └── pages/             # Per-page logic
├── backend/                   # Express server
│   ├── server.js              # Entry point
│   ├── routes/                # /api/mpesa, /api/email
│   └── services/              # Supabase, Daraja, Nodemailer
├── database/
│   ├── schema.sql             # Tables, indexes, triggers
│   └── policies.sql           # Row Level Security
└── README.md
```

---

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In your Supabase project → **SQL Editor**, paste and run `database/schema.sql`.
3. Then run `database/policies.sql` to enable Row Level Security.
4. Go to **Settings → API** and copy:
   - **Project URL** (e.g. `https://abcd1234.supabase.co`)
   - **anon / public key** (for the frontend)
   - **service_role key** (for the backend — keep secret!)

5. Go to **Authentication → Providers → Email** — for local testing, **disable email confirmations** so you can sign up and use the app immediately.

---

## 2. Set up the frontend

```bash
cd frontend/js
cp config.example.js config.js
```

Open `config.js` and paste your Supabase URL and anon key.

Then serve the `frontend/` folder using any static server. The simplest option:

```bash
cd frontend
python3 -m http.server 8080
# OR  npx serve -p 8080
```

Open **http://localhost:8080/auth.html** in your browser.

Create an account → you should land on the dashboard.

---

## 3. Set up the backend

The backend is only needed for M-Pesa Daraja callbacks and email sending. You can run the frontend without it for everything else.

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` and fill in:
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (from Supabase → Settings → API)
- M-Pesa Daraja credentials (see step 4 below)
- Gmail credentials (see step 5 below)

Then:

```bash
npm start
```

The backend will run on **http://localhost:3000**.

---

## 4. M-Pesa Daraja setup

### A. Get a Paybill from Safaricom Business

You need a registered M-Pesa Paybill (or Till Number). This requires:
- Business registration / KRA PIN
- Visit a Safaricom Business shop or register online

This usually takes 2–5 working days.

### B. Create a Daraja developer account

1. Go to [developer.safaricom.co.ke](https://developer.safaricom.co.ke).
2. Create an account, then create an **App** under "My Apps".
3. Note the **Consumer Key** and **Consumer Secret**.

### C. Configure backend `.env`

```env
MPESA_ENV=sandbox                  # or "production" once approved
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_SHORTCODE=174379             # sandbox shortcode, or your real Paybill
MPESA_VALIDATION_URL=https://crib-api.flows.co.ke/api/mpesa/validation
MPESA_CONFIRMATION_URL=https://crib-api.flows.co.ke/api/mpesa/confirmation
```

> ⚠️ The validation/confirmation URLs must be **publicly reachable HTTPS**. For local development, use [ngrok](https://ngrok.com) to expose your localhost:
> ```bash
> ngrok http 3000
> ```
> Then use `https://xxxx.ngrok.io/api/mpesa/validation` etc.

### D. Register URLs with Safaricom

After deploying (or running ngrok), register your URLs **once**:

```bash
curl -X POST https://crib-api.flows.co.ke/api/mpesa/register-urls
```

### E. Test in sandbox

Use the simulate endpoint to send a test payment:

```bash
curl -X POST https://crib-api.flows.co.ke/api/mpesa/simulate \
  -H 'Content-Type: application/json' \
  -d '{"amount": 1000, "phone": "254708374149", "accountNumber": "SRC-A1"}'
```

The payment should appear in the **Payments** page of the app.

### F. Go live

Once tested, in the Daraja portal go through "Go Live" approval, then change `MPESA_ENV=production` and re-register your URLs.

---

## 5. Email setup (Gmail SMTP)

1. Go to your Google Account → **Security**.
2. Enable **2-Step Verification** if you haven't.
3. Visit [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) and create an **App Password** for "Mail".
4. Add to backend `.env`:

```env
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
EMAIL_FROM_NAME=Sunrise Properties
```

Restart the backend. Tenants with email addresses will now receive bill, receipt, and reminder emails.

---

## 6. Deploying to your server

### Frontend
- Upload the `frontend/` folder to any static host (Nginx, Apache, Cloudflare Pages, Netlify, your own VPS).
- Make sure to set `API_URL` in `js/config.js` to your backend's public URL.

### Backend
- Upload the `backend/` folder to your server.
- Run `npm install --production`.
- Run with `npm start`, or use **PM2** for process management:
  ```bash
  npm install -g pm2
  pm2 start server.js --name rentflow-backend
  pm2 save
  pm2 startup
  ```
- Set up Nginx (or Caddy) as a reverse proxy with HTTPS (Let's Encrypt).

### Suggested Nginx config

```nginx
# Frontend
server {
  listen 443 ssl http2;
  server_name crib.flows.co.ke;
  root /var/www/rentflow/frontend;
  index index.html auth.html;
  try_files $uri $uri/ =404;
}

# Backend API
server {
  listen 443 ssl http2;
  server_name crib-api.flows.co.ke;
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

Update frontend `js/config.js`:
```js
API_URL: 'https://crib-api.flows.co.ke',
```

---

## How tenants pay

1. Open M-Pesa → Lipa na M-Pesa → Pay Bill
2. Business no.: **`<your Paybill>`**
3. Account no.: **`PREFIX-UNIT`** (e.g. `SRC-A1` for Sunrise Court Unit A1)
4. Amount: any amount (up to or exceeding the bill)
5. Confirm with PIN

Within seconds, the payment appears in the dashboard, the tenant's bill is updated, and (if email is configured) a receipt is sent to them automatically.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "CONFIG not loaded" warning | Make sure you copied `config.example.js` to `config.js` |
| Auth shows blank page | Check Supabase URL and anon key in `config.js` |
| "Email confirmation required" | In Supabase → Auth → Providers → Email, disable confirmations for local dev |
| RLS policy errors | Re-run `database/policies.sql` |
| M-Pesa callbacks not arriving | Check your URLs are HTTPS and publicly reachable; check backend logs |
| Emails not sending | Check `GMAIL_APP_PASSWORD` is correct; check backend logs |

---

## Architecture notes

- **No build step** — the frontend is intentionally framework-free. Edit a file, refresh the browser.
- **Supabase JS client talks directly to the database** — for everything except M-Pesa and email, the frontend reads/writes Supabase directly. RLS policies keep landlords' data isolated.
- **Backend only handles**: M-Pesa Daraja callbacks (which need a public HTTPS endpoint), email sending (needs SMTP credentials), and any future PDF generation.
- **One landlord per account** — CribFlow is a personal tool, not multi-tenant SaaS. Each Supabase user is one landlord with their own properties.

---

## License

Proprietary. All rights reserved.
