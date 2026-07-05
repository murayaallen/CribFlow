/* =============================================================================
   PAYMENTS PAGE
   Shows all payments + M-Pesa unmatched transaction queue
   ============================================================================= */

let CURRENT_TAB = 'all';
let UNMATCHED_TRANSACTIONS = [];
let ALL_PAYMENTS = [];
let LANDLORD_PROFILE = null;

(async function () {
  const user = await requireAuth();
  if (!user) return;
  await renderSidebar('payments');

  // Allow ?tab=unmatched to deep-link
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab')) CURRENT_TAB = params.get('tab');

  await loadPayments();
})();

async function loadPayments() {
  const { data: { user } } = await sb.auth.getUser();
  const [paymentsRes, unmatchedRes, profileRes] = await Promise.all([
    sb.from('payments').select(`*, tenants(full_name), rooms(name, properties(name))`)
      .order('payment_date', { ascending: false }).limit(200),
    sb.from('mpesa_transactions').select('*').eq('matched', false).order('created_at', { ascending: false }),
    sb.from('profiles').select('full_name, business_name, phone, paybill_number').eq('id', user.id).single(),
  ]);

  ALL_PAYMENTS = paymentsRes.data || [];
  UNMATCHED_TRANSACTIONS = unmatchedRes.data || [];
  LANDLORD_PROFILE = profileRes.data || {};
  renderPage(ALL_PAYMENTS, UNMATCHED_TRANSACTIONS);
}

