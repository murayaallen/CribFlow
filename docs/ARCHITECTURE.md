# CribFlow — System Architecture

> Property-management platform for Kenyan landlords: track rent, water, and
> M-Pesa payments across properties from one dashboard.
>
> Status: pre-production hardening. This document is the execution blueprint —
> the single source of truth for how the system is structured and how each phase
> of work fits together. Keep it current as the build progresses.

---

## 1. Principles

1. **Data integrity over convenience.** Money math is computed and enforced in
   the database, never trusted from the client. One source of truth per fact.
2. **Least privilege.** The browser talks to Postgres directly but is fenced in
   by Row Level Security. The service-role key never leaves the backend.
3. **Fail safe, log loud.** External callbacks (M-Pesa) always ack, then process
   defensively and idempotently. Every money-affecting action is auditable.
4. **No premature framework.** The frontend stays build-step-free until a real
   need justifies tooling. Simplicity is a feature while the team is small.
5. **Reversible steps.** Schema changes ship as idempotent migrations; work lands
   in small, reviewable commits; nothing destructive without a backup.

---

## 2. High-level topology

```
                        ┌─────────────────────────────────────────┐
                        │                Browser                    │
                        │   Static HTML/CSS/JS (no build step)      │
                        │   supabase-js  ·  CONFIG (anon key)       │
                        └───────────────┬───────────────┬──────────┘
                                        │               │
                    RLS-guarded CRUD    │               │  REST (JWT)
                    (reads + writes)     │               │  email + admin
                                        ▼               ▼
             ┌───────────────────────────────┐   ┌──────────────────────────┐
             │        Supabase (Postgres)     │   │   Backend (Node/Express)  │
             │  Auth · RLS · triggers · RPCs  │◄──┤   service-role client     │
             │  Storage (logos, future)       │   │   /api/mpesa  /api/email  │
             └───────────────┬────────────────┘   └───────┬──────────┬───────┘
                             │  service-role writes         │          │
                             └──────────────────────────────┘          │
                                        ▲                               │
                         C2B callbacks  │ validation/confirmation       │ SMTP
                                        │                               ▼
                             ┌──────────┴──────────┐            ┌───────────────┐
                             │  Safaricom Daraja    │            │  Gmail / SMTP │
                             │  (M-Pesa C2B)        │            └───────────────┘
                             └──────────────────────┘
```

**Two independent write paths into Postgres:**
- **Direct (browser → Postgres):** all normal CRUD, constrained by RLS. This is
  the primary path; the app works for everything except M-Pesa and email even if
  the backend is down.
- **Privileged (backend → Postgres):** M-Pesa callbacks and system actions that
  must bypass RLS use the service-role client. This path must enforce ownership
  and validation in code, because RLS is off for it.

---

## 3. Components

### 3.1 Frontend (`frontend/`)
- Vanilla HTML per page + shared JS modules loaded as global `<script>`s.
- `js/config.js` (gitignored) holds Supabase URL + **anon** key + `API_URL`.
- Shared modules: `supabase-client.js` (auth helpers), `utils.js` (formatting,
  toasts, modals), `icons.js`, `sidebar.js`. Per-page logic in `js/pages/*.js`.
- CSS design system in `css/` (`design-system.css`, `components.css`,
  `layout.css`) with light/dark theme via `[data-theme]` + `localStorage`.
- **Auth:** Supabase email/password (`signUp`, `signInWithPassword`,
  `resetPasswordForEmail`). Every protected page calls `requireAuth()` on load.

**Target module strategy (Phase 5):** collapse duplicated per-page helpers
(`renderStat`, `formatMoney`, stat-card markup) into shared modules; replace
inline `onclick="fn(${JSON.stringify(x)})"` with `data-` attributes + delegated
listeners (removes an HTML-injection footgun). Optional: a light bundler/minifier
+ cache headers once pages stabilize.

### 3.2 Backend (`backend/`)
- Node + Express. Purpose is deliberately narrow: **M-Pesa callbacks** (need a
  public HTTPS endpoint) and **email** (needs SMTP secrets). Nothing the browser
  can safely do itself lives here.
