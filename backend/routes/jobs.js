/**
 * Scheduled jobs — triggered by DirectAdmin cron (curl) with a secret token.
 *
 *   POST /api/jobs/apply-late-fees   — accrue late fees on overdue bills
 *   POST /api/jobs/send-reminders    — email overdue-bill reminders
 *
 * Auth: header  X-Cron-Token: <CRON_TOKEN from .env>
 * These run with the service-role client (all landlords), so they are guarded
 * by a shared secret, not a user JWT.
 */
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const notify = require('../services/notify');

function requireCron(req, res, next) {
  const token = process.env.CRON_TOKEN;
  if (!token) return res.status(503).json({ error: 'Jobs disabled (CRON_TOKEN not set)' });
  if ((req.headers['x-cron-token'] || '') !== token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/* =============================================================================
   Accrue late fees across all landlords (service role => auth.uid() is null =>
   fn_apply_late_fees processes everyone). One-time per bill; idempotent.
   ============================================================================= */
router.post('/apply-late-fees', requireCron, async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('fn_apply_late_fees');
    if (error) throw error;
    console.log(`[jobs] apply-late-fees charged ${data} bill(s)`);
    res.json({ success: true, charged: data });
  } catch (err) {
    console.error('[jobs] apply-late-fees error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =============================================================================
   Generate this month's bills for all active tenants who don't have one yet.
   Optional body: { month, year, due_day } — defaults to the current month and
   a due day of 5. Idempotent (skips tenants already billed for the period).
   ============================================================================= */
router.post('/generate-bills', requireCron, async (req, res) => {
  try {
    const now = new Date();
    const month = Number(req.body?.month) || (now.getMonth() + 1);
    const year = Number(req.body?.year) || now.getFullYear();
    const dueDay = Math.min(28, Math.max(1, Number(req.body?.due_day) || 5));
    const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

    const { data, error } = await supabase.rpc('fn_generate_monthly_bills', {
      p_month: month, p_year: year, p_due_date: dueDate, p_user_id: null,
    });
    if (error) throw error;
    console.log(`[jobs] generate-bills ${month}/${year} created ${data} bill(s)`);
    res.json({ success: true, generated: data, period: `${month}/${year}`, due_date: dueDate });
  } catch (err) {
    console.error('[jobs] generate-bills error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* =============================================================================
   Email reminders for overdue bills. For each landlord, a bill is due for a
   reminder once today >= due_date + reminder_days, and we don't re-send if a
   reminder was already logged for it in the last 7 days.
   ============================================================================= */
router.post('/send-reminders', requireCron, async (req, res) => {
  try {
    const { data: bills, error } = await supabase
      .from('bills')
      .select(`id, tenant_id, bill_month, bill_year, balance, due_date,
               tenants(full_name, email),
               rooms(name, properties(name, account_prefix, user_id))`)
      .in('status', ['unpaid', 'partial'])
      .gt('balance', 0);
    if (error) throw error;

    const candidates = (bills || []).filter(b => b.tenants?.email && b.rooms?.properties?.user_id);
    if (candidates.length === 0) return res.json({ success: true, sent: 0, skipped: 0 });

    // Landlord profiles (reminder_days + branding) in one fetch
    const userIds = [...new Set(candidates.map(b => b.rooms.properties.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, reminder_days, paybill_number, business_name, full_name')
      .in('id', userIds);
    const profById = Object.fromEntries((profiles || []).map(p => [p.id, p]));

    // Bills reminded in the last 7 days — skip those
    const sevenDaysAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data: recent } = await supabase
      .from('email_logs')
      .select('bill_id')
      .eq('email_type', 'reminder')
      .gte('sent_at', sevenDaysAgo);
    const recentlyReminded = new Set((recent || []).map(r => r.bill_id));

    const now = Date.now();
    let sent = 0, skipped = 0, failed = 0;

    for (const bill of candidates) {
      const profile = profById[bill.rooms.properties.user_id];
      const graceDays = Number(profile?.reminder_days ?? 5);
      const dueMs = new Date(bill.due_date).getTime() + graceDays * 864e5;
      if (now < dueMs || recentlyReminded.has(bill.id)) { skipped++; continue; }
      try {
        await notify.sendReminderForBill(bill, profile);
        sent++;
      } catch (e) {
        failed++;
        console.error('[jobs] reminder failed', bill.id, e.message);
      }
    }

    console.log(`[jobs] send-reminders sent=${sent} skipped=${skipped} failed=${failed}`);
    res.json({ success: true, sent, skipped, failed });
  } catch (err) {
    console.error('[jobs] send-reminders error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
