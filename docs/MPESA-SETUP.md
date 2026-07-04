# M-Pesa (Daraja C2B) Setup

How to connect CribFlow to Safaricom's Daraja API so tenant Paybill payments
appear automatically in the app and match to the right tenant.

CribFlow uses the **C2B** flow: tenants pay your Paybill using **`PREFIX-UNIT`**
as the account number (e.g. `SRC-A1`). Safaricom then calls your backend's
**validation** and **confirmation** URLs; the backend records the payment and
matches it to the tenant.

---

## 0. What you need
- A Daraja account + an App (gives **Consumer Key** + **Consumer Secret**).
- A shortcode: sandbox `174379` for testing, or your real **Paybill** for live.
- The backend deployed at a **public HTTPS URL** (or `ngrok` for local testing) —
  Safaricom can only call publicly reachable HTTPS endpoints.

---

## 1. Get Daraja credentials
1. Sign in at <https://developer.safaricom.co.ke>.
2. **My Apps → Create App** (enable Lipa Na M-Pesa / C2B products).
3. Copy the app's **Consumer Key** and **Consumer Secret**.

---

## 2. Configure the backend `.env`
```env
MPESA_ENV=sandbox                 # "production" once approved
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_SHORTCODE=174379            # sandbox, or your real Paybill
MPESA_VALIDATION_URL=https://api.YOURDOMAIN/api/mpesa/validation
MPESA_CONFIRMATION_URL=https://api.YOURDOMAIN/api/mpesa/confirmation
```
Also set the landlord's Paybill in the app: **Settings → M-Pesa → Paybill /
Till number** (this is what confirmation matching will scope by).

> Local testing: run `ngrok http 3000` and use the `https://…ngrok…` URL for the
> validation/confirmation URLs.

Start the backend: `npm install && npm start` (health check at `/health`).

---

## 3. Register your URLs with Safaricom (once)
This tells Safaricom where to send C2B callbacks. Run **once** after each URL
change:
```bash
curl -X POST https://api.YOURDOMAIN/api/mpesa/register-urls
```
Expected: a success response from Safaricom. `ResponseType` is `Completed`, so a
payment is still processed even if validation is skipped.

> ⚠️ Secure this endpoint before production — it currently has no auth (Phase 2).
> Anyone who can reach it could re-point your callbacks.

> ℹ️ **External validation** (the validation URL being called at all) must be
> explicitly enabled by Safaricom on your production shortcode. Until then only
> the **confirmation** URL fires — which is enough for CribFlow to record
> payments. Don't block go-live waiting on validation.

---

## 4. Test in sandbox
Simulate a tenant payment:
```bash
curl -X POST https://api.YOURDOMAIN/api/mpesa/simulate \
  -H 'Content-Type: application/json' \
  -d '{"amount": 1000, "phone": "254708374149", "accountNumber": "SRC-A1"}'
```
Then check the app's **Payments** page:
- **Matched** → the tenant for `SRC-A1` gets a payment, their bill updates.
- **Unmatched** → appears in the "Unmatched M-Pesa" queue to match by hand
  (happens when the account number doesn't resolve to an active tenant).

Make sure a matching property (`account_prefix = SRC`) with room `A1` and an
active tenant exists first, or the payment will land in the unmatched queue.

---

## 5. Go live
1. In Daraja, take the app through **Go Live** approval for your real Paybill.
2. Set `MPESA_ENV=production` and the real `MPESA_SHORTCODE` in `.env`; restart.
3. Re-run the **register-urls** call against production.
4. Do one small real payment end-to-end and confirm it matches.

---

## 6. How matching works (and a caveat)
- Account format is `PREFIX-UNIT`. The backend uppercases/trims it, finds the
  property by prefix and the room by name, then the room's active tenant.
- The payment is inserted; the DB allocation engine applies it to the tenant's
  open bills oldest-first (see `docs/ARCHITECTURE.md` §5).
- **Planned hardening (Phase 2):** scope matching by `BusinessShortCode` →
  the landlord whose Paybill matches, *then* prefix+room. This prevents a
  payment from ever matching another landlord who happens to use the same prefix.

---

## 7. Multi-landlord note
The backend today holds **one** set of Daraja credentials in `.env`, so it serves
**one** Paybill. Onboarding multiple landlords with their own Paybills will
require storing per-landlord Daraja credentials and routing confirmations by
shortcode. See `docs/ARCHITECTURE.md` §8. Fine for the first landlord now.