- `server.js` — app wiring, CORS, JSON limits, request logging, health check.
- `routes/mpesa.js` — C2B validation/confirmation + admin register/simulate.
- `routes/email.js` — bill / receipt / reminder senders (JWT-guarded).
- `services/` — `supabase.js` (service-role client), `daraja.js` (OAuth + C2B),
  `mailer.js` (Nodemailer + templates).
- Runs under **PM2** behind **Nginx** (TLS) on a VPS.

### 3.3 Database (Supabase Postgres)
- Schema in `database/schema.sql`; RLS in `database/policies.sql`; incremental
  changes in `database/migrations/NNN_*.sql` (idempotent, backfill-aware).
- Business rules enforced by **triggers + SECURITY DEFINER functions** so every
  entry path (browser, backend, future automation) behaves identically.

---

## 4. Data model

```
auth.users ─1:1─ profiles ─1:1─ subscriptions
                    │
                    │ 1:N
                    ▼
                properties ─1:N─ rooms ─1:N─ tenants ─1:N─ bills ─1:N─ payment_allocations
                                   │            │            ▲                    │
                                   │            │ 1:N        │ N:1                │ N:1
                                   │            ▼            │                    ▼
                                   └── water_readings ───────┘                payments
                                                (feeds bill.water_amount)         │
                                                                                  │ 1:1 (matched)
        mpesa_transactions ───────────────────────────────────────────────────────┘
        email_logs (audit)
```

**Table roles**
- `profiles` — landlord identity + paybill/prefix + late-fee policy.
- `subscriptions` — one per landlord; plan tier, limits, feature flags.
- `properties → rooms → tenants` — the physical/occupancy hierarchy. One active
  tenant per room (partial unique index). Room status auto-syncs with tenancy.
- `water_readings` — monthly meter reads; `units_used`/`amount_due` are generated
  columns (snapshot the rate at reading time).
- `bills` — one per (tenant, month, year). `total_due` is input; `total_paid` is
  **derived from allocations**; `balance` is a generated column.
- `payments` — money received (any method). `credited_amount` tracks overpayment.
- `payment_allocations` — **how each payment is split across bills** (the ledger).
- `mpesa_transactions` — raw Daraja callbacks; idempotent on `transaction_id`.
- `email_logs` — audit trail of every message sent.

**Key invariants (DB-enforced)**
- One active tenant per room. Unique `(tenant, month, year)` bill. Unique
  `mpesa_code` / `transaction_id`. Water `current ≥ previous`.
- `bills.total_paid = Σ allocations`; `balance ≥ 0` always (overpay → credit).

---

## 5. Domain logic — the money model

This is the heart of the system and where correctness matters most.

### 5.1 Billing lifecycle
```
generate bills (per active tenant, per month)
   total_due = rent + water(from reading) + other_charges [+ late_fee]
        │
        ▼
   send bill (email)  ──►  tenant pays  ──►  payment recorded
        │                                         │
        │                                         ▼
        └──────────────────────────►  allocation applies money to bills
                                                  │
                                       status: unpaid → partial → paid
```

### 5.2 Payment allocation (single source of truth)
Implemented as `fn_allocate_payment` (trigger `trg_payment_allocate` on
`payments` insert). For every payment:
1. Fill the **explicitly targeted bill** first (if `payments.bill_id` set), then
   remaining **open bills oldest-first**, locking rows (`FOR UPDATE`) to prevent
   concurrent double-allocation.
2. Write `payment_allocations` rows; `trg_alloc_recompute` recomputes each
   affected `bill.total_paid` + status from the ledger.
3. Any remainder after all open bills are filled is **banked to
   `tenants.credit_balance`** and recorded in `payments.credited_amount`.
   Overpayment is **flagged for manual handling** (landlord refunds or applies
   it) — never silently auto-consumed.
4. Deleting a payment cascades its allocations (bills recompute) and reverses the
   banked credit (`trg_payment_reverse_credit`).

**Arrears are modeled as multiple open bills**, not rolled into a new bill's
`total_due` (that would double-count). "Running balance" is an aggregate:
`Σ open bill balances − credit_balance`, surfaced per tenant and on the dashboard.

