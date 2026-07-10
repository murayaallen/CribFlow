/* =============================================================================
   TENANTS PAGE
   ============================================================================= */

let ALL_TENANTS = [];
let ALL_PROPERTIES = [];
let ALL_BALANCES = {}; // tenant_id → net KSh outstanding (positive = owes, negative = credit)
let CURRENT_FILTERS = { search: '', status: 'active', property: 'all' };

(async function () {
  const user = await requireAuth();
  if (!user) return;
  await renderSidebar('tenants');
  await loadTenants();

  // Open add modal if requested
  const params = new URLSearchParams(window.location.search);
  if (params.get('action') === 'add') openAddTenantModal(params.get('room'));
})();

async function loadTenants() {
  const [tenantsRes, propsRes, billsRes] = await Promise.all([
    sb.from('tenants').select(`*, rooms(id, name, monthly_rent, properties(id, name))`).order('created_at', { ascending: false }),
    sb.from('properties').select('id, name').eq('archived', false).order('name'),
    sb.from('bills').select('tenant_id, balance, status').gt('balance', 0),
  ]);

  if (tenantsRes.error) { showToast(tenantsRes.error.message, 'error'); return; }

  ALL_TENANTS = tenantsRes.data || [];
  ALL_PROPERTIES = propsRes.data || [];

  // Build net balance map: outstanding bills minus any credit on the tenant record
  ALL_BALANCES = {};
  (billsRes.data || []).forEach(b => {
    ALL_BALANCES[b.tenant_id] = (ALL_BALANCES[b.tenant_id] || 0) + Number(b.balance);
  });
  // Subtract credit balances
  ALL_TENANTS.forEach(t => {
    const credit = Number(t.credit_balance || 0);
    if (credit > 0) {
      ALL_BALANCES[t.id] = (ALL_BALANCES[t.id] || 0) - credit;
    }
  });

  renderPage();
}

