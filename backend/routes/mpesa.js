/**
 * M-Pesa Daraja routes.
 *
 *   POST /api/mpesa/validation     ← Safaricom calls before transaction
 *   POST /api/mpesa/confirmation   ← Safaricom calls after transaction succeeds
 *   POST /api/mpesa/register-urls  ← Admin: register URLs with Safaricom
 *   POST /api/mpesa/simulate       ← Admin: simulate a payment (sandbox only)
 */
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const daraja = require('../services/daraja');
const { ipAllowlist, rateLimiter } = require('../middleware/security');
const { requireAuth } = require('../middleware/auth');

// Public Safaricom callbacks: optional IP allowlist (MPESA_ALLOWED_IPS) +
// a rate limit so the endpoints can't be flooded with forged payments.
const callbackGuard = [
  ipAllowlist('MPESA_ALLOWED_IPS'),
  rateLimiter({ windowMs: 60_000, max: 120, name: 'mpesa-callback' }),
];

/* =============================================================================
   VALIDATION — Safaricom asks "should I accept this payment?"
   Respond within 10 seconds. ResultCode 0 = accept, anything else = reject.
   ============================================================================= */
router.post('/validation', callbackGuard, async (req, res) => {
  console.log('[mpesa] validation:', JSON.stringify(req.body));
  // Always accept — match logic happens in confirmation
  res.json({
    ResultCode: 0,
    ResultDesc: 'Accepted',
  });
});

/* =============================================================================
   CONFIRMATION — Safaricom tells us a payment has been received
   We:
     1. Insert into mpesa_transactions (idempotent on TransID)
     2. Try to match account number → tenant
     3. If matched, create payment row (trigger updates bill status)
   ============================================================================= */
router.post('/confirmation', callbackGuard, async (req, res) => {
  // Always respond OK to Safaricom — even if our processing fails (we'll log and retry)
  res.json({ ResultCode: 0, ResultDesc: 'Confirmation received' });

  try {
    const payload = req.body || {};
    const transId = payload.TransID;
    if (!transId) {
      console.warn('[mpesa] confirmation missing TransID:', payload);
      return;
    }

    const accountNumber = (payload.BillRefNumber || '').toString().trim().toUpperCase();
    const amount = parseFloat(payload.TransAmount || 0);
    const phone = payload.MSISDN;
    const transactionTime = parseTransactionTime(payload.TransTime);

    // Idempotency: skip if we've already recorded this transaction
    const { data: existing } = await supabase
      .from('mpesa_transactions')
      .select('id')
      .eq('transaction_id', transId)
      .maybeSingle();
    if (existing) {
      console.log(`[mpesa] duplicate TransID ${transId} ignored`);
      return;
    }

    // ---- MATCHING (scoped by the paybill the money was actually paid to) ----
    // 1. Identify the landlord by BusinessShortCode == profiles.paybill_number.
    //    This is the correct disambiguator: a payment can only ever match a
    //    tenant belonging to the landlord who received it. Never match across
    //    landlords by account prefix alone (prefixes aren't globally unique).
    const businessShortcode = (payload.BusinessShortCode || '').toString().trim();
    let matchedUserId = null;
    let landlordPrefix = '';                       // profile-level fallback prefix
    if (businessShortcode) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, account_prefix')
        .eq('paybill_number', businessShortcode)
        .maybeSingle();
      if (profile) {
        matchedUserId = profile.id;
        landlordPrefix = (profile.account_prefix || '').toUpperCase();
      } else {
        console.warn(`[mpesa] no landlord for shortcode ${businessShortcode} (tx ${transId})`);
      }
    }

    // 2. Within that landlord only, match account (PREFIX-ROOM) → room → active tenant.
    let matchedTenant = null;
    if (matchedUserId && accountNumber.includes('-')) {
      const [prefixRaw, ...roomParts] = accountNumber.split('-');
      const prefix = prefixRaw.toUpperCase();
      const roomName = roomParts.join('-');

      const { data: properties } = await supabase
        .from('properties')
        .select('id, account_prefix')
        .eq('user_id', matchedUserId);

      // A property's effective prefix is its own, or the landlord's profile prefix.
      const candidates = (properties || []).filter(p =>
        ((p.account_prefix || landlordPrefix || '').toUpperCase()) === prefix
      );

      for (const prop of candidates) {
        const { data: rooms } = await supabase
          .from('rooms')
          .select('id, name, tenants(id, full_name, status)')
          .eq('property_id', prop.id)
          .ilike('name', roomName);
        const room = (rooms || [])[0];
        if (room) {
          const activeTenant = (room.tenants || []).find(t => t.status === 'active');
          if (activeTenant) {
            matchedTenant = { ...activeTenant, room_id: room.id };
            break;
          }
        }
      }
    }

    // Insert M-Pesa transaction record
    const { data: mpesaTx, error: insertErr } = await supabase
      .from('mpesa_transactions')
      .insert({
        user_id: matchedUserId,
        transaction_id: transId,
        transaction_type: payload.TransactionType,
        amount,
        phone_number: phone,
        first_name: payload.FirstName,
        middle_name: payload.MiddleName,
        last_name: payload.LastName,
        account_number: accountNumber,
        business_shortcode: payload.BusinessShortCode,
        transaction_time: transactionTime,
        matched: !!matchedTenant,
        raw_payload: payload,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[mpesa] insert tx error:', insertErr);
      return;
    }

    // If matched, create payment record (DB trigger updates bill status)
    if (matchedTenant) {
      // Find oldest unpaid bill
      const { data: bills } = await supabase
        .from('bills')
        .select('id')
        .eq('tenant_id', matchedTenant.id)
        .gt('balance', 0)
        .order('bill_year').order('bill_month')
        .limit(1);

      const billId = bills?.[0]?.id || null;

      const { data: payment, error: payErr } = await supabase
        .from('payments')
        .insert({
          tenant_id: matchedTenant.id,
          room_id: matchedTenant.room_id,
          bill_id: billId,
          amount,
          method: 'mpesa',
          mpesa_code: transId,
          payment_date: transactionTime,
          recorded_by: 'auto',
        })
        .select()
        .single();

      if (payErr) {
        console.error('[mpesa] payment insert error:', payErr);
      } else {
        // Link mpesa_transaction → payment
        await supabase
          .from('mpesa_transactions')
          .update({ payment_id: payment.id })
          .eq('id', mpesaTx.id);
        console.log(`[mpesa] auto-matched ${transId} → ${matchedTenant.full_name} (${formatMoney(amount)})`);
      }
    } else {
      console.log(`[mpesa] unmatched ${transId} (${accountNumber}) — needs manual review`);
    }
  } catch (err) {
    console.error('[mpesa] confirmation error:', err);
  }
});

