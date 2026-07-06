/**
 * Notification helpers shared by the on-demand email routes and the cron jobs,
 * so both send identical messages and write the same audit log.
 */
const supabase = require('./supabase');
const mailer = require('./mailer');

function monthName(m) {
  return ['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1];
}
function formatMoney(n) { return 'KSh ' + Number(n).toLocaleString('en-KE'); }

/**
 * Send an overdue reminder for a bill.
 * @param bill   bill row joined with tenants(full_name,email) and
 *               rooms(name, properties(name, account_prefix, user_id))
 * @param profile landlord profile (paybill_number, business_name, full_name)
 */
async function sendReminderForBill(bill, profile) {
  if (!bill?.tenants?.email) throw new Error('Tenant has no email');

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
    user_id: bill.rooms.properties.user_id,
    tenant_id: bill.tenant_id,
    bill_id: bill.id,
    recipient_email: bill.tenants.email,
    email_type: 'reminder',
    subject: `Friendly reminder: ${formatMoney(bill.balance)} outstanding`,
    status: 'sent',
    sent_at: new Date().toISOString(),
  });
}

module.exports = { sendReminderForBill };
