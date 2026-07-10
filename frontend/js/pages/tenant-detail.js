/* =============================================================================
   TENANT DETAIL PAGE
   Shows full tenant profile, bill history, payment history
   ============================================================================= */

let CURRENT_TENANT = null;
let TENANT_PAYMENTS = [];

(async function () {
  const user = await requireAuth();
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get('id');
  if (!tenantId) {
    document.getElementById('page-content').innerHTML = renderNotFound();
    await renderSidebar('tenants');
    return;
  }

  await renderSidebar('tenants');
  await loadTenant(tenantId);
})();

async function loadTenant(tenantId) {
  const [tenantRes, billsRes, paymentsRes] = await Promise.all([
    sb.from('tenants').select(`*, rooms(id, name, monthly_rent, properties(id, name, account_prefix))`).eq('id', tenantId).single(),
    sb.from('bills').select('*').eq('tenant_id', tenantId).order('bill_year', { ascending: false }).order('bill_month', { ascending: false }),
    sb.from('payments').select('*').eq('tenant_id', tenantId).order('payment_date', { ascending: false }),
  ]);

  if (tenantRes.error) {
    document.getElementById('page-content').innerHTML = renderNotFound();
    return;
  }

  CURRENT_TENANT = tenantRes.data;
  TENANT_PAYMENTS = paymentsRes.data || [];
  renderPage(billsRes.data || [], TENANT_PAYMENTS);
}

