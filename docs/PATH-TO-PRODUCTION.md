# CribFlow — Path to Production

The full plan from where we are now to live usage. Each item has an owner-facing
task and an **acceptance check** (how we know it's done). Status is tracked in
agent memory (`rentflow-roadmap`); this file is the definitive scope.

Legend: ✅ done · 🔨 in progress · ⬜ not started

---

## 0. Snapshot — what's already done ✅
- Single git repo (`Desktop\RentFlow`), consolidated from the old copies.
- Complete DB schema + RLS for the fresh project (all tables, `subscriptions`,
  `can_add_property`, allocation engine).
- DB-side **payment allocation** (multi-bill, oldest-first, overpay→credit).
- Tenant mobile-app feature removed (deferred).
- Rebrand → **CribFlow**.
- Architecture blueprint + M-Pesa + DirectAdmin deployment + Supabase-plan docs.

---

## 1. Infrastructure & environment bring-up ⬜
Stand up the real hosts so we can deploy and test against production-like infra.
- ⬜ **Supabase Pro** project "CRIB FLOW"; run `schema.sql` + `policies.sql`;
  enable daily backups. → *Check:* signup creates a profile + free subscription;
  RLS blocks cross-account reads.
- ⬜ **DirectAdmin frontend** at `app.` with SSL; `config.js` filled; site loads,
  login works. → *Check:* can sign in and see the dashboard.
- ⬜ **DirectAdmin Node app** at `api.` with SSL + env vars; `/health` green.
  → *Check:* `https://api.…/health` returns ok.
- ⬜ Decide domain + DNS (Cloudflare optional in front of `app.`).
See `docs/DEPLOYMENT.md` and `docs/SUPABASE-PLAN.md`.

---

## 2. Phase 1 — Financial correctness (finish) 🔨
The money must be right before anything else.
- ✅ Payment allocation engine (schema + migration 001).
- ⬜ **Credit balance UI**: show `tenants.credit_balance` on tenant detail +
  dashboard; a "resolve credit" action (apply to a bill / mark refunded).
  → *Check:* an overpayment shows as credit and can be applied/refunded.
- ⬜ **Tenant running balance**: aggregate outstanding (`Σ open balances −
  credit`) on tenant detail + dashboard. → *Check:* matches manual sum.
- ⬜ **Late-fee engine**: apply `late_penalty_*` + `grace_period_days` to overdue
  bills into `bills.late_fee`/`total_due` (manual trigger first).
  → *Check:* an overdue bill past grace accrues the configured fee once.
- ⬜ **Reconciliation sanity**: a spec/checklist of allocation cases
  (exact pay, partial, overpay, multi-bill, delete-payment) verified on the live
  project. → *Check:* all cases produce correct balances/credit.

---

## 3. Phase 2 — Security hardening ⬜
Must land before M-Pesa is live and before real tenants' data is in.
- ⬜ **Shortcode-scoped M-Pesa matching**: match by `BusinessShortCode` →
  landlord whose `paybill_number` matches, then prefix+room. → *Check:* a payment
  can never match another landlord's tenant.
- ⬜ **Email endpoint ownership checks**: `/api/email/*` verify the bill/payment
  belongs to the JWT caller before sending/reading. → *Check:* caller can't email
  another landlord's bill.
- ⬜ **Admin endpoint auth**: protect `/api/mpesa/register-urls` + `/simulate`
  with a secret/bearer; disable `simulate` in production. → *Check:* unauthorized
  call is rejected.
- ⬜ **Callback validation**: confirmation endpoint validates the configured
  shortcode; (optional) Safaricom IP allowlist. → *Check:* forged callback with
  wrong shortcode is ignored.
- ⬜ **CORS lockdown**: restrict to `FRONTEND_URL` (drop `*`/credentials combo).
- ⬜ **Soft-delete financial records**: stop hard FK-cascade loss of
  bills/payments (use status/`archived`). → *Check:* removing a tenant preserves
  their payment history.
- ⬜ **Security review** pass over auth, RLS, secrets. → *Check:* `/security-review`
  clean or issues triaged.

---

## 4. Phase 3 — Wire-up & automation ⬜
Make the app actually send things and run itself.
- ⬜ **Connect email UI → backend**: "Send Bills" / receipts / reminders call
  `/api/email/*` with the JWT (not just stamp `email_sent_at`). → *Check:* a real
  email arrives and is logged in `email_logs`.
- ⬜ **Scheduled jobs** via DirectAdmin cron → protected `/api/jobs/*` (or
  Supabase pg_cron): monthly bill generation, overdue reminders, late-fee accrual.
  → *Check:* jobs run on schedule, are idempotent, and log results.
- ⬜ **Email deliverability**: consider a transactional provider (Postmark/Resend/
  SES) + SPF/DKIM on the domain. → *Check:* mail lands in inbox, not spam.

---

## 5. Phase 4 — Reliability & operations ⬜
- ⬜ **Structured logging + error tracking** (request IDs, levels; Sentry or
  similar) replacing `console.*`. → *Check:* an induced error surfaces in the
  tracker with context.
- ⬜ **Backups/PITR** verified restorable (Supabase). → *Check:* a test restore
  works.
- ⬜ **Rate limiting** on public callback + auth-adjacent endpoints.
- ⬜ **Security headers / CSP** on the static frontend.
- ⬜ **Uptime + health monitoring** (ping `/health`, DB up). → *Check:* alert
  fires when api is down.

---

## 6. Phase 5 — Efficiency & cleanup ⬜
- ⬜ Shared JS module — remove duplicated `renderStat`/`formatMoney`/stat-card.
- ⬜ Replace inline `onclick="fn(${JSON.stringify(x)})"` with data-attrs +
  delegated listeners (removes HTML-injection risk).
- ⬜ Fix N+1 (M-Pesa matching join; dashboard duplicate tenant fetch).
- ⬜ Optional: bundling/minify + cache headers.

---

## 7. QA & launch readiness ⬜
- ⬜ **End-to-end test script**: signup → add property/rooms/tenant → water
  reading → generate bill → tenant pays (M-Pesa sandbox) → auto-match → receipt.
  → *Check:* full happy path passes on staging.
- ⬜ **Edge cases**: overpay, partial, multi-bill, unmatched payment, move-out
  with balance, plan limit reached.
- ⬜ **Cross-device/browser** + mobile layout + dark mode.
- ⬜ **Data seeding** for the first real landlord (you).
- ⬜ **Rollback plan** documented (restore backup + redeploy previous commit).

---

## 8. Go-live checklist ⬜
- ⬜ Supabase Pro, backups + PITR on; email confirmations decision made.
- ⬜ `config.js` (prod URLs) + backend env (service key, Daraja **production**,
  SMTP) set; **no secrets in git**.
- ⬜ SSL valid on `app.` and `api.`; CORS locked; admin endpoints protected.
- ⬜ M-Pesa production go-live approved; URLs registered; one real payment tested.
- ⬜ Monitoring + error tracking live; logs flowing.
- ⬜ Old on-disk copies under `Desktop\Rent Flow\` deleted once new setup verified.
- ⬜ Smoke test in production; then announce.

---

## 9. Post-launch (ongoing)
- Watch error tracker + M-Pesa unmatched queue daily for the first weeks.
- Weekly backup-restore confidence check (first month).
- Roadmap items: per-landlord M-Pesa credentials (multi-landlord SaaS),
  plan-upgrade payments, SMS, reports/exports, tenant mobile app (deferred).

---

## Critical path (shortest route to a safe live launch)
1. Infra bring-up (§1) →
2. Finish Phase 1 money correctness (§2) →
3. Phase 2 security — *especially* shortcode matching + email ownership + admin
   auth (§3) →
4. Wire email + basic automation (§4) →
5. Logging/backups/monitoring (§5 minimal) →
6. QA happy-path + edge cases (§7) →
7. Go-live checklist (§8).

Efficiency cleanup (Phase 5) and nice-to-haves can trail the launch.
