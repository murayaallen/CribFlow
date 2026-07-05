/* =============================================================================
   BILLING PAGE
   View, generate, send and track monthly bills.
   ============================================================================= */

let SELECTED_MONTH = currentMonth();
let SELECTED_YEAR = currentYear();
let SELECTED_PROPERTY = 'all';
let ALL_PROPERTIES = [];
let PROFILE = null;

(async function () {
  const user = await requireAuth();
  if (!user) return;
  PROFILE = await getCurrentProfile();
  await renderSidebar('billing');

  const { data: props } = await sb.from('properties').select('id, name, water_rate_per_unit').eq('archived', false).order('name');
  ALL_PROPERTIES = props || [];

  await loadBilling();
})();

async function loadBilling() {
  let query = sb.from('bills').select(`
    *, tenants(id, full_name, email, phone),
       rooms(id, name, monthly_rent, properties(id, name, account_prefix))
  `).eq('bill_month', SELECTED_MONTH).eq('bill_year', SELECTED_YEAR);

  if (SELECTED_PROPERTY !== 'all') {
    const { data: rooms } = await sb.from('rooms').select('id').eq('property_id', SELECTED_PROPERTY);
    const roomIds = (rooms || []).map(r => r.id);
    query = query.in('room_id', roomIds);
  }

  const { data: bills, error } = await query.order('created_at');
  if (error) { showToast(error.message, 'error'); return; }

  renderPage(bills || []);
}