### 5.3 Late fees (Phase 1, pending)
Driven by `profiles.late_penalty_type|amount` + `grace_period_days`. A bill past
`due_date + grace` accrues `bills.late_fee` (flat or % of balance), added to
`total_due`. Applied by an explicit action first, then automated (Phase 3).

---

## 6. Integration architecture

### 6.1 M-Pesa (Daraja C2B)
```
Tenant pays Paybill, Account = PREFIX-UNIT (e.g. SRC-A1)
        │
        ▼
Safaricom ──POST /api/mpesa/validation──►  backend  (ack ResultCode 0 fast)
Safaricom ──POST /api/mpesa/confirmation─►  backend
                                              │  1. ack immediately
                                              │  2. idempotency check (transaction_id)
                                              │  3. match Paybill(shortcode)+account→tenant
                                              │  4. insert mpesa_transactions
                                              │  5. if matched → insert payment
                                              │       (allocation trigger does the rest)
                                              │  6. unmatched → queue for manual match
```
- **Matching must be scoped by `BusinessShortCode`** to the landlord whose
  `profiles.paybill_number` matches, *then* by account prefix + room (Phase 2).
  This removes cross-landlord mis-credit and is the correct disambiguator.
- Callbacks are public; harden with shortcode validation + Safaricom IP allowlist
  (Phase 2). Admin endpoints (`register-urls`, `simulate`) need auth.
- See `docs/MPESA-SETUP.md` for provisioning steps.

### 6.2 Email
- Backend-only (SMTP secrets). JWT-guarded routes send bill/receipt/reminder,
  render HTML templates, and write `email_logs`. **Ownership must be verified**
  (the bill/payment belongs to the caller) before sending (Phase 2).
- Frontend currently only stamps `email_sent_at`; wiring the UI to actually call
  the backend is Phase 3.

---

## 7. Security architecture

