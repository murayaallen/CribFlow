/**
 * Email routes.
 *   POST /api/email/bill         — send a single bill
 *   POST /api/email/receipt      — send a payment receipt
 *   POST /api/email/reminder     — send overdue reminder
 *   POST /api/email/bulk-bills   — send all bills for a period
 */
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabase');
const mailer = require('../services/mailer');

/* =============================================================================
   AUTH MIDDLEWARE — verify Supabase JWT
   ============================================================================= */
async function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = auth.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.user = data.user;
  next();
}

/* =============================================================================
   SEND A BILL
   ============================================================================= */
router.post('/bill', requireAuth, async (req, res) => {
  try {
    const { bill_id } = req.body;
    if (!bill_id) return res.status(400).json({ error: 'bill_id required' });

    const { data: bill, error } = await supabase
      .from('bills')
      .select(`*, tenants(full_name, email),
                 rooms(name, properties(name, account_prefix, user_id))`)
      .eq('id', bill_id)
      .single();

    if (error || !bill) return res.status(404).json({ error: 'Bill not found' });
    if (!bill.tenants?.email) return res.status(400).json({ error: 'Tenant has no email' });

    // Get profile for paybill + business name
    const { data: profile } = await supabase.from('profiles').select('*')
      .eq('id', bill.rooms.properties.user_id).single();

    const accountNumber = `${bill.rooms.properties.account_prefix}-${bill.rooms.name}`;
    const breakdown = [
      { label: 'Rent', amount: Number(bill.rent_amount).toLocaleString('en-KE') },
    ];
    if (Number(bill.water_amount) > 0) breakdown.push({ label: 'Water', amount: Number(bill.water_amount).toLocaleString('en-KE') });
    if (Number(bill.other_charges) > 0) breakdown.push({ label: bill.other_charges_description || 'Other charges', amount: Number(bill.other_charges).toLocaleString('en-KE') });
    if (Number(bill.late_fee) > 0) breakdown.push({ label: 'Late fee', amount: Number(bill.late_fee).toLocaleString('en-KE') });

    const period = monthName(bill.bill_month) + ' ' + bill.bill_year;
    const html = mailer.billTemplate({
      tenantName: bill.tenants.full_name,
      period,
      total: Number(bill.total_due).toLocaleString('en-KE'),
      dueDate: new Date(bill.due_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }),
      breakdown,
      accountNumber,
      paybillNumber: profile?.paybill_number,
      businessName: profile?.business_name || profile?.full_name || 'Property Manager',
    });

    await mailer.sendEmail({
      to: bill.tenants.email,
      subject: `Your rent bill for ${period} — ${formatMoney(bill.total_due)} due`,
      html,
    });

    // Mark sent + log
    await supabase.from('bills').update({ email_sent_at: new Date().toISOString() }).eq('id', bill_id);
    await supabase.from('email_logs').insert({
      user_id: req.user.id,
      tenant_id: bill.tenant_id,
      bill_id: bill.id,
      recipient_email: bill.tenants.email,
      email_type: 'bill',
      subject: `Your rent bill for ${period}`,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[email/bill] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =============================================================================
   SEND A RECEIPT
   ============================================================================= */
router.post('/receipt', requireAuth, async (req, res) => {
  try {
    const { payment_id } = req.body;
    if (!payment_id) return res.status(400).json({ error: 'payment_id required' });

    const { data: payment } = await supabase
      .from('payments')
      .select(`*, tenants(full_name, email), rooms(properties(user_id))`)
      .eq('id', payment_id)
      .single();

    if (!payment || !payment.tenants?.email) {
      return res.status(400).json({ error: 'Payment or tenant email missing' });
    }

    const { data: profile } = await supabase.from('profiles').select('*')
      .eq('id', payment.rooms.properties.user_id).single();

    const html = mailer.receiptTemplate({
      tenantName: payment.tenants.full_name,
      amount: Number(payment.amount).toLocaleString('en-KE'),
      method: payment.method.toUpperCase(),
      code: payment.mpesa_code || payment.reference,
      date: new Date(payment.payment_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }),
      businessName: profile?.business_name || profile?.full_name || 'Property Manager',
    });

    await mailer.sendEmail({
      to: payment.tenants.email,
      subject: `Payment received — ${formatMoney(payment.amount)}`,
      html,
    });

    await supabase.from('email_logs').insert({
      user_id: req.user.id,
      tenant_id: payment.tenant_id,
      payment_id: payment.id,
      recipient_email: payment.tenants.email,
      email_type: 'receipt',
      subject: `Payment received — ${formatMoney(payment.amount)}`,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[email/receipt] error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =============================================================================
   SEND A REMINDER
   ============================================================================= */
router.post('/reminder', requireAuth, async (req, res) => {
  try {
    const { bill_id } = req.body;
    if (!bill_id) return res.status(400).json({ error: 'bill_id required' });

    const { data: bill } = await supabase
      .from('bills')
      .select(`*, tenants(full_name, email),
                 rooms(name, properties(name, account_prefix, user_id))`)
      .eq('id', bill_id)
      .single();

    if (!bill || !bill.tenants?.email) {
      return res.status(400).json({ error: 'Bill or tenant email missing' });
    }
    if (Number(bill.balance) <= 0) return res.status(400).json({ error: 'Bill is already paid' });

    const { data: profile } = await supabase.from('profiles').select('*')
      .eq('id', bill.rooms.properties.user_id).single();

    const dueDate = new Date(bill.due_date);
    const daysOverdue = Math.max(0, Math.ceil((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    const accountNumber = `${bill.rooms.properties.account_prefix}-${bill.rooms.name}`;
    const period = monthName(bill.bill_month) + ' ' + bill.bill_year;

    const html = mailer.reminderTemplate({
      tenantName: bill.tenants.full_name,
      period,
      balance: Number(bill.balance).toLocaleString('en-KE'),
      dueDate: dueDate.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }),
      daysOverdue,
      accountNumber,
      paybillNumber: profile?.paybill_number,
      businessName: profile?.business_name || profile?.full_name || 'Property Manager',
    });

    await mailer.sendEmail({
      to: bill.tenants.email,
      subject: `Friendly reminder: ${formatMoney(bill.balance)} outstanding for ${period}`,
      html,
    });

    await supabase.from('email_logs').insert({
      user_id: req.user.id,
      tenant_id: bill.tenant_id,
      bill_id: bill.id,
      recipient_email: bill.tenants.email,
      email_type: 'reminder',
      subject: `Friendly reminder: ${formatMoney(bill.balance)} outstanding`,
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[email/reminder] error:', err);
    res.status(500).json({ error: err.message });
  }
});

function monthName(m) {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][m-1];
}
function formatMoney(n) { return 'KSh ' + Number(n).toLocaleString('en-KE'); }

module.exports = router;
