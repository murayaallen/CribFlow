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
   ADMIN — Register URLs with Safaricom
   Run once after deploy.
   ============================================================================= */
router.post('/register-urls', requireAdmin, async (req, res) => {
  try {
    const result = await daraja.registerUrls();
    res.json({ success: true, result });
  } catch (err) {
    console.error('[mpesa] register-urls error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

/* =============================================================================
   ADMIN — Simulate a payment (sandbox only)
   ============================================================================= */
router.post('/simulate', requireAdmin, async (req, res) => {
  if (process.env.MPESA_ENV === 'production') {
    return res.status(403).json({ error: 'Simulate is disabled in production' });
  }
  try {
    const { amount, phone, accountNumber } = req.body;
    if (!amount || !phone || !accountNumber) {
      return res.status(400).json({ error: 'amount, phone, accountNumber required' });
    }
    const result = await daraja.simulateC2B({ amount, phone, accountNumber });
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