| Layer | Control |
|---|---|
| Identity | Supabase Auth (email/password, reset). JWT carries `auth.uid()`. |
| Data isolation | RLS on **every** table; policies key off `auth.uid()` via ownership joins (property → room → tenant → bill). |
| Privileged writes | Service-role key **backend only**; functions that must bypass RLS are `SECURITY DEFINER` with fixed `search_path`. |
| Plan limits | `can_add_property()` gate before property creation. |
| Secrets | `frontend/js/config.js` (anon key only) and `backend/.env` are gitignored. Anon key is public-safe; service key is not. |
| Public callbacks | (Phase 2) validate shortcode, allowlist Safaricom IPs, rate-limit. |
| API authz | (Phase 2) email/admin routes verify JWT **and** resource ownership. |
| Transport | Nginx TLS (Let's Encrypt); CORS locked to the frontend origin. |
| Headers | (Phase 4) CSP + security headers on the static host. |

**Trust boundary:** anything the browser sends is untrusted. RLS protects the
direct path; the backend must re-check ownership because it runs privileged.

---

## 8. Multi-tenancy & plans

- **One landlord per account**, each with their own M-Pesa paybill
  (`profiles.paybill_number`). Data isolated by RLS.
- `subscriptions` gives each landlord a plan (`free`/`basic`/`pro`) with
  `max_properties`, `max_rooms_per_property`, and `features` flags. Created
  automatically on signup (default free). Enforced today for property count;
  extend to rooms/features as needed.
- **Multi-landlord M-Pesa (built):** each landlord connects their **own paybill**
  via **Settings → M-Pesa** (`/api/mpesa/connect`): they supply their paybill +
  Daraja Consumer Key/Secret, we register the **shared** platform callback URL
  for *their* shortcode, store connection state in `landlord_mpesa` (server-only
  RLS), and set `profiles.paybill_number`. The **secret is never stored** — used
  once to register, then discarded (receiving C2B needs no creds). One backend +
  one callback URL serves all landlords; the confirmation handler routes each
  payment by `BusinessShortCode → profiles.paybill_number`. Money settles
  **directly** to each landlord — CribFlow is never an intermediary (no
  PSP/settlement burden). `profiles.paybill_number` is uniquely indexed.

---

## 9. Deployment topology (DirectAdmin + Supabase)

```
Cloudflare/DNS
   ├── crib.flows… ──► DirectAdmin public_html ──► static frontend/      (Let's Encrypt TLS)
   └── crib-api.flows… ──► DirectAdmin Node.js app (Passenger) ──► server.js  (Let's Encrypt TLS)
Supabase (PAID/Pro — Postgres, Auth, Storage) ── daily backups + PITR
Safaricom Daraja ── registered to crib-api.flows…/api/mpesa/*
```
- **Frontend**: static files in DirectAdmin `public_html` (optionally Cloudflare
  CDN in front). `config.js` holds prod Supabase URL + anon key + `API_URL`.
- **Backend**: DirectAdmin **Node.js app** feature (CloudLinux NodeJS Selector /
  Passenger). Passenger manages the process (no PM2); env vars set in the app UI;
  restart via `tmp/restart.txt`. `server.js` listens on `process.env.PORT`.
- **DB**: Supabase project "CRIB FLOW" on **Pro** (no auto-pause, backups); run
  `schema.sql` then `policies.sql`.
- Full steps in `docs/DEPLOYMENT.md`; plan/scaling in `docs/SUPABASE-PLAN.md`.

---

## 10. Reliability & observability

- **Logging (Phase 4):** replace `console.*` with structured logs (request IDs,
  levels) + an error tracker (e.g. Sentry). Persist/rotate backend logs via PM2.
- **Backups (Phase 4):** enable Supabase PITR / scheduled backups before go-live.
- **Idempotency:** M-Pesa confirmation is idempotent on `transaction_id` (DB
  unique + pre-check); callbacks always ack so Safaricom won't storm retries.
- **Data safety:** move financial deletes to **soft-delete** (status flags) so
  bills/payments are never hard-lost via FK cascade (Phase 2).
- **Rate limiting (Phase 4):** on public callback + auth-adjacent endpoints.

---

## 11. Automation / scheduled jobs (Phase 3)

Shared hosting doesn't favour long-lived in-process schedulers, so prefer
**DirectAdmin Cron Jobs → a protected `/api/jobs/*` endpoint** (secret header),
or Supabase **pg_cron** / an Edge Function:
- Monthly **auto bill generation** for active tenants.
- **Reminders** for overdue bills (`profiles.reminder_days`).
- **Late-fee** accrual after grace period.
Each job is idempotent and writes to `email_logs` / audit as appropriate.

---

## 12. Conventions

- **Migrations:** `database/migrations/NNN_description.sql`, idempotent, wrapped
  in a transaction, with a backfill when they change derived data. Fresh installs
  run `schema.sql` + `policies.sql` (which already include the latest state);
  existing DBs apply migrations in order.
- **Commits:** small and phase-labeled (`Phase N: …`). Secrets never committed.
- **Money:** always `numeric(10,2)`; formatting only in the view layer.
- **DB functions that bypass RLS:** `SECURITY DEFINER` + `set search_path`.
- **New tables:** add RLS enable + policies in the same change.

---

## 13. Execution framework (phases → architecture)

| Phase | Goal | Architecture area |
|---|---|---|
| 0 ✅ | One versioned repo | §3 |
| 1 | Financial correctness (allocation ✅, credit UI, running balance, late fees) | §4, §5 |
| 2 | Security hardening (shortcode-scoped matching, ownership checks, admin auth, callback validation, CORS, soft-delete) | §6, §7, §10 |
| 3 | Wire-up + automation (email UI→backend, scheduled jobs) | §6, §11 |
| 4 | Ops (logging, error tracking, backups, rate limiting, headers) | §10, §7 |
| 5 | Efficiency (shared modules, N+1 fixes, XSS-safe rendering) | §3.1 |

Progress is tracked in agent memory (`rentflow-roadmap`). This document defines
the *target*; the roadmap tracks *status*.

---

## 14. Open architectural decisions

1. **Per-landlord M-Pesa credentials** for true multi-landlord SaaS (see §8).
2. **Automation host:** DirectAdmin cron → protected endpoint vs Supabase
   pg_cron/Edge Functions.
3. **Payments provider for plan upgrades** (subscriptions are display-only today).
4. **Storage** for business logos / future documents (Supabase Storage bucket +
   policies).