function renderPage(payments, unmatched) {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthlyPayments = payments.filter(p => new Date(p.payment_date) >= startOfMonth);
  const monthlyTotal = monthlyPayments.reduce((s, p) => s + Number(p.amount), 0);

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <div class="page-title">Payments</div>
        <div class="page-subtitle">All recorded payments and pending M-Pesa transactions.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openManualPaymentModal()">${icon('plus')}<span>Record Payment</span></button>
      </div>
    </header>

    <section class="grid-3 section">
      ${renderStat('All-time Payments', payments.length, 'card', 'Across all tenants')}
      ${renderStat('This Month', formatMoney(monthlyTotal), 'wallet', `${monthlyPayments.length} ${monthlyPayments.length === 1 ? 'payment' : 'payments'}`)}
      ${renderStat('Unmatched M-Pesa', unmatched.length, 'alert', unmatched.length > 0 ? 'Need manual review' : 'All matched', unmatched.length > 0 ? 'warning' : '')}
    </section>

    <div class="tabs">
      <div class="tab ${CURRENT_TAB === 'all' ? 'active' : ''}" onclick="setTab('all')">All Payments</div>
      <div class="tab ${CURRENT_TAB === 'unmatched' ? 'active' : ''}" onclick="setTab('unmatched')">
        Unmatched M-Pesa
        ${unmatched.length > 0 ? `<span class="badge badge-warning" style="margin-left: 6px">${unmatched.length}</span>` : ''}
      </div>
    </div>

    ${CURRENT_TAB === 'all' ? renderPaymentsTable(payments) : renderUnmatchedTable(unmatched)}
  `;

  document.getElementById('page-content').innerHTML = html;
}

function renderPaymentsTable(payments) {
  if (payments.length === 0) return `
    <div class="card-elevated">
      <div class="empty-state">
        <div class="empty-state-icon">${icon('card')}</div>
        <h3>No payments yet</h3>
        <p>Payments will appear here as they're received via M-Pesa or recorded manually.</p>
        <button class="btn btn-primary" onclick="openManualPaymentModal()">${icon('plus')}<span>Record First Payment</span></button>
      </div>
    </div>
  `;
  return `
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th>Date</th><th>Tenant · Unit</th><th>Method</th><th>Reference</th><th>Recorded By</th><th>Amount</th><th></th>
        </tr></thead>
        <tbody>
          ${payments.map((p, idx) => `
            <tr>
              <td>${formatDateTime(p.payment_date)}</td>
              <td>
                <div style="font-weight: 500">${escapeHtml(p.tenants?.full_name || '—')}</div>
                <div style="font-size: 12px; color: var(--color-text-muted)">${escapeHtml(p.rooms?.properties?.name || '')} · Unit ${escapeHtml(p.rooms?.name || '')}</div>
              </td>
              <td><span class="badge badge-primary">${p.method.toUpperCase()}</span></td>
              <td style="font-family: var(--font-mono); font-size: 12px">${escapeHtml(p.mpesa_code || p.reference || '—')}</td>
              <td><span class="muted" style="font-size: 12px">${p.recorded_by === 'auto' ? 'M-Pesa auto' : 'Manual'}</span></td>
              <td class="numeric" style="font-weight: 600; color: var(--color-success)">+${formatMoney(p.amount)}</td>
              <td><button class="btn btn-ghost btn-sm" title="Print receipt" onclick="printReceipt(ALL_PAYMENTS[${idx}])">${icon('receipt')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUnmatchedTable(unmatched) {
  if (unmatched.length === 0) return `
    <div class="card-elevated">
      <div class="empty-state">
        <div class="empty-state-icon" style="color: var(--color-success); background: var(--color-success-bg)">${icon('checkCircle')}</div>
        <h3>All M-Pesa payments matched</h3>
        <p>Every M-Pesa payment received has been auto-matched to a tenant. You'll be alerted if any need manual review.</p>
      </div>
    </div>
  `;
  return `
    <div style="background: var(--color-warning-bg); border: 1px solid var(--color-warning-border); padding: 12px 14px; border-radius: var(--radius-md); margin-bottom: 16px; font-size: 13px; color: var(--color-warning)">
      ${icon('alert')} These M-Pesa payments couldn't be auto-matched (typically because the tenant typed an unrecognised account number). Match them manually below.
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th>Date</th><th>From</th><th>Account #</th><th>Phone</th><th>Code</th><th>Amount</th><th></th>
        </tr></thead>
        <tbody>
          ${unmatched.map((t, idx) => `
            <tr>
              <td>${formatDateTime(t.transaction_time || t.created_at)}</td>
              <td>${escapeHtml([t.first_name, t.middle_name, t.last_name].filter(Boolean).join(' ') || '—')}</td>
              <td style="font-family: var(--font-mono); font-weight: 500">${escapeHtml(t.account_number || '—')}</td>
              <td style="font-family: var(--font-mono); font-size: 12px">${escapeHtml(t.phone_number || '—')}</td>
              <td style="font-family: var(--font-mono); font-size: 12px">${escapeHtml(t.transaction_id)}</td>
              <td class="numeric" style="font-weight: 600">${formatMoney(t.amount)}</td>
              <td><button class="btn btn-primary btn-sm" onclick="openMatchModal(UNMATCHED_TRANSACTIONS[${idx}])">${icon('link')}<span>Match</span></button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function setTab(tab) { CURRENT_TAB = tab; loadPayments(); }

function renderStat(label, value, iconName, meta, accent = '') {
  const iconBg = accent === 'warning' ? 'background: var(--color-warning-bg); color: var(--color-warning);' : '';
  return `
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-label">${label}</div>
        <div class="stat-card-icon" style="${iconBg}">${icon(iconName)}</div>
      </div>
      <div class="stat-card-value numeric">${value}</div>
      <div class="stat-card-meta">${meta}</div>
    </div>
  `;
}

/* ---- MANUAL PAYMENT MODAL ---- */
async function openManualPaymentModal() {
  const { data: tenants } = await sb.from('tenants').select(`id, full_name, room_id, rooms(name, properties(name))`).eq('status', 'active').order('full_name');

  if (!tenants || tenants.length === 0) {
    showToast('No active tenants found', 'warning');
    return;
  }

  const content = `
    <div class="form-group">
      <label class="label label-required" for="mp-tenant">Tenant</label>
      <select class="select" id="mp-tenant" required>
        <option value="">— select tenant —</option>
        ${tenants.map(t => `<option value="${t.id}" data-room="${t.room_id}">${escapeHtml(t.full_name)} — ${escapeHtml(t.rooms?.properties?.name || '')} Unit ${escapeHtml(t.rooms?.name || '')}</option>`).join('')}
      </select>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="label label-required" for="mp-amount">Amount</label>
        <div class="input-prefix-wrap">
          <span class="input-prefix">KSh</span>
          <input class="input" id="mp-amount" type="number" min="1" step="100" required />
        </div>
      </div>
      <div class="form-group">
        <label class="label label-required" for="mp-method">Method</label>
        <select class="select" id="mp-method" required>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="bank">Bank Transfer</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>

    <div class="form-group" id="mp-mpesa-wrap" style="display: none">
      <label class="label" for="mp-code">M-Pesa transaction code</label>
      <input class="input" id="mp-code" placeholder="e.g. QJ7X3K9P1L" style="text-transform: uppercase" />
    </div>

    <div class="form-group">
      <label class="label" for="mp-ref">Reference / Notes</label>
      <input class="input" id="mp-ref" placeholder="Receipt number, bank ref, notes" />
    </div>

    <div class="form-group">
      <label class="label label-required" for="mp-date">Payment date</label>
      <input class="input" id="mp-date" type="date" required value="${new Date().toISOString().split('T')[0]}" />
    </div>

    <div style="background: var(--color-info-bg); padding: 10px 14px; border-radius: var(--radius-md); font-size: 12px; color: var(--color-info)">
      ${icon('info')} Payment will be applied to the oldest unpaid bill first.
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-mp">Cancel</button>
    <button class="btn btn-primary" id="save-mp">${icon('check')}<span>Record Payment</span></button>
  `;

  const { close } = openModal(content, { title: 'Record manual payment', footer, size: 'lg' });

  document.getElementById('mp-method').addEventListener('change', (e) => {
    document.getElementById('mp-mpesa-wrap').style.display = e.target.value === 'mpesa' ? 'block' : 'none';
  });
  document.getElementById('cancel-mp').addEventListener('click', close);

  document.getElementById('save-mp').addEventListener('click', async () => {
    const tenantId = document.getElementById('mp-tenant').value;
    const tenantOption = document.getElementById('mp-tenant').selectedOptions[0];
    const roomId = tenantOption?.dataset.room;
    const amount = parseFloat(document.getElementById('mp-amount').value);
    const method = document.getElementById('mp-method').value;
    const code = document.getElementById('mp-code').value.trim();
    const ref = document.getElementById('mp-ref').value.trim();
    const date = document.getElementById('mp-date').value;

    if (!tenantId) { showToast('Choose a tenant', 'error'); return; }
    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

    // Find oldest unpaid bill for this tenant
    const { data: openBills } = await sb.from('bills').select('id, balance')
      .eq('tenant_id', tenantId).gt('balance', 0).order('bill_year').order('bill_month').limit(1);

    const billId = openBills?.[0]?.id || null;

    const { error } = await sb.from('payments').insert({
      tenant_id: tenantId,
      room_id: roomId,
      bill_id: billId,
      amount,
      method,
      mpesa_code: code || null,
      reference: ref || null,
      payment_date: new Date(date).toISOString(),
      recorded_by: 'manual',
    });

    if (error) { showToast(error.message, 'error'); return; }
    close();
    showToast(`Payment of ${formatMoney(amount)} recorded`, 'success');
    loadPayments();
  });
}

/* ---- MATCH UNMATCHED M-PESA TRANSACTION ---- */
async function openMatchModal(transaction) {
  const { data: tenants } = await sb.from('tenants').select(`id, full_name, room_id, rooms(name, properties(name, account_prefix))`).eq('status', 'active').order('full_name');

  const content = `
    <div style="background: var(--color-surface-2); padding: 14px; border-radius: var(--radius-md); margin-bottom: 16px">
      <div class="eyebrow" style="margin-bottom: 8px">M-Pesa Transaction</div>
      <div class="detail-list">
        <div class="detail-row"><span class="detail-label">From</span><span class="detail-value">${escapeHtml([transaction.first_name, transaction.middle_name, transaction.last_name].filter(Boolean).join(' '))}</span></div>
        <div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value" style="font-family: var(--font-mono)">${escapeHtml(transaction.phone_number || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">Account typed</span><span class="detail-value" style="font-family: var(--font-mono); font-weight: 600">${escapeHtml(transaction.account_number || '—')}</span></div>
        <div class="detail-row"><span class="detail-label">M-Pesa code</span><span class="detail-value" style="font-family: var(--font-mono)">${escapeHtml(transaction.transaction_id)}</span></div>
        <div class="detail-row"><span class="detail-label">Amount</span><span class="detail-value" style="font-weight: 600; color: var(--color-success)">${formatMoney(transaction.amount)}</span></div>
      </div>
    </div>

    <div class="form-group">
      <label class="label label-required" for="match-tenant">Match to tenant</label>
      <select class="select" id="match-tenant" required>
        <option value="">— select tenant —</option>
        ${tenants.map(t => `<option value="${t.id}" data-room="${t.room_id}">${escapeHtml(t.full_name)} — ${escapeHtml(t.rooms?.properties?.name || '')} Unit ${escapeHtml(t.rooms?.name || '')}</option>`).join('')}
      </select>
      <div class="input-help">The full amount will be applied to this tenant's oldest unpaid bill.</div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-match">Cancel</button>
    <button class="btn btn-primary" id="confirm-match">${icon('link')}<span>Match Payment</span></button>
  `;

  const { close } = openModal(content, { title: 'Match M-Pesa transaction', footer });
  document.getElementById('cancel-match').addEventListener('click', close);

  document.getElementById('confirm-match').addEventListener('click', async () => {
    const tenantId = document.getElementById('match-tenant').value;
    const roomId = document.getElementById('match-tenant').selectedOptions[0]?.dataset.room;
    if (!tenantId) { showToast('Choose a tenant', 'error'); return; }

    const btn = document.getElementById('confirm-match');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div><span>Matching…</span>';

    // Find oldest unpaid bill
    const { data: openBills } = await sb.from('bills').select('id').eq('tenant_id', tenantId).gt('balance', 0).order('bill_year').order('bill_month').limit(1);
    const billId = openBills?.[0]?.id || null;

    // Insert payment
    const { data: payment, error: pErr } = await sb.from('payments').insert({
      tenant_id: tenantId,
      room_id: roomId,
      bill_id: billId,
      amount: transaction.amount,
      method: 'mpesa',
      mpesa_code: transaction.transaction_id,
      payment_date: transaction.transaction_time || transaction.created_at,
      recorded_by: 'matched',
    }).select().single();

    if (pErr) {
      btn.disabled = false;
      btn.innerHTML = `${icon('link')}<span>Match Payment</span>`;
      showToast(pErr.message, 'error');
      return;
    }

    // Update mpesa transaction
    const { error: tErr } = await sb.from('mpesa_transactions').update({
      matched: true,
      payment_id: payment.id,
    }).eq('id', transaction.id);

    if (tErr) {
      btn.disabled = false;
      btn.innerHTML = `${icon('link')}<span>Match Payment</span>`;
      showToast(tErr.message, 'error');
      return;
    }

    close();
    showToast('Payment matched successfully', 'success');
    loadPayments();
  });
}

/* ---- PDF RECEIPT ---- */
function printReceipt(payment) {
  const receiptNo = payment.id.slice(-8).toUpperCase();
  const tenantName = payment.tenants?.full_name || '—';
  const property   = payment.rooms?.properties?.name || '—';
  const unit       = payment.rooms?.name || '—';
  const business   = LANDLORD_PROFILE?.business_name || LANDLORD_PROFILE?.full_name || 'Property Management';
  const landlord   = LANDLORD_PROFILE?.full_name || '';
  const phone      = LANDLORD_PROFILE?.phone || '';

  const methodLabel = { mpesa: 'M-Pesa', bank: 'Bank Transfer', cash: 'Cash', other: 'Other' }[payment.method] || payment.method;
  const ref  = payment.mpesa_code || payment.reference || '—';
  const date = new Date(payment.payment_date).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const amount = Number(payment.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Receipt #${receiptNo}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111}
    .page{max-width:560px;margin:40px auto;padding:40px;border:1px solid #e5e7eb;border-radius:12px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #0F4C3A}
    .brand{font-size:22px;font-weight:800;color:#0F4C3A;letter-spacing:1px}
    .brand-sub{font-size:12px;color:#6b7280;margin-top:2px}
    .receipt-label{text-align:right}
    .receipt-title{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px}
    .receipt-no{font-size:20px;font-weight:800;color:#0F4C3A;font-family:monospace}
    .amount-block{background:#F4FAF7;border-radius:10px;padding:24px;text-align:center;margin-bottom:28px}
    .amount-label{font-size:11px;font-weight:700;color:#7A9E8E;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
    .amount-value{font-size:42px;font-weight:800;color:#0F4C3A}
    .amount-currency{font-size:20px;vertical-align:super}
    .section-title{font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
    .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
    .detail-item label{font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;display:block;margin-bottom:3px}
    .detail-item span{font-size:14px;font-weight:600;color:#111}
    .detail-item span.mono{font-family:monospace;font-size:13px}
    hr{border:none;border-top:1px solid #e5e7eb;margin:24px 0}
    .footer{text-align:center;margin-top:32px;padding-top:24px;border-top:1px solid #e5e7eb}
    .footer p{font-size:13px;color:#6b7280;line-height:1.6}
    .footer small{font-size:11px;color:#9CA3AF;display:block;margin-top:10px}
    .badge-paid{display:inline-block;background:#DCFCE7;color:#15803D;font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;text-transform:uppercase;letter-spacing:.5px}
    .print-actions{margin-top:28px;text-align:center}
    .btn-print{background:#0F4C3A;color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px}
    .btn-close{background:#f3f4f6;color:#374151;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
    @media print{.print-actions{display:none}.page{border:none;margin:0;padding:24px;max-width:100%}}
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="brand">CRIBFLOW</div>
      <div class="brand-sub">${escapeHtml(business)}</div>
      ${phone ? `<div class="brand-sub">${escapeHtml(phone)}</div>` : ''}
    </div>
    <div class="receipt-label">
      <div class="receipt-title">Rent Receipt</div>
      <div class="receipt-no">#${receiptNo}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">${date}</div>
    </div>
  </div>

  <div class="amount-block">
    <div class="amount-label">Amount Received</div>
    <div class="amount-value"><span class="amount-currency">KSh</span> ${amount}</div>
    <div style="margin-top:10px"><span class="badge-paid">✓ Payment Confirmed</span></div>
  </div>

  <div class="section-title">Payment Details</div>
  <div class="detail-grid">
    <div class="detail-item"><label>Tenant</label><span>${escapeHtml(tenantName)}</span></div>
    <div class="detail-item"><label>Property</label><span>${escapeHtml(property)}</span></div>
    <div class="detail-item"><label>Unit</label><span>${escapeHtml(unit)}</span></div>
    <div class="detail-item"><label>Payment Method</label><span>${methodLabel}</span></div>
    <div class="detail-item"><label>Transaction Ref</label><span class="mono">${escapeHtml(ref)}</span></div>
    <div class="detail-item"><label>Recorded By</label><span>${payment.recorded_by === 'auto' ? 'M-Pesa Auto' : 'Manual Entry'}</span></div>
  </div>

  <hr/>
  <div style="display:flex;justify-content:space-between;align-items:center">
    <span style="font-size:13px;color:#6b7280">Received by</span>
    <span style="font-size:14px;font-weight:700">${escapeHtml(landlord || business)}</span>
  </div>

  <div class="footer">
    <p>Thank you for your payment. Please keep this receipt for your records.</p>
    <small>Generated by CribFlow · Property Management Software</small>
  </div>

  <div class="print-actions">
    <button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">Close</button>
  </div>
</div>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=680,height=860,menubar=no,toolbar=no,location=no');
  w.document.write(html);
  w.document.close();
}