function renderPage() {
  const filtered = filterTenants();
  const activeCount = ALL_TENANTS.filter(t => t.status === 'active').length;
  const pastCount = ALL_TENANTS.filter(t => t.status !== 'active').length;

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <div class="page-title">Tenants</div>
        <div class="page-subtitle">${activeCount} active${pastCount > 0 ? ` · ${pastCount} past` : ''}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openAddTenantModal()">${icon('plus')}<span>Add Tenant</span></button>
      </div>
    </header>

    <div class="filter-bar">
      <div class="search-input-wrap">
        ${icon('search')}
        <input class="input" id="search-input" placeholder="Search by name, phone, email…" value="${escapeHtml(CURRENT_FILTERS.search)}" />
      </div>
      <select class="select" id="property-filter" style="width: auto; min-width: 180px">
        <option value="all">All properties</option>
        ${ALL_PROPERTIES.map(p => `<option value="${p.id}" ${CURRENT_FILTERS.property === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <div class="filter-pills">
        <button class="filter-pill ${CURRENT_FILTERS.status === 'active' ? 'active' : ''}" onclick="setStatusFilter('active')">Active <span style="opacity: .6">${activeCount}</span></button>
        <button class="filter-pill ${CURRENT_FILTERS.status === 'past' ? 'active' : ''}" onclick="setStatusFilter('past')">Past <span style="opacity: .6">${pastCount}</span></button>
        <button class="filter-pill ${CURRENT_FILTERS.status === 'all' ? 'active' : ''}" onclick="setStatusFilter('all')">All</button>
      </div>
    </div>

    ${filtered.length === 0 ? renderEmptyState() : renderTable(filtered)}
  `;

  document.getElementById('page-content').innerHTML = html;

  document.getElementById('search-input').addEventListener('input', debounce((e) => {
    CURRENT_FILTERS.search = e.target.value;
    document.querySelector('.table-wrap')?.replaceWith(parseHtml(renderTable(filterTenants())));
  }, 200));
  document.getElementById('property-filter').addEventListener('change', (e) => {
    CURRENT_FILTERS.property = e.target.value;
    renderPage();
  });
}

function parseHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild;
}

function filterTenants() {
  return ALL_TENANTS.filter(t => {
    if (CURRENT_FILTERS.status === 'active' && t.status !== 'active') return false;
    if (CURRENT_FILTERS.status === 'past' && t.status === 'active') return false;
    if (CURRENT_FILTERS.property !== 'all' && t.rooms?.properties?.id !== CURRENT_FILTERS.property) return false;
    if (CURRENT_FILTERS.search) {
      const q = CURRENT_FILTERS.search.toLowerCase();
      const haystack = `${t.full_name} ${t.phone || ''} ${t.email || ''} ${t.national_id || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function renderBalanceBadge(tenantId) {
  const net = ALL_BALANCES[tenantId] || 0;
  if (net > 0)  return `<div style="font-weight:600;color:var(--color-danger)">${formatMoney(net)}</div><div style="font-size:11px;color:var(--color-danger)">Owes</div>`;
  if (net < 0)  return `<div style="font-weight:600;color:var(--color-success)">${formatMoney(Math.abs(net))}</div><div style="font-size:11px;color:var(--color-success)">Credit</div>`;
  return `<div style="font-weight:600;color:var(--color-success)">Clear</div><div style="font-size:11px;color:var(--color-text-muted)">No balance</div>`;
}

function renderTable(tenants) {
  if (tenants.length === 0) return renderEmptyState();
  return `
    <div class="table-wrap">
      <table class="table table-clickable">
        <thead>
          <tr>
            <th>Tenant</th>
            <th>Property · Unit</th>
            <th>Phone</th>
            <th>Lease End</th>
            <th>Rent</th>
            <th>Balance</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${tenants.map(t => {
            const today = new Date();
            const leaseEnd = t.lease_end ? new Date(t.lease_end) : null;
            const expiringSoon = leaseEnd && (leaseEnd - today) < 30 * 24 * 60 * 60 * 1000 && leaseEnd > today;
            const expired = leaseEnd && leaseEnd < today;

            return `
              <tr onclick="window.location.href='/tenant-detail?id=${t.id}'">
                <td>
                  <div style="display: flex; align-items: center; gap: 12px">
                    <div class="avatar avatar-sm">${getInitials(t.full_name)}</div>
                    <div>
                      <div style="font-weight: 500">${escapeHtml(t.full_name)}</div>
                      ${t.email ? `<div style="font-size: 12px; color: var(--color-text-muted)">${escapeHtml(t.email)}</div>` : ''}
                    </div>
                  </div>
                </td>
                <td>
                  <div style="font-weight: 500">${escapeHtml(t.rooms?.properties?.name || '—')}</div>
                  <div style="font-size: 12px; color: var(--color-text-muted)">Unit ${escapeHtml(t.rooms?.name || '?')}</div>
                </td>
                <td>${t.phone ? escapeHtml(t.phone) : '<span class="muted">—</span>'}</td>
                <td>
                  ${leaseEnd ? `
                    <div style="${expired ? 'color: var(--color-danger)' : expiringSoon ? 'color: var(--color-warning)' : ''}">${formatDate(t.lease_end, 'short')}</div>
                    ${expiringSoon ? '<div style="font-size: 11px; color: var(--color-warning)">Expiring soon</div>' : expired ? '<div style="font-size: 11px; color: var(--color-danger)">Expired</div>' : ''}
                  ` : '<span class="muted">No end date</span>'}
                </td>
                <td class="numeric" style="font-weight: 500">${formatMoney(t.rooms?.monthly_rent || 0)}</td>
                <td class="numeric">${renderBalanceBadge(t.id)}</td>
                <td>${t.status === 'active' ? '<span class="badge badge-success badge-dot">Active</span>' : `<span class="badge">${t.status}</span>`}</td>
                <td style="text-align: right; color: var(--color-text-muted)">${icon('chevronRight')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyState() {
  if (CURRENT_FILTERS.search || CURRENT_FILTERS.property !== 'all') {
    return `
      <div class="card-elevated">
        <div class="empty-state">
          <div class="empty-state-icon">${icon('search')}</div>
          <h3>No tenants match your filters</h3>
          <p>Try adjusting your search or filters.</p>
          <button class="btn btn-secondary" onclick="clearFilters()">Clear filters</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="card-elevated">
      <div class="empty-state">
        <div class="empty-state-icon">${icon('users')}</div>
        <h3>No tenants yet</h3>
        <p>Add your first tenant by assigning them to a vacant room in one of your properties.</p>
        <button class="btn btn-primary" onclick="openAddTenantModal()">${icon('plus')}<span>Add Tenant</span></button>
      </div>
    </div>
  `;
}

function setStatusFilter(s) { CURRENT_FILTERS.status = s; renderPage(); }
function clearFilters() {
  CURRENT_FILTERS = { search: '', status: 'active', property: 'all' };
  renderPage();
}

/* ---- ADD TENANT MODAL ---- */
async function openAddTenantModal(preselectedRoomId = null) {
  const { data: rooms } = await sb
    .from('rooms')
    .select('id, name, monthly_rent, status, properties(id, name)')
    .eq('status', 'vacant')
    .order('name');

  if (!rooms || rooms.length === 0) {
    showToast('All your rooms are occupied. Add new rooms first.', 'warning');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const roomMap = Object.fromEntries(rooms.map(r => [r.id, r]));

  const content = `
    <form id="add-tenant-form">
      <div class="form-group">
        <label class="label label-required" for="t-room">Assign to room</label>
        <select class="select" id="t-room" required>
          <option value="">— select a vacant room —</option>
          ${rooms.map(r => `<option value="${r.id}" ${preselectedRoomId === r.id ? 'selected' : ''} data-rent="${r.monthly_rent}">
            ${escapeHtml(r.properties.name)} — Unit ${escapeHtml(r.name)} (${formatMoney(r.monthly_rent)}/mo)
          </option>`).join('')}
        </select>
      </div>

      <h4 style="font-size: 12px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin: 24px 0 12px">Personal Details</h4>

      <div class="form-group">
        <label class="label label-required" for="t-name">Full name</label>
        <input class="input" id="t-name" required placeholder="e.g. Jane Mwangi" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label" for="t-id">National ID</label>
          <input class="input" id="t-id" placeholder="e.g. 12345678" />
        </div>
        <div class="form-group">
          <label class="label" for="t-phone">Phone</label>
          <input class="input" id="t-phone" type="tel" placeholder="+254 7XX XXX XXX" />
        </div>
      </div>

      <div class="form-group">
        <label class="label" for="t-email">Email</label>
        <input class="input" id="t-email" type="email" placeholder="tenant@email.com" />
        <div class="input-help">Used for sending bills, receipts, and reminders.</div>
      </div>

      <h4 style="font-size: 12px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin: 24px 0 12px">Lease Details</h4>

      <div class="form-row">
        <div class="form-group">
          <label class="label label-required" for="t-lease-start">Lease start</label>
          <input class="input" id="t-lease-start" type="date" required value="${today}" />
        </div>
        <div class="form-group">
          <label class="label" for="t-lease-end">Lease end (optional)</label>
          <input class="input" id="t-lease-end" type="date" />
        </div>
      </div>

      <h4 style="font-size: 12px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin: 24px 0 12px">Emergency Contact (optional)</h4>

      <div class="form-row">
        <div class="form-group">
          <label class="label" for="t-em-name">Name</label>
          <input class="input" id="t-em-name" placeholder="Next of kin" />
        </div>
        <div class="form-group">
          <label class="label" for="t-em-phone">Phone</label>
          <input class="input" id="t-em-phone" type="tel" placeholder="+254 7XX XXX XXX" />
        </div>
      </div>

      <!-- MOVE-IN INVOICE -->
      <div style="margin-top: 24px; border: 1px solid var(--color-border); border-radius: var(--radius-xl); overflow: hidden">
        <div style="background: var(--color-surface-2); padding: 14px 16px; display: flex; align-items: flex-start; gap: 10px">
          <input type="checkbox" id="t-gen-invoice" checked style="margin-top: 3px; width: 15px; height: 15px; flex-shrink: 0; accent-color: var(--color-primary)" />
          <div>
            <div style="font-weight: 600; font-size: 14px">Generate move-in invoice</div>
            <div style="font-size: 12px; color: var(--color-text-muted); margin-top: 2px">Creates the first bill: 1st month rent + security deposit. Uncheck for existing tenants you're registering.</div>
          </div>
        </div>
        <div id="invoice-fields" style="padding: 16px">
          <div class="form-row" style="margin-bottom: 0">
            <div class="form-group" style="margin-bottom: 12px">
              <label class="label" for="t-sec-deposit">Security deposit</label>
              <div class="input-prefix-wrap">
                <span class="input-prefix">KSh</span>
                <input class="input" id="t-sec-deposit" type="number" min="0" step="100" value="0" />
              </div>
              <div class="input-help" id="t-deposit-hint">Select a room — defaults to 2× monthly rent</div>
            </div>
            <div class="form-group" style="margin-bottom: 12px">
              <label class="label" for="t-water-dep">Water meter deposit</label>
              <div class="input-prefix-wrap">
                <span class="input-prefix">KSh</span>
                <input class="input" id="t-water-dep" type="number" min="0" step="100" value="0" />
              </div>
              <div class="input-help">Optional — e.g. KSh 2,000</div>
            </div>
          </div>
          <div id="t-invoice-preview" style="background: var(--color-primary-50); border-radius: var(--radius-md); padding: 12px 14px; font-size: 13px; color: var(--color-primary)">
            Select a room to see the move-in invoice breakdown.
          </div>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-t">Cancel</button>
    <button class="btn btn-primary" id="save-t">${icon('check')}<span>Add Tenant</span></button>
  `;

  const { close } = openModal(content, { title: 'Add new tenant', footer, size: 'lg' });

  // Invoice preview updater
  function updateInvoicePreview() {
    const roomEl = document.getElementById('t-room');
    const rent = Number(roomEl.selectedOptions[0]?.dataset.rent || 0);
    const secDep = parseFloat(document.getElementById('t-sec-deposit').value) || 0;
    const waterDep = parseFloat(document.getElementById('t-water-dep').value) || 0;
    const total = rent + secDep + waterDep;
    const preview = document.getElementById('t-invoice-preview');
    if (!preview) return;
    if (!rent) { preview.textContent = 'Select a room to see the move-in invoice breakdown.'; return; }
    preview.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px">Move-in Invoice Breakdown</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>1st month rent</span><strong>${formatMoney(rent)}</strong></div>
      ${secDep > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Security deposit</span><strong>${formatMoney(secDep)}</strong></div>` : ''}
      ${waterDep > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Water meter deposit</span><strong>${formatMoney(waterDep)}</strong></div>` : ''}
      <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(15,76,58,0.2);padding-top:8px;margin-top:4px;font-weight:700"><span>Total due on move-in</span><strong>${formatMoney(total)}</strong></div>
    `;
  }

  // Auto-fill security deposit to 2× rent on room selection
  document.getElementById('t-room').addEventListener('change', (e) => {
    const rent = Number(e.target.selectedOptions[0]?.dataset.rent || 0);
    if (rent > 0) {
      document.getElementById('t-sec-deposit').value = rent * 2;
      document.getElementById('t-deposit-hint').textContent = `Auto-set to 2× rent — adjust as needed`;
    }
    updateInvoicePreview();
  });

  document.getElementById('t-gen-invoice').addEventListener('change', (e) => {
    document.getElementById('invoice-fields').style.display = e.target.checked ? 'block' : 'none';
  });

  document.getElementById('t-sec-deposit').addEventListener('input', updateInvoicePreview);
  document.getElementById('t-water-dep').addEventListener('input', updateInvoicePreview);

  // Trigger preview if room preselected
  if (preselectedRoomId) {
    const roomEl = document.getElementById('t-room');
    if (roomEl.value) {
      const rent = Number(roomEl.selectedOptions[0]?.dataset.rent || 0);
      document.getElementById('t-sec-deposit').value = rent * 2;
      updateInvoicePreview();
    }
  }

  document.getElementById('cancel-t').addEventListener('click', close);

  document.getElementById('save-t').addEventListener('click', async () => {
    const room_id = document.getElementById('t-room').value;
    const full_name = document.getElementById('t-name').value.trim();
    const lease_start = document.getElementById('t-lease-start').value;

    if (!room_id) { showToast('Please choose a room', 'error'); return; }
    if (!full_name) { showToast('Tenant name is required', 'error'); return; }
    if (!lease_start) { showToast('Lease start date is required', 'error'); return; }

    const genInvoice = document.getElementById('t-gen-invoice').checked;
    const secDeposit = genInvoice ? (parseFloat(document.getElementById('t-sec-deposit').value) || 0) : 0;
    const waterDeposit = genInvoice ? (parseFloat(document.getElementById('t-water-dep').value) || 0) : 0;
    const room = roomMap[room_id];
    const rent = Number(room?.monthly_rent || 0);

    const payload = {
      room_id,
      full_name,
      national_id: document.getElementById('t-id').value.trim() || null,
      phone: document.getElementById('t-phone').value.trim() || null,
      email: document.getElementById('t-email').value.trim() || null,
      lease_start,
      lease_end: document.getElementById('t-lease-end').value || null,
      deposit_paid: secDeposit,
      emergency_contact_name: document.getElementById('t-em-name').value.trim() || null,
      emergency_contact_phone: document.getElementById('t-em-phone').value.trim() || null,
      status: 'active',
      move_in_date: lease_start,
    };

    const btn = document.getElementById('save-t');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div><span>Saving…</span>';

    const { data: newTenant, error } = await sb.from('tenants').insert(payload).select().single();
    if (error) {
      btn.disabled = false;
      btn.innerHTML = `${icon('check')}<span>Add Tenant</span>`;
      showToast(error.message, 'error');
      return;
    }

    // Generate move-in invoice if requested
    if (genInvoice && rent > 0) {
      const leaseDate = new Date(lease_start);
      const billMonth = leaseDate.getMonth() + 1;
      const billYear = leaseDate.getFullYear();
      const otherCharges = secDeposit + waterDeposit;
      const descParts = [];
      if (secDeposit > 0) descParts.push(`Security deposit: ${formatMoney(secDeposit)}`);
      if (waterDeposit > 0) descParts.push(`Water deposit: ${formatMoney(waterDeposit)}`);

      const { error: billErr } = await sb.from('bills').insert({
        tenant_id: newTenant.id,
        room_id,
        bill_month: billMonth,
        bill_year: billYear,
        rent_amount: rent,
        water_amount: 0,
        other_charges: otherCharges,
        other_charges_description: descParts.length ? descParts.join(' + ') : null,
        total_due: rent + otherCharges,
        due_date: lease_start,
        status: 'unpaid',
      });

      if (billErr) {
        showToast(`${full_name} added — but move-in invoice failed: ${billErr.message}`, 'warning');
        close();
        loadTenants();
        return;
      }
    }

    close();
    showToast(
      genInvoice && rent > 0
        ? `${full_name} added · move-in invoice of ${formatMoney(rent + secDeposit + waterDeposit)} generated`
        : `${full_name} added successfully`,
      'success'
    );
    loadTenants();
  });
}
