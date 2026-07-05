# CribFlow — Supabase Plan & Scaling

## Why paid (and why Free bit us)
The Free tier **pauses projects after ~1 week of inactivity** (that's what
happened to the old project) and has **no daily backups / no PITR**. For a
product that stores money records, that's a non-starter for production.

## Recommendation: start on **Pro (~$25/mo)**
Pro gives what CribFlow actually needs day one:
- **No auto-pause** — the app is always available.
- **Daily backups** (7-day retention) — recover from mistakes.
- Larger DB + more compute/connections included; email support.
- **PITR add-on** available — enable before real money flows (point-in-time
  restore to the second).

That's the minimum responsible baseline. Enterprise/Team tiers aren't needed
until much later.

## What "scaling" actually costs us — and why it's cheap here
CribFlow's architecture is naturally scalable on Supabase:
- **The browser and backend talk to Postgres over the REST API (PostgREST) via
  supabase-js**, not raw Postgres connections. PostgREST pools connections, so
  we don't burn the raw connection cap per user. Thousands of landlords can use
  the REST layer without connection exhaustion.
- **RLS** does tenant isolation in the database — no per-tenant infra.
- We already have the **right indexes** (per-user/property/room/period) so
  queries stay fast as data grows.

So scaling is mostly: stay on Pro, and only add compute when metrics say so.

## Cost-control / scaling levers (in order)
1. **Pro plan** — baseline. Turn on daily backups; add **PITR** before go-live.
2. **Connection pooler (Supavisor)** — use the pooled connection string for any
   direct Postgres access (e.g. migrations, cron jobs). The app's REST usage
   already pools.
3. **Compute add-on** — bump the instance size only when CPU/RAM metrics justify
   it (watch the dashboard). Don't pre-buy.
4. **CDN in front of the static frontend** (Cloudflare) — offloads all static
   traffic from origin; near-zero DB impact.
5. **Archive/partition** old bills/payments if volume ever gets huge (years out).
6. **Storage** (logos/docs) → Supabase Storage bucket with policies; cheap.

## Action items
- [ ] Create Supabase project "CRIB FLOW" on **Pro**, region near Kenya.
- [ ] Run `schema.sql` → `policies.sql`.
- [ ] Enable daily backups; schedule PITR before real payments.
- [ ] Capture Project URL + anon key + service_role key into config/env.
- [ ] Note the **pooled** connection string for cron/migrations.
