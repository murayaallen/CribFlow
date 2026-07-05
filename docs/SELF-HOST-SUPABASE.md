# Self-hosting Supabase on our VPS (Docker)

We run the **open-source Supabase stack** on our own DirectAdmin VPS (root +
Docker). The app code is unchanged — it just points at our self-hosted URL
instead of supabase.com. This replaces the managed Pro plan (see
`docs/SUPABASE-PLAN.md` for the managed comparison).

> Trade-off we accept: **we own backups, security, updates, and uptime.** The
> steps below make those explicit — don't skip §6 (backups).

---

## What runs
The stack is one `docker compose` project (Supabase's official `docker/` folder):
Postgres · GoTrue (auth) · PostgREST (REST API) · Realtime · Storage · Kong
(API gateway) · Studio (admin UI) · Meta. Our frontend and backend talk to
**Kong** (the gateway) over one HTTPS URL.

## Requirements
- VPS with **Docker + Docker Compose**, root, ~**4 GB RAM** recommended (2 GB is
  tight), a few GB disk.
- A subdomain for the API gateway, e.g. **`db.cribflow.co.ke`**, with TLS.
- Ports: keep **5432 (Postgres) closed to the public**; expose only the gateway
  (behind your reverse proxy on 443). Never expose Studio unauthenticated.

---

## Step 1 — Get the stack
```bash
mkdir -p /opt && cd /opt
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

## Step 2 — Configure `.env` (the important part)
Edit `/opt/supabase/docker/.env`:
- `POSTGRES_PASSWORD` — a long random password.
- `JWT_SECRET` — a random **string ≥ 40 chars**.
- `ANON_KEY` and `SERVICE_ROLE_KEY` — JWTs signed with that `JWT_SECRET`.
  Generate them with Supabase's key generator (self-hosting docs) or the CLI;
  `ANON_KEY` has role `anon`, `SERVICE_ROLE_KEY` has role `service_role`.
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` — protects Studio.
- URLs (use your API subdomain over HTTPS):
  - `SITE_URL=https://app.cribflow.co.ke`
  - `API_EXTERNAL_URL=https://db.cribflow.co.ke`
  - `SUPABASE_PUBLIC_URL=https://db.cribflow.co.ke`
- SMTP (for auth emails — reuse the Gmail App Password): `SMTP_HOST=smtp.gmail.com`,
  `SMTP_PORT=465`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER_NAME=CribFlow`.
- `ADDITIONAL_REDIRECT_URLS=https://app.cribflow.co.ke` (for auth redirects).

Keep this `.env` secret (root-only perms). These keys are the crown jewels.

## Step 3 — Launch
```bash
docker compose pull
docker compose up -d
docker compose ps        # all services "healthy"
```
Studio is served via the gateway on port **8000** internally.

## Step 4 — Put it behind HTTPS
Point `db.cribflow.co.ke` at the server and reverse-proxy **443 → 127.0.0.1:8000**
(Kong). Use DirectAdmin's Nginx/Apache custom proxy or a standalone Nginx +
Let's Encrypt. Result: `https://db.cribflow.co.ke` is the API URL the app uses.
Firewall: allow 80/443 only; **block 5432 and 8000 from the public**.

## Step 5 — Load our schema
In Studio (`https://db.cribflow.co.ke` → SQL Editor), or via `psql`:
1. Run `database/schema.sql`
2. Run `database/policies.sql`
(Fresh install needs only these two — every migration is already folded in.)

Then Studio → Authentication → Providers → Email: enable; for early testing you
may disable email confirmations.

## Step 6 — BACKUPS (do not skip)
Self-hosting = our backups. Minimum:
```bash
# nightly logical dump, kept 14 days, plus offsite copy
docker compose exec -T db pg_dump -U postgres --clean --if-exists postgres \
  | gzip > /opt/backups/cribflow-$(date +%F).sql.gz
```
- Add this as a **cron job** (root or DirectAdmin cron).
- Copy dumps **offsite** (another host / object storage) — a backup on the same
  box is not a backup.
- Test a restore before go-live.
- Consider volume snapshots if your VPS provider offers them.

## Step 7 — Wire the app to it
- Frontend `frontend/js/config.js`:
  ```js
  SUPABASE_URL: 'https://db.cribflow.co.ke',
  SUPABASE_ANON_KEY: '<ANON_KEY from .env>',
  API_URL: 'https://api.cribflow.co.ke',
  ```
- Backend env: `SUPABASE_URL=https://db.cribflow.co.ke`,
  `SUPABASE_SERVICE_KEY=<SERVICE_ROLE_KEY from .env>`.

## Ongoing ops
- **Updates:** periodically `docker compose pull && docker compose up -d`
  (read release notes; test after).
- **Restart policy:** compose sets services to restart; ensure Docker starts on
  boot (`systemctl enable docker`).
- **Monitoring:** watch RAM/disk; `docker compose logs`. Alert on the gateway
  being down.
- **Security:** strong `JWT_SECRET`/passwords, 5432 closed, Studio behind
  auth+TLS, keep the box patched.

---

## Managed vs self-hosted — quick reminder
Self-hosted removes the ~$25/mo and keeps data on our box, but we own backups +
security + uptime. If ops ever become a distraction from the product, migrating
to managed Supabase is a `pg_dump` → restore away (same stack), so this choice
isn't a lock-in.