/* =============================================================================
   ADMIN AUTH — require a secret bearer token (ADMIN_TOKEN in .env).
   Protects the endpoints that talk to Safaricom on our behalf.
   ============================================================================= */
function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'Admin endpoints disabled (ADMIN_TOKEN not set)' });
  }
  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${token}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/* =============================================================================
   LANDLORD — Connect a paybill (multi-landlord onboarding).
   The landlord provides their paybill + Daraja Consumer Key/Secret. We register
   the shared platform callback URL for their shortcode, store the connection
   state (NOT the secret), and set profiles.paybill_number so incoming payments
   route to them. Receiving payments afterwards needs no credentials.
   ============================================================================= */
router.post('/connect', requireAuth, async (req, res) => {
  try {
    const { paybill, consumerKey, consumerSecret } = req.body;
    const environment = req.body.environment === 'production' ? 'production' : 'sandbox';
    if (!paybill || !consumerKey || !consumerSecret) {
      return res.status(400).json({ error: 'paybill, consumerKey and consumerSecret are required' });
    }
    const confirmationUrl = process.env.MPESA_CONFIRMATION_URL;
    const validationUrl = process.env.MPESA_VALIDATION_URL;
    if (!confirmationUrl) {
      return res.status(503).json({ error: 'Platform callback URL not configured (MPESA_CONFIRMATION_URL)' });
    }

    // A paybill can only belong to one landlord
    const { data: taken } = await supabase.from('profiles')
      .select('id').eq('paybill_number', paybill).neq('id', req.user.id).maybeSingle();
    if (taken) return res.status(409).json({ error: 'That paybill is already connected to another account' });

    // Register the callback URL for this landlord's shortcode
    let status = 'registered', lastError = null, result = null;
    try {
      result = await daraja.registerUrls({
        consumerKey, consumerSecret, environment,
        shortcode: paybill, validationUrl, confirmationUrl,
      });
    } catch (err) {
      status = 'failed';
      lastError = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    }

    // Persist connection state (secret is NOT stored) + set the matching key
    await supabase.from('landlord_mpesa').upsert({
      user_id: req.user.id,
      paybill_number: paybill,
      consumer_key: consumerKey,
      environment,
      registration_status: status,
      registered_at: status === 'registered' ? new Date().toISOString() : null,
      last_error: lastError,
    });
    await supabase.from('profiles').update({ paybill_number: paybill }).eq('id', req.user.id);

    if (status === 'failed') {
      return res.status(502).json({ error: 'Safaricom URL registration failed', details: lastError });
    }
    res.json({ success: true, registration_status: status, result });
  } catch (err) {
    console.error('[mpesa] connect error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* Landlord — current M-Pesa connection status (no secret ever returned). */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from('landlord_mpesa')
      .select('paybill_number, environment, registration_status, registered_at, last_error')
      .eq('user_id', req.user.id).maybeSingle();
    res.json(data || { registration_status: 'unregistered', paybill_number: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Landlord — disconnect their paybill. */
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    await supabase.from('landlord_mpesa').delete().eq('user_id', req.user.id);
    await supabase.from('profiles').update({ paybill_number: null }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* =============================================================================
   ADMIN — Simulate a C2B payment (sandbox only). Credentials come in the body
   since we don't store secrets. Requires ADMIN_TOKEN.
   ============================================================================= */
router.post('/simulate', requireAdmin, async (req, res) => {
  try {
    const { consumerKey, consumerSecret, shortcode, amount, phone, accountNumber } = req.body;
    const environment = req.body.environment === 'production' ? 'production' : 'sandbox';
    if (!consumerKey || !consumerSecret || !shortcode || !amount || !phone || !accountNumber) {
      return res.status(400).json({ error: 'consumerKey, consumerSecret, shortcode, amount, phone, accountNumber required' });
    }
    const result = await daraja.simulateC2B({ consumerKey, consumerSecret, environment, shortcode, amount, phone, accountNumber });
    res.json({ success: true, result });
  } catch (err) {
    console.error('[mpesa] simulate error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

/* ---- HELPERS ---- */
function parseTransactionTime(timeStr) {
  // Format: "20251104154823" → "2025-11-04T15:48:23Z"
  if (!timeStr || timeStr.length !== 14) return new Date().toISOString();
  const y = timeStr.slice(0, 4);
  const m = timeStr.slice(4, 6);
  const d = timeStr.slice(6, 8);
  const hh = timeStr.slice(8, 10);
  const mm = timeStr.slice(10, 12);
  const ss = timeStr.slice(12, 14);
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}+03:00`;
}
function formatMoney(n) { return 'KSh ' + Number(n).toLocaleString('en-KE'); }

module.exports = router;