function renderPage(bills, payments) {
  const t = CURRENT_TENANT;
  const room = t.rooms;
  const property = room?.properties;

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalOwed = bills.reduce((s, b) => s + Number(b.balance || 0), 0);
  const credit = Number(t.credit_balance || 0);
  const netOwed = Math.max(0, totalOwed - credit);      // true running position
  const openBillCount = bills.filter(b => b.balance > 0).length;
  const accountNumber = property ? `${property.account_prefix}-${room.name}` : '—';

  const today = new Date();
  const leaseEnd = t.lease_end ? new Date(t.lease_end) : null;
  const expiringSoon = leaseEnd && (leaseEnd - today) < 30 * 24 * 60 * 60 * 1000 && leaseEnd > today;
  const expired = leaseEnd && leaseEnd < today;

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <a href="/tenants" class="btn btn-ghost btn-sm" style="padding: 4px 8px; margin-bottom: 8px">${icon('chevronLeft')}<span>All tenants</span></a>
        <div style="display: flex; align-items: center; gap: 16px">
          <div class="avatar avatar-lg">${getInitials(t.full_name)}</div>
          <div>
            <div class="page-title">${escapeHtml(t.full_name)}</div>
            <div class="page-subtitle">
              ${escapeHtml(property?.name || '—')} · Unit ${escapeHtml(room?.name || '?')}
              ${t.status === 'active' ? '<span class="badge badge-success badge-dot" style="margin-left: 8px">Active</span>' : `<span class="badge" style="margin-left: 8px">${t.status}</span>`}
            </div>
          </div>
        </div>
      </div>
      <div class="page-actions">
        ${t.status === 'active' ? `
          <button class="btn btn-secondary" onclick="openEditTenantModal()">${icon('edit')}<span>Edit</span></button>
          <button class="btn btn-secondary" onclick="openMoveOutModal()" style="color: var(--color-danger)">${icon('logout')}<span>Move Out</span></button>
        ` : ''}
      </div>
    </header>

    ${expired && t.status === 'active' ? `
      <div class="card-elevated section" style="border-left: 3px solid var(--color-danger)">
        <div class="card-body" style="display: flex; align-items: center; gap: 12px">
          <div class="stat-card-icon" style="background: var(--color-danger-bg); color: var(--color-danger); width: 36px; height: 36px">${icon('alert')}</div>
          <div style="flex: 1">
            <div style="font-weight: 600">Lease expired ${formatDate(t.lease_end)}</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">Renew the lease or process a move-out.</div>
          </div>
        </div>
      </div>
    ` : ''}

    ${expiringSoon ? `
      <div class="card-elevated section" style="border-left: 3px solid var(--color-warning)">
        <div class="card-body" style="display: flex; align-items: center; gap: 12px">
          <div class="stat-card-icon" style="background: var(--color-warning-bg); color: var(--color-warning); width: 36px; height: 36px">${icon('calendar')}</div>
          <div style="flex: 1">
            <div style="font-weight: 600">Lease expiring soon · ${formatDate(t.lease_end)}</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">${Math.ceil((leaseEnd - today)/(1000*60*60*24))} days remaining.</div>
          </div>
        </div>
      </div>
    ` : ''}

    ${credit > 0 ? `
      <div class="card-elevated section" style="border-left: 3px solid var(--color-success)">
        <div class="card-body" style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap">
          <div class="stat-card-icon" style="background: var(--color-success-bg); color: var(--color-success); width: 40px; height: 40px">${icon('wallet')}</div>
          <div style="flex: 1; min-width: 200px">
            <div style="font-weight: 600">${formatMoney(credit)} in unapplied credit</div>
            <div style="font-size: 13px; color: var(--color-text-secondary)">From an overpayment. Apply it to an open bill or record a refund.</div>
          </div>
          ${openBillCount > 0 ? `<button class="btn btn-primary btn-sm" onclick="applyCredit()">${icon('check')}<span>Apply to bills</span></button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="refundCredit()">${icon('logout')}<span>Record refund</span></button>
        </div>
      </div>
    ` : ''}

    <!-- STATS -->
    <section class="grid-4 section">
      ${renderStat('Monthly Rent', formatMoney(room?.monthly_rent || 0), 'wallet', 'Per month')}
      ${renderStat('Total Paid', formatMoney(totalPaid), 'check', `${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}`)}
      ${renderStat('Outstanding', formatMoney(netOwed), 'alert', openBillCount ? `${openBillCount} unpaid ${openBillCount === 1 ? 'bill' : 'bills'}` : 'All settled', netOwed > 0 ? 'warning' : '')}
      ${renderStat('Credit', formatMoney(credit), 'wallet', credit > 0 ? 'Available to apply' : 'None')}
    </section>

    <!-- PROFILE + ACCOUNT INFO -->
    <section class="grid-2 section">
      <div class="card-elevated">
        <div class="card-header"><div class="card-title">Contact & Lease</div></div>
        <div class="card-body">
          <div class="detail-list">
            ${t.phone ? `<div class="detail-row"><span class="detail-label">${icon('phone')} Phone</span><span class="detail-value">${escapeHtml(t.phone)}</span></div>` : ''}
            ${t.email ? `<div class="detail-row"><span class="detail-label">${icon('mail')} Email</span><span class="detail-value">${escapeHtml(t.email)}</span></div>` : ''}
            ${t.national_id ? `<div class="detail-row"><span class="detail-label">${icon('user')} National ID</span><span class="detail-value">${escapeHtml(t.national_id)}</span></div>` : ''}
            <div class="detail-row"><span class="detail-label">${icon('calendar')} Lease start</span><span class="detail-value">${formatDate(t.lease_start)}</span></div>
            ${t.lease_end ? `<div class="detail-row"><span class="detail-label">${icon('calendar')} Lease end</span><span class="detail-value">${formatDate(t.lease_end)}</span></div>` : ''}
            <div class="detail-row"><span class="detail-label">${icon('shield')} Deposit</span><span class="detail-value">${formatMoney(t.deposit_paid)}</span></div>
            ${t.emergency_contact_name ? `<div class="detail-row"><span class="detail-label">${icon('phone')} Emergency contact</span><span class="detail-value">${escapeHtml(t.emergency_contact_name)} · ${escapeHtml(t.emergency_contact_phone || '')}</span></div>` : ''}
          </div>
        </div>
      </div>

      <div class="card-elevated">
        <div class="card-header"><div class="card-title">M-Pesa Payment Info</div></div>
        <div class="card-body">
          <p style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 16px; line-height: 1.6">
            Tenant should use this account number when paying via M-Pesa Paybill. The system auto-matches by this code.
          </p>
          <div style="background: var(--color-primary-50); border: 1px solid var(--color-primary-100); border-radius: var(--radius-md); padding: 16px; text-align: center">
            <div class="eyebrow" style="color: var(--color-primary); margin-bottom: 6px">M-Pesa Account Number</div>
            <div style="font-size: 28px; font-weight: 700; color: var(--color-primary); letter-spacing: 0.05em; font-family: var(--font-mono)">${escapeHtml(accountNumber)}</div>
          </div>
          <button class="btn btn-secondary w-full" style="width: 100%; margin-top: 12px" onclick="copyText('${accountNumber}')">${icon('copy')}<span>Copy</span></button>
        </div>
      </div>
    </section>

    <!-- BILLS -->
    <section class="card-elevated section">
      <div class="card-header">
        <div class="card-title">Bill History</div>
        <span class="muted" style="font-size: 13px">${bills.length} ${bills.length === 1 ? 'bill' : 'bills'}</span>
      </div>
      <div style="overflow-x: auto">
        ${bills.length === 0 ? `
          <div class="empty-state" style="padding: 40px 24px">
            <div class="empty-state-icon" style="width: 44px; height: 44px">${icon('receipt')}</div>
            <h3 style="font-size: 14px">No bills yet</h3>
            <p style="font-size: 13px">Bills appear here when generated for the month.</p>
          </div>
        ` : `
          <table class="table">
            <thead><tr><th>Period</th><th>Rent</th><th>Water</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
            <tbody>
              ${bills.map(b => {
                const prevBal = Number(b.previous_balance || 0);
                const lateFee = Number(b.late_fee || 0);
                const extras = [
                  prevBal > 0 ? `<div style="font-size:11px;color:var(--color-text-muted)">+ ${formatMoney(prevBal)} carried fwd</div>` : '',
                  lateFee > 0 ? `<div style="font-size:11px;color:var(--color-warning)">+ ${formatMoney(lateFee)} late fee</div>` : '',
                ].filter(Boolean).join('');
                return `
                <tr>
                  <td>${monthName(b.bill_month)} ${b.bill_year}</td>
                  <td class="numeric">${formatMoney(b.rent_amount)}</td>
                  <td class="numeric">${formatMoney(b.water_amount)}</td>
                  <td class="numeric" style="font-weight: 600">${formatMoney(b.total_due)}${extras}</td>
                  <td class="numeric">${formatMoney(b.total_paid)}</td>
                  <td class="numeric" style="color: ${Number(b.balance) > 0 ? 'var(--color-danger)' : 'var(--color-success)'}; font-weight: 500">${formatMoney(b.balance)}</td>
                  <td>${billStatusBadge(b.status)}</td>
                </tr>
              `}).join('')}
            </tbody>
          </table>
        `}
      </div>
    </section>

    <!-- PAYMENTS -->
    <section class="card-elevated section">
      <div class="card-header">
        <div class="card-title">Payment History</div>
        <span class="muted" style="font-size: 13px">${payments.length} ${payments.length === 1 ? 'payment' : 'payments'}</span>
      </div>
      <div style="overflow-x: auto">
        ${payments.length === 0 ? `
          <div class="empty-state" style="padding: 40px 24px">
            <div class="empty-state-icon" style="width: 44px; height: 44px">${icon('card')}</div>
            <h3 style="font-size: 14px">No payments yet</h3>
            <p style="font-size: 13px">Payments will appear here once recorded.</p>
          </div>
        ` : `
          <table class="table">
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              ${payments.map((p, idx) => `
                <tr>
                  <td>${formatDateTime(p.payment_date)}</td>
                  <td><span class="badge badge-primary">${p.method.toUpperCase()}</span></td>
                  <td style="font-family: var(--font-mono); font-size: 12px">${escapeHtml(p.mpesa_code || p.reference || '—')}</td>
                  <td class="numeric" style="font-weight: 600; color: var(--color-success)">+${formatMoney(p.amount)}</td>
                  <td>
                    <div style="display:flex; gap:4px; justify-content:flex-end">
                      <button class="btn btn-ghost btn-sm" title="Print receipt" onclick="printTenantReceipt(${idx})">${icon('receipt')}</button>
                      ${t.email ? `<button class="btn btn-ghost btn-sm" title="Email receipt" onclick="emailReceipt('${p.id}', this)">${icon('mail')}</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </section>

    ${t.notes ? `
      <section class="card-elevated section">
        <div class="card-header"><div class="card-title">Notes</div></div>
        <div class="card-body" style="font-size: 14px; color: var(--color-text-secondary); white-space: pre-wrap; line-height: 1.6">${escapeHtml(t.notes)}</div>
      </section>
    ` : ''}
  `;

  document.getElementById('page-content').innerHTML = html;
}

/* ---- CREDIT RESOLUTION ---- */
async function applyCredit() {
  const t = CURRENT_TENANT;
  const credit = Number(t.credit_balance || 0);
  if (credit <= 0) { showToast('No credit to apply', 'info'); return; }
  const ok = await confirmDialog({
    title: 'Apply credit to bills',
    message: `Apply <strong>${formatMoney(credit)}</strong> of credit to ${escapeHtml(t.full_name)}'s open bills, oldest first? Any leftover stays as credit.`,
    confirmText: 'Apply credit',
  });
  if (!ok) return;
  const { data, error } = await sb.rpc('fn_apply_credit', { p_tenant_id: t.id });
  if (error) { showToast(error.message, 'error'); return; }
  const applied = Number(data || 0);
  showToast(applied > 0 ? `${formatMoney(applied)} applied to bills` : 'No open bills to apply credit to', applied > 0 ? 'success' : 'info');
  loadTenant(t.id);
}

async function refundCredit() {
  const t = CURRENT_TENANT;
  const credit = Number(t.credit_balance || 0);
  if (credit <= 0) { showToast('No credit to refund', 'info'); return; }
  const ok = await confirmDialog({
    title: 'Record a refund',
    message: `Record that <strong>${formatMoney(credit)}</strong> of credit was refunded to ${escapeHtml(t.full_name)} in cash? This clears the credit — it does not move any money itself.`,
    confirmText: 'Record refund',
    danger: true,
  });
  if (!ok) return;
  const { data, error } = await sb.rpc('fn_refund_credit', { p_tenant_id: t.id });
  if (error) { showToast(error.message, 'error'); return; }
  const refunded = Number(data || 0);
  showToast(`${formatMoney(refunded)} recorded as refunded`, 'success');
  loadTenant(t.id);
}

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

function renderNotFound() {
  return `
    <div class="card-elevated" style="margin-top: 80px">
      <div class="empty-state">
        <div class="empty-state-icon">${icon('alert')}</div>
        <h3>Tenant not found</h3>
        <p>The tenant you're looking for doesn't exist or you don't have access.</p>
        <a href="/tenants" class="btn btn-primary">Back to Tenants</a>
      </div>
    </div>
  `;
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  showToast(`Copied: ${text}`, 'success');
}

/* ---- EDIT TENANT MODAL ---- */
function openEditTenantModal() {
  const t = CURRENT_TENANT;
  const content = `
    <form id="edit-t-form">
      <div class="form-group">
        <label class="label label-required" for="et-name">Full name</label>
        <input class="input" id="et-name" required value="${escapeHtml(t.full_name)}" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label" for="et-id">National ID</label>
          <input class="input" id="et-id" value="${escapeHtml(t.national_id || '')}" />
        </div>
        <div class="form-group">
          <label class="label" for="et-phone">Phone</label>
          <input class="input" id="et-phone" type="tel" value="${escapeHtml(t.phone || '')}" />
        </div>
      </div>

      <div class="form-group">
        <label class="label" for="et-email">Email</label>
        <input class="input" id="et-email" type="email" value="${escapeHtml(t.email || '')}" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label label-required" for="et-lease-start">Lease start</label>
          <input class="input" id="et-lease-start" type="date" required value="${t.lease_start || ''}" />
        </div>
        <div class="form-group">
          <label class="label" for="et-lease-end">Lease end</label>
          <input class="input" id="et-lease-end" type="date" value="${t.lease_end || ''}" />
        </div>
      </div>

      <div class="form-group">
        <label class="label" for="et-deposit">Deposit paid</label>
        <div class="input-prefix-wrap">
          <span class="input-prefix">KSh</span>
          <input class="input" id="et-deposit" type="number" min="0" value="${t.deposit_paid}" />
        </div>
      </div>

      <div class="form-group">
        <label class="label" for="et-notes">Notes</label>
        <textarea class="textarea" id="et-notes" rows="3" placeholder="Internal notes about this tenant…">${escapeHtml(t.notes || '')}</textarea>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-et">Cancel</button>
    <button class="btn btn-primary" id="save-et">${icon('check')}<span>Save Changes</span></button>
  `;

  const { close } = openModal(content, { title: 'Edit tenant', footer, size: 'lg' });

  document.getElementById('cancel-et').addEventListener('click', close);

  document.getElementById('save-et').addEventListener('click', async () => {
    const updates = {
      full_name: document.getElementById('et-name').value.trim(),
      national_id: document.getElementById('et-id').value.trim() || null,
      phone: document.getElementById('et-phone').value.trim() || null,
      email: document.getElementById('et-email').value.trim() || null,
      lease_start: document.getElementById('et-lease-start').value,
      lease_end: document.getElementById('et-lease-end').value || null,
      deposit_paid: parseFloat(document.getElementById('et-deposit').value) || 0,
      notes: document.getElementById('et-notes').value.trim() || null,
    };

    const { error } = await sb.from('tenants').update(updates).eq('id', CURRENT_TENANT.id);
    if (error) { showToast(error.message, 'error'); return; }
    close();
    showToast('Tenant updated', 'success');
    loadTenant(CURRENT_TENANT.id);
  });
}

/* ---- MOVE OUT MODAL ---- */
async function openMoveOutModal() {
  const { data: bills } = await sb.from('bills').select('balance').eq('tenant_id', CURRENT_TENANT.id);
  const totalOwed = (bills || []).reduce((s, b) => s + Number(b.balance || 0), 0);

  const content = `
    ${totalOwed > 0 ? `
      <div style="background: var(--color-warning-bg); border: 1px solid var(--color-warning-border); padding: 12px 14px; border-radius: var(--radius-md); margin-bottom: 16px; display: flex; align-items: center; gap: 12px">
        ${icon('alert')}
        <div style="font-size: 13px">
          <strong>Outstanding balance: ${formatMoney(totalOwed)}</strong><br/>
          <span style="color: var(--color-text-secondary)">Make sure to record final payment or write-off before moving out.</span>
        </div>
      </div>
    ` : ''}
    <p style="font-size: 14px; color: var(--color-text-secondary); margin-bottom: 16px; line-height: 1.6">
      Confirm that <strong>${escapeHtml(CURRENT_TENANT.full_name)}</strong> is moving out. The room will be marked as vacant. All history is preserved.
    </p>
    <div class="form-group">
      <label class="label label-required" for="mo-date">Move-out date</label>
      <input class="input" id="mo-date" type="date" required value="${new Date().toISOString().split('T')[0]}" />
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-mo">Cancel</button>
    <button class="btn btn-danger" id="confirm-mo">${icon('logout')}<span>Confirm Move Out</span></button>
  `;

  const { close } = openModal(content, { title: 'Process move-out', footer });
  document.getElementById('cancel-mo').addEventListener('click', close);

  document.getElementById('confirm-mo').addEventListener('click', async () => {
    const move_out_date = document.getElementById('mo-date').value;
    if (!move_out_date) { showToast('Move-out date is required', 'error'); return; }
    const { error } = await sb.from('tenants').update({
      status: 'past',
      move_out_date,
    }).eq('id', CURRENT_TENANT.id);
    if (error) { showToast(error.message, 'error'); return; }
    close();
    showToast('Move-out recorded', 'success');
    loadTenant(CURRENT_TENANT.id);
  });
}

/* ---- RECEIPT FROM TENANT PAGE ---- */
async function emailReceipt(paymentId, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; }
  try {
    await apiPost('/api/email/receipt', { payment_id: paymentId });
    showToast('Receipt emailed', 'success');
  } catch (err) {
    showToast(`Couldn't email receipt: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = icon('mail'); }
  }
}

function printTenantReceipt(idx) {
  const p = TENANT_PAYMENTS[idx];
  if (!p) return;
  const t = CURRENT_TENANT;
  // Attach tenant + room info so the shared receipt renderer works
  const enriched = {
    ...p,
    tenants: { full_name: t.full_name },
    rooms: { name: t.rooms?.name, properties: { name: t.rooms?.properties?.name } },
  };
  // Reuse the receipt logic inline
  const receiptNo = p.id.slice(-8).toUpperCase();
  const methodLabel = { mpesa: 'M-Pesa', bank: 'Bank Transfer', cash: 'Cash', other: 'Other' }[p.method] || p.method;
  const ref    = p.mpesa_code || p.reference || '—';
  const date   = new Date(p.payment_date).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const amount = Number(p.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 });
  const property = t.rooms?.properties?.name || '—';
  const unit     = t.rooms?.name || '—';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Receipt #${receiptNo}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111}.page{max-width:560px;margin:40px auto;padding:40px;border:1px solid #e5e7eb;border-radius:12px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:24px;border-bottom:2px solid #0F4C3A}.brand{font-size:22px;font-weight:800;color:#0F4C3A}.brand-sub{font-size:12px;color:#6b7280;margin-top:2px}.receipt-label{text-align:right}.receipt-no{font-size:20px;font-weight:800;color:#0F4C3A;font-family:monospace}.amount-block{background:#F4FAF7;border-radius:10px;padding:24px;text-align:center;margin-bottom:28px}.amount-value{font-size:42px;font-weight:800;color:#0F4C3A}.amount-currency{font-size:20px;vertical-align:super}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}.detail-item label{font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;display:block;margin-bottom:3px}.detail-item span{font-size:14px;font-weight:600;color:#111}.detail-item .mono{font-family:monospace;font-size:13px}.badge-paid{display:inline-block;background:#DCFCE7;color:#15803D;font-size:11px;font-weight:700;padding:3px 10px;border-radius:100px;text-transform:uppercase}.footer{text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280}.footer small{font-size:11px;color:#9CA3AF;display:block;margin-top:8px}.print-actions{margin-top:24px;text-align:center}.btn-print{background:#0F4C3A;color:#fff;border:none;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px}.btn-close{background:#f3f4f6;color:#374151;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}@media print{.print-actions{display:none}.page{border:none;margin:0;padding:24px;max-width:100%}}</style>
  </head><body><div class="page">
  <div class="header"><div><div class="brand">CRIBFLOW</div></div><div class="receipt-label"><div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px">Rent Receipt</div><div class="receipt-no">#${receiptNo}</div><div style="font-size:12px;color:#6b7280;margin-top:4px">${date}</div></div></div>
  <div class="amount-block"><div style="font-size:11px;font-weight:700;color:#7A9E8E;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Amount Received</div><div class="amount-value"><span class="amount-currency">KSh</span> ${amount}</div><div style="margin-top:10px"><span class="badge-paid">✓ Payment Confirmed</span></div></div>
  <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Payment Details</div>
  <div class="detail-grid"><div class="detail-item"><label>Tenant</label><span>${escapeHtml(t.full_name)}</span></div><div class="detail-item"><label>Property</label><span>${escapeHtml(property)}</span></div><div class="detail-item"><label>Unit</label><span>${escapeHtml(unit)}</span></div><div class="detail-item"><label>Method</label><span>${methodLabel}</span></div><div class="detail-item"><label>Reference</label><span class="mono">${escapeHtml(ref)}</span></div><div class="detail-item"><label>Recorded By</label><span>${p.recorded_by === 'auto' ? 'M-Pesa Auto' : 'Manual'}</span></div></div>
  <div class="footer"><p>Thank you for your payment.</p><small>Generated by CribFlow · Property Management Software</small></div>
  <div class="print-actions"><button class="btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button><button class="btn-close" onclick="window.close()">Close</button></div>
  </div></body></html>`;

  const w = window.open('', '_blank', 'width=680,height=820,menubar=no,toolbar=no,location=no');
  w.document.write(html);
  w.document.close();
}
