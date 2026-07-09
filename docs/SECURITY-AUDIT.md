# CribFlow — End-to-End Security Audit (T16)

Audit of every connection from browser → services, and the control protecting it.
Status at redesign time. ✅ verified in code · ⚠️ recommendation.

## Connection map & protections

| # | Connection | Protection | Status |
|---|---|---|---|
| 1 | Browser → Supabase (CRUD) | HTTPS + **RLS on every table** (ownership joins on `auth.uid()`); anon key is public-safe | ✅ |
| 2 | Browser → Backend (`/api/email/*`) | HTTPS + **JWT** (`requireAuth`) + **resource-ownership re-check** (IDOR-safe) | ✅ |
| 3 | Backend → Supabase | **service-role key backend-only**, never shipped to client; `SECURITY DEFINER` fns fixed `search_path` | ✅ |
| 4 | Safaricom → Backend callbacks | **shortcode-scoped matching**, idempotent on `TransID`, **IP allowlist** + **rate limit**, always-ack | ✅ |
| 5 | Backend admin (`register-urls`,`simulate`) | **`ADMIN_TOKEN`** bearer; `simulate` blocked in production | ✅ |
| 6 | Cron → Backend (`/api/jobs/*`) | **`CRON_TOKEN`** header (401 without) | ✅ |
| 7 | Backend → SMTP | domain mailbox creds in env only; **never stored** in DB | ✅ |
| 8 | M-Pesa connect (landlord creds) | over TLS+JWT; **consumer secret used once, never persisted/logged** | ✅ |
| 9 | Transport | Let's Encrypt TLS on `crib.` + `crib-api.`; **CORS locked** to `FRONTEND_URL` (204 preflight verified) | ✅ |
| 10 | Session | **10-min inactivity auto sign-out** (T15) | ✅ |
| 11 | Rendering | `escapeHtml` on dynamic content; toasts/confirm now escape (T2); no inline `onclick(JSON)` | ✅ |
| 12 | Financial records | **soft-delete only** (no client hard-delete; FKs `ON DELETE RESTRICT`) | ✅ |

## Verified this pass
- **No secrets in git**: no `config.js`/`.env` tracked; only `.env.example` placeholders + a help-text sample in `settings.js`.
- **Backend guards present**: `trust proxy`, `securityHeaders`, `rateLimiter`, `ipAllowlist`, `requireAuth`, `requireAdmin`, `requireCron`.
- **CORS**: preflight from `crib.flows.co.ke` → API returns 204; other origins refused.

## Fixes applied
- **Frontend security headers** via `frontend/.htaccess` (the static site is served by Apache, not Express): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, **HSTS**, force-HTTPS, `config.js` no-cache, long-cache for static assets.

## Recommendations (not blocking)
- ⚠️ **CSP**: add a tuned Content-Security-Policy once inline scripts/CDN hosts (supabase-js, chart.js, Google Fonts) are allow-listed and tested — omitted now to avoid breakage.
- ⚠️ **Rotate** the `info@flows.co.ke` mailbox password (a weak one was shared during setup).
- ⚠️ **Supabase Pro + PITR** before real tenant data / money (Free = no backups).
- ⚠️ Fill `MPESA_ALLOWED_IPS` with Safaricom's ranges for defense-in-depth on the callback.

**Verdict:** end-to-end connections are well protected. No exposed secrets, RLS + JWT + token guards enforce every path, transport is TLS+CORS-locked, and the frontend now sets its own hardening headers.