function renderPage(bills) {
  const totalDue = bills.reduce((s, b) => s + Number(b.total_due || 0), 0);
  const totalPaid = bills.reduce((s, b) => s + Number(b.total_paid || 0), 0);
  const totalBalance = totalDue - totalPaid;
  const paidCount = bills.filter(b => b.status === 'paid').length;
  const partialCount = bills.filter(b => b.status === 'partial').length;
  const unpaidCount = bills.filter(b => b.status === 'unpaid').length;

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <div class="page-title">Billing</div>
        <div class="page-subtitle">Generate, send, and track monthly bills.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="applyLateFees()">${icon('alert')}<span>Apply Late Fees</span></button>
        <button class="btn btn-secondary" onclick="openSendBillsModal(${bills.length})">${icon('send')}<span>Send Bills</span></button>
        <button class="btn btn-primary" onclick="openGenerateBillsModal()">${icon('plus')}<span>Generate Bills</span></button>
      </div>
    </header>

    <div class="filter-bar">
      <select class="select" id="month-sel" style="width: auto; min-width: 140px">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === SELECTED_MONTH ? 'selected' : ''}>${fullMonthName(m)}</option>`).join('')}
      </select>
      <select class="select" id="year-sel" style="width: auto; min-width: 100px">
        ${[currentYear() - 1, currentYear(), currentYear() + 1].map(y => `<option value="${y}" ${y === SELECTED_YEAR ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <select class="select" id="prop-sel" style="width: auto; min-width: 200px">
        <option value="all">All properties</option>
        ${ALL_PROPERTIES.map(p => `<option value="${p.id}" ${SELECTED_PROPERTY === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
    </div>

    ${bills.length === 0 ? renderEmpty() : `
      <section class="grid-4 section">
        ${renderStat('Bills', bills.length, 'receipt', `${paidCount + partialCount + unpaidCount} active`)}
        ${renderStat('Total Due', formatMoney(totalDue), 'wallet', `${fullMonthName(SELECTED_MONTH)} ${SELECTED_YEAR}`)}
        ${renderStat('Collected', formatMoney(totalPaid), 'check', `${totalDue ? Math.round((totalPaid/totalDue)*100) : 0}% of total`)}
        ${renderStat('Outstanding', formatMoney(totalBalance), 'alert', `${unpaidCount + partialCount} unpaid`, totalBalance > 0 ? 'warning' : '')}
      </section>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Tenant · Unit</th>
              <th>Rent</th>
              <th>Water</th>
              <th>Total Due</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${bills.map(b => renderBillRow(b)).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  document.getElementById('page-content').innerHTML = html;

  document.getElementById('month-sel').addEventListener('change', (e) => { SELECTED_MONTH = parseInt(e.target.value); loadBilling(); });
  document.getElementById('year-sel').addEventListener('change', (e) => { SELECTED_YEAR = parseInt(e.target.value); loadBilling(); });
  document.getElementById('prop-sel').addEventListener('change', (e) => { SELECTED_PROPERTY = e.target.value; loadBilling(); });
}

/* ---- APPLY LATE FEES ---- */
async function applyLateFees() {
  if (!PROFILE?.late_penalty_type || PROFILE.late_penalty_type === 'none') {
    showToast('Set up a late-fee policy first in Settings → Billing & Penalties', 'warning');
    return;
  }
  const graceTxt = PROFILE.grace_period_days ? ` after a ${PROFILE.grace_period_days}-day grace period` : '';
  const feeTxt = PROFILE.late_penalty_type === 'flat'
    ? `${formatMoney(PROFILE.late_penalty_amount)} flat`
    : `${PROFILE.late_penalty_amount}% of the outstanding balance`;
  const ok = await confirmDialog({
    title: 'Apply late fees',
    message: `This charges a late fee of <strong>${feeTxt}</strong> to every overdue bill${graceTxt} that hasn't already been charged. Each bill is charged once. Continue?`,
    confirmText: 'Apply late fees',
  });
  if (!ok) return;

  const { data, error } = await sb.rpc('fn_apply_late_fees', { p_user_id: PROFILE.id });
  if (error) { showToast(error.message, 'error'); return; }
  const n = Number(data || 0);
  showToast(n > 0 ? `Late fee applied to ${n} ${n === 1 ? 'bill' : 'bills'}` : 'No overdue bills needed a late fee', n > 0 ? 'success' : 'info');
  loadBilling();
}

function renderBillRow(b) {
  const prevBal = Number(b.previous_balance || 0);
  const lateFee = Number(b.late_fee || 0);
  const extraLines = [
    prevBal > 0 ? `<div style="font-size: 11px; color: var(--color-text-muted)">+ ${formatMoney(prevBal)} carried forward</div>` : '',
    lateFee > 0 ? `<div style="font-size: 11px; color: var(--color-warning)">+ ${formatMoney(lateFee)} late fee</div>` : '',
  ].filter(Boolean).join('');

  return `
    <tr>
      <td>
        <div style="font-weight: 500">${escapeHtml(b.tenants?.full_name || '—')}</div>
        <div style="font-size: 12px; color: var(--color-text-muted)">${escapeHtml(b.rooms?.properties?.name || '')} · Unit ${escapeHtml(b.rooms?.name || '')}</div>
      </td>
      <td class="numeric">${formatMoney(b.rent_amount)}</td>
      <td class="numeric">${formatMoney(b.water_amount)}</td>
      <td class="numeric" style="font-weight: 600">
        ${formatMoney(b.total_due)}
        ${extraLines}
      </td>
      <td class="numeric">${formatMoney(b.total_paid)}</td>
      <td class="numeric" style="color: ${Number(b.balance) > 0 ? 'var(--color-danger)' : 'var(--color-success)'}; font-weight: 500">${formatMoney(b.balance)}</td>
      <td>${billStatusBadge(b.status)}</td>
      <td style="font-size: 12px; color: var(--color-text-muted)">${formatDate(b.due_date, 'short')}</td>
      <td>
        <div style="display: flex; gap: 4px; justify-content: flex-end">
          ${Number(b.balance) > 0 ? `<button class="btn btn-secondary btn-sm" onclick="openRecordPaymentModal('${b.id}', '${b.tenant_id}', '${b.room_id}', ${b.balance})">${icon('plus')}<span>Pay</span></button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="window.location.href='/tenant-detail.html?id=${b.tenant_id}'">${icon('externalLink')}</button>
        </div>
      </td>
    </tr>
  `;
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

function renderEmpty() {
  return `
    <div class="card-elevated">
      <div class="empty-state">
        <div class="empty-state-icon">${icon('receipt')}</div>
        <h3>No bills for ${fullMonthName(SELECTED_MONTH)} ${SELECTED_YEAR}</h3>
        <p>Generate bills automatically for all active tenants. Water charges will pull from any meter readings entered for this period.</p>
        <button class="btn btn-primary" onclick="openGenerateBillsModal()">${icon('plus')}<span>Generate Bills Now</span></button>
      </div>
    </div>
  `;
}

/* ---- GENERATE BILLS MODAL ---- */
function openGenerateBillsModal() {
  const today = new Date(SELECTED_YEAR, SELECTED_MONTH - 1, 10).toISOString().split('T')[0];
  const hasLateFee = PROFILE?.late_penalty_type && PROFILE.late_penalty_type !== 'none';
  const lateFeeDesc = hasLateFee
    ? PROFILE.late_penalty_type === 'flat'
      ? `KSh ${Number(PROFILE.late_penalty_amount).toLocaleString()} flat`
      : `${PROFILE.late_penalty_amount}% of rent`
    : '';

  const content = `
    <p style="font-size: 14px; color: var(--color-text-secondary); margin-bottom: 16px; line-height: 1.6">
      This generates bills for all <strong>active tenants</strong> for <strong>${fullMonthName(SELECTED_MONTH)} ${SELECTED_YEAR}</strong>${SELECTED_PROPERTY !== 'all' ? ` in <strong>${escapeHtml(ALL_PROPERTIES.find(p => p.id === SELECTED_PROPERTY)?.name)}</strong>` : ''}.
      Water charges pull from any meter readings entered. Tenants with existing bills for this period are skipped.
    </p>

    <div class="form-group">
      <label class="label label-required" for="gen-due-date">Due date</label>
      <input class="input" id="gen-due-date" type="date" required value="${today}" />
      <div class="input-help">When tenants must pay by.</div>
    </div>

    <div class="form-group">
      <label class="label" for="gen-other-charges">Other charges (optional)</label>
      <div class="input-prefix-wrap">
        <span class="input-prefix">KSh</span>
        <input class="input" id="gen-other-charges" type="number" min="0" step="100" value="0" />
      </div>
      <div class="input-help">Apply a flat additional charge to every bill (e.g. garbage, security).</div>
    </div>

    <div class="form-group">
      <label class="label" for="gen-other-desc">Description for other charges</label>
      <input class="input" id="gen-other-desc" placeholder="e.g. Garbage collection" />
    </div>

    <div style="border-top: 1px solid var(--color-border); margin-top: 8px; padding-top: 16px; display: flex; flex-direction: column; gap: 12px">
      <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer">
        <input type="checkbox" id="gen-carryforward" checked style="margin-top: 2px; accent-color: var(--color-primary)" />
        <div>
          <div style="font-size: 14px; font-weight: 600; color: var(--color-text)">Carry forward unpaid balances</div>
          <div style="font-size: 12px; color: var(--color-text-muted); margin-top: 2px">Shows any previous unpaid amounts on this bill as a reference line.</div>
        </div>
      </label>
      ${hasLateFee ? `
      <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer">
        <input type="checkbox" id="gen-latefee" checked style="margin-top: 2px; accent-color: var(--color-primary)" />
        <div>
          <div style="font-size: 14px; font-weight: 600; color: var(--color-text)">Apply late fees <span style="font-weight: 400; color: var(--color-text-muted)">(${lateFeeDesc})</span></div>
          <div style="font-size: 12px; color: var(--color-text-muted); margin-top: 2px">Added to tenants with bills overdue beyond the ${PROFILE.grace_period_days}-day grace period.</div>
        </div>
      </label>` : ''}
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-gen">Cancel</button>
    <button class="btn btn-primary" id="confirm-gen">${icon('zap')}<span>Generate Bills</span></button>
  `;

  const { close } = openModal(content, { title: 'Generate monthly bills', footer });
  document.getElementById('cancel-gen').addEventListener('click', close);

  document.getElementById('confirm-gen').addEventListener('click', async () => {
    const dueDate = document.getElementById('gen-due-date').value;
    const otherCharges = parseFloat(document.getElementById('gen-other-charges').value) || 0;
    const otherDesc = document.getElementById('gen-other-desc').value.trim() || null;
    const genCarryforward = document.getElementById('gen-carryforward')?.checked ?? true;
    const genLateFee = hasLateFee && (document.getElementById('gen-latefee')?.checked ?? true);

    if (!dueDate) { showToast('Due date is required', 'error'); return; }

    const btn = document.getElementById('confirm-gen');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div><span>Generating…</span>';

    // Get all active tenants (filtered by property if needed)
    const { data: tenants } = await sb.from('tenants').select('id, room_id, rooms(id, monthly_rent, property_id, properties(id, water_rate_per_unit))').eq('status', 'active');
    let activeTenants = tenants || [];
    if (SELECTED_PROPERTY !== 'all') {
      activeTenants = activeTenants.filter(t => t.rooms?.property_id === SELECTED_PROPERTY);
    }

    if (activeTenants.length === 0) {
      btn.disabled = false;
      btn.innerHTML = `${icon('zap')}<span>Generate Bills</span>`;
      showToast('No active tenants found', 'warning');
      return;
    }

    const tenantIds = activeTenants.map(t => t.id);
    const roomIds = activeTenants.map(t => t.room_id);

    // Parallel: water readings + existing bills + previous unpaid bills
    const [readingsRes, existingRes, prevBillsRes] = await Promise.all([
      sb.from('water_readings').select('*').in('room_id', roomIds).eq('reading_month', SELECTED_MONTH).eq('reading_year', SELECTED_YEAR),
      sb.from('bills').select('tenant_id').in('tenant_id', tenantIds).eq('bill_month', SELECTED_MONTH).eq('bill_year', SELECTED_YEAR),
      (genCarryforward || genLateFee)
        ? sb.from('bills').select('tenant_id, balance, due_date, status').in('tenant_id', tenantIds).not('status', 'in', '("paid","void")')
        : Promise.resolve({ data: [] }),
    ]);

    const readingByRoom = {};
    (readingsRes.data || []).forEach(r => readingByRoom[r.room_id] = r);

    const existingTenantIds = new Set((existingRes.data || []).map(b => b.tenant_id));

    // Build carry-forward and overdue maps from previous bills
    const prevBalanceByTenant = {};
    const overdueSet = new Set();
    const todayDate = new Date();
    const graceDays = Number(PROFILE?.grace_period_days || 0);

    for (const b of (prevBillsRes.data || [])) {
      // Skip if this is the current period (shouldn't be in results yet but be safe)
      const bal = Number(b.balance || 0);
      if (bal <= 0) continue;
      prevBalanceByTenant[b.tenant_id] = (prevBalanceByTenant[b.tenant_id] || 0) + bal;
      if (genLateFee && b.due_date) {
        const cutoff = new Date(new Date(b.due_date).getTime() + graceDays * 86400000);
        if (todayDate > cutoff) overdueSet.add(b.tenant_id);
      }
    }

    const billsToInsert = [];
    let skipped = 0;
    for (const t of activeTenants) {
      if (existingTenantIds.has(t.id)) { skipped++; continue; }
      const rent = Number(t.rooms?.monthly_rent || 0);
      const reading = readingByRoom[t.room_id];
      const water = reading ? Number(reading.amount_due || 0) : 0;
      const prevBalance = genCarryforward ? (prevBalanceByTenant[t.id] || 0) : 0;

      let lateFee = 0;
      if (genLateFee && overdueSet.has(t.id)) {
        lateFee = PROFILE.late_penalty_type === 'flat'
          ? Number(PROFILE.late_penalty_amount || 0)
          : Math.round(rent * Number(PROFILE.late_penalty_amount || 0) / 100);
      }

      const total = rent + water + otherCharges + lateFee;

      billsToInsert.push({
        tenant_id: t.id,
        room_id: t.room_id,
        bill_month: SELECTED_MONTH,
        bill_year: SELECTED_YEAR,
        rent_amount: rent,
        water_amount: water,
        water_reading_id: reading?.id || null,
        other_charges: otherCharges,
        other_charges_description: otherDesc,
        late_fee: lateFee,
        previous_balance: prevBalance,
        total_due: total,
        due_date: dueDate,
        status: 'unpaid',
      });
    }

    if (billsToInsert.length === 0) {
      btn.disabled = false;
      btn.innerHTML = `${icon('zap')}<span>Generate Bills</span>`;
      showToast(`All ${activeTenants.length} tenants already have bills for this period`, 'warning');
      return;
    }

    const { error } = await sb.from('bills').insert(billsToInsert);
    if (error) {
      btn.disabled = false;
      btn.innerHTML = `${icon('zap')}<span>Generate Bills</span>`;
      showToast(error.message, 'error');
      return;
    }

    const lateCount = billsToInsert.filter(b => b.late_fee > 0).length;
    const carryCount = billsToInsert.filter(b => b.previous_balance > 0).length;
    let msg = `${billsToInsert.length} bills generated`;
    if (skipped > 0) msg += ` · ${skipped} skipped`;
    if (lateCount > 0) msg += ` · ${lateCount} with late fee`;
    if (carryCount > 0) msg += ` · ${carryCount} with carry-forward`;
    close();
    showToast(msg, 'success');
    loadBilling();
  });
}

/* ---- SEND BILLS MODAL ---- */
async function openSendBillsModal(billCount) {
  if (billCount === 0) {
    showToast('Generate bills first', 'warning');
    return;
  }
  const content = `
    <p style="font-size: 14px; color: var(--color-text-secondary); line-height: 1.6">
      Email the bill to every tenant for <strong>${fullMonthName(SELECTED_MONTH)} ${SELECTED_YEAR}</strong>. Tenants without an email address will be skipped.
    </p>
    <div style="background: var(--color-info-bg); padding: 12px 14px; border-radius: var(--radius-md); margin-top: 16px; font-size: 13px; color: var(--color-info)">
      ${icon('info')} The email-sending backend isn't connected yet. This action will mark the bills as "sent" but no actual email will be delivered until you configure SMTP in Settings → Email.
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" id="cancel-send">Cancel</button>
    <button class="btn btn-primary" id="confirm-send">${icon('send')}<span>Mark as Sent</span></button>
  `;
  const { close } = openModal(content, { title: 'Send bills by email', footer });
  document.getElementById('cancel-send').addEventListener('click', close);
  document.getElementById('confirm-send').addEventListener('click', async () => {
    const { error } = await sb.from('bills').update({ email_sent_at: new Date().toISOString() })
      .eq('bill_month', SELECTED_MONTH).eq('bill_year', SELECTED_YEAR);
    if (error) { showToast(error.message, 'error'); return; }
    close();
    showToast('Bills marked as sent', 'success');
  });
}

/* ---- RECORD PAYMENT MODAL ---- */
function openRecordPaymentModal(billId, tenantId, roomId, balance) {
  const content = `
    <div style="background: var(--color-primary-50); padding: 12px 14px; border-radius: var(--radius-md); margin-bottom: 16px; font-size: 13px; color: var(--color-primary)">
      ${icon('info')} Outstanding balance: <strong>${formatMoney(balance)}</strong>
    </div>

    <div class="form-group">
      <label class="label label-required" for="pay-amount">Amount paid</label>
      <div class="input-prefix-wrap">
        <span class="input-prefix">KSh</span>
        <input class="input" id="pay-amount" type="number" min="1" step="100" required value="${balance}" />
      </div>
    </div>

    <div class="form-group">
      <label class="label label-required" for="pay-method">Method</label>
      <select class="select" id="pay-method" required>
        <option value="cash">Cash</option>
        <option value="mpesa">M-Pesa</option>
        <option value="bank">Bank Transfer</option>
        <option value="other">Other</option>
      </select>
    </div>

    <div class="form-group" id="pay-mpesa-wrap" style="display: none">
      <label class="label" for="pay-mpesa-code">M-Pesa Code</label>
      <input class="input" id="pay-mpesa-code" placeholder="e.g. QJ7X3K9P1L" style="text-transform: uppercase" />
    </div>

    <div class="form-group" id="pay-ref-wrap">
      <label class="label" for="pay-ref">Reference (optional)</label>
      <input class="input" id="pay-ref" placeholder="Receipt number, bank ref, etc." />
    </div>

    <div class="form-group">
      <label class="label label-required" for="pay-date">Payment date</label>
      <input class="input" id="pay-date" type="date" required value="${new Date().toISOString().split('T')[0]}" />
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-pay">Cancel</button>
    <button class="btn btn-primary" id="save-pay">${icon('check')}<span>Record Payment</span></button>
  `;

  const { close } = openModal(content, { title: 'Record payment', footer });

  document.getElementById('pay-method').addEventListener('change', (e) => {
    document.getElementById('pay-mpesa-wrap').style.display = e.target.value === 'mpesa' ? 'block' : 'none';
  });
  document.getElementById('cancel-pay').addEventListener('click', close);

  document.getElementById('save-pay').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const method = document.getElementById('pay-method').value;
    const mpesaCode = document.getElementById('pay-mpesa-code').value.trim();
    const reference = document.getElementById('pay-ref').value.trim();
    const date = document.getElementById('pay-date').value;

    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (!date) { showToast('Date is required', 'error'); return; }

    const payload = {
      tenant_id: tenantId,
      room_id: roomId,
      bill_id: billId,
      amount,
      method,
      mpesa_code: mpesaCode || null,
      reference: reference || null,
      payment_date: new Date(date).toISOString(),
      recorded_by: 'manual',
    };

    const { error } = await sb.from('payments').insert(payload);
    if (error) { showToast(error.message, 'error'); return; }
    close();
    showToast(`Payment of ${formatMoney(amount)} recorded`, 'success');
    loadBilling();
  });
}
