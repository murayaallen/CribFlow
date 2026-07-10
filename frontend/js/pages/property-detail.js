/* =============================================================================
   PROPERTY DETAIL PAGE
   Shows a single property with its room grid (status color-coded)
   ============================================================================= */

let CURRENT_PROPERTY = null;
let CURRENT_FILTER = 'all';

(async function () {
  const user = await requireAuth();
  if (!user) return;

  const params = new URLSearchParams(window.location.search);
  const propertyId = params.get('id');
  if (!propertyId) {
    document.getElementById('page-content').innerHTML = renderNotFound();
    await renderSidebar('properties');
    return;
  }

  await renderSidebar('properties');
  await loadPropertyDetail(propertyId);
})();

async function loadPropertyDetail(propertyId) {
  const month = currentMonth();
  const year = currentYear();

  const [propRes, roomsRes, billsRes, tenantsRes] = await Promise.all([
    sb.from('properties').select('*').eq('id', propertyId).single(),
    sb.from('rooms').select('*').eq('property_id', propertyId).order('name'),
    sb.from('bills').select('id, room_id, total_due, total_paid, balance, status')
      .eq('bill_month', month).eq('bill_year', year),
    sb.from('tenants').select('id, full_name, room_id, status').eq('status', 'active'),
  ]);

  if (propRes.error) {
    document.getElementById('page-content').innerHTML = renderNotFound();
    return;
  }

  CURRENT_PROPERTY = propRes.data;
  const rooms = roomsRes.data || [];
  const bills = billsRes.data || [];
  const tenants = tenantsRes.data || [];

  // Index data
  const billByRoom = {};
  bills.forEach(b => billByRoom[b.room_id] = b);
  const tenantByRoom = {};
  tenants.forEach(t => tenantByRoom[t.room_id] = t);

  // Annotate rooms with derived status
  const annotatedRooms = rooms.map(r => {
    const tenant = tenantByRoom[r.id];
    const bill = billByRoom[r.id];
    let derivedStatus = 'vacant';
    if (tenant) {
      if (!bill) derivedStatus = 'occupied';
      else if (bill.status === 'paid') derivedStatus = 'paid';
      else if (bill.status === 'partial') derivedStatus = 'partial';
      else derivedStatus = 'unpaid';
    }
    return { ...r, tenant, bill, derivedStatus };
  });

  renderPage(annotatedRooms);
}

function renderPage(rooms) {
  const counts = {
    all: rooms.length,
    paid: rooms.filter(r => r.derivedStatus === 'paid').length,
    partial: rooms.filter(r => r.derivedStatus === 'partial').length,
    unpaid: rooms.filter(r => r.derivedStatus === 'unpaid').length,
    occupied: rooms.filter(r => r.derivedStatus === 'occupied').length,
    vacant: rooms.filter(r => r.derivedStatus === 'vacant').length,
  };

  const filtered = CURRENT_FILTER === 'all'
    ? rooms
    : rooms.filter(r => r.derivedStatus === CURRENT_FILTER);

  const totalRent = rooms.reduce((s, r) => s + Number(r.monthly_rent || 0), 0);
  const occupiedRent = rooms.filter(r => r.tenant).reduce((s, r) => s + Number(r.monthly_rent || 0), 0);

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <a href="/properties" class="btn btn-ghost btn-sm" style="padding: 4px 8px; margin-bottom: 8px">${icon('chevronLeft')}<span>All properties</span></a>
        <div class="page-title">${escapeHtml(CURRENT_PROPERTY.name)}</div>
        <div class="page-subtitle">
          ${CURRENT_PROPERTY.address ? escapeHtml(CURRENT_PROPERTY.address) : 'No address set'}
          ${CURRENT_PROPERTY.county ? ', ' + escapeHtml(CURRENT_PROPERTY.county) : ''}
          · Account prefix: <strong>${escapeHtml(CURRENT_PROPERTY.account_prefix || '—')}</strong>
          · Water: <strong>${formatMoney(CURRENT_PROPERTY.water_rate_per_unit)}/unit</strong>
        </div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="openEditPropertyModal()">${icon('edit')}<span>Edit</span></button>
        <button class="btn btn-primary" onclick="openAddRoomModal()">${icon('plus')}<span>Add Room</span></button>
      </div>
    </header>

    <!-- STATS -->
    <section class="grid-4 section">
      ${renderStat('Total Rooms', rooms.length, 'door', `${counts.occupied + counts.paid + counts.partial + counts.unpaid} occupied`)}
      ${renderStat('Monthly Rent Roll', formatMoney(totalRent), 'wallet', `${formatMoney(occupiedRent)} from occupied`)}
      ${renderStat('Vacancies', counts.vacant, 'home', counts.vacant > 0 ? 'Available now' : 'Fully occupied')}
      ${renderStat('Active Tenants', counts.occupied + counts.paid + counts.partial + counts.unpaid, 'users', 'Currently leasing')}
    </section>

    <!-- FILTER BAR -->
    <div class="filter-bar">
      <div class="filter-pills">
        <button class="filter-pill ${CURRENT_FILTER === 'all' ? 'active' : ''}" onclick="setFilter('all')">All <span style="opacity: .6">${counts.all}</span></button>
        <button class="filter-pill ${CURRENT_FILTER === 'paid' ? 'active' : ''}" onclick="setFilter('paid')">Paid <span style="opacity: .6">${counts.paid}</span></button>
        <button class="filter-pill ${CURRENT_FILTER === 'partial' ? 'active' : ''}" onclick="setFilter('partial')">Partial <span style="opacity: .6">${counts.partial}</span></button>
        <button class="filter-pill ${CURRENT_FILTER === 'unpaid' ? 'active' : ''}" onclick="setFilter('unpaid')">Unpaid <span style="opacity: .6">${counts.unpaid}</span></button>
        <button class="filter-pill ${CURRENT_FILTER === 'occupied' ? 'active' : ''}" onclick="setFilter('occupied')">No Bill <span style="opacity: .6">${counts.occupied}</span></button>
        <button class="filter-pill ${CURRENT_FILTER === 'vacant' ? 'active' : ''}" onclick="setFilter('vacant')">Vacant <span style="opacity: .6">${counts.vacant}</span></button>
      </div>
      <div style="margin-left: auto" class="legend">
        <div class="legend-item"><span class="legend-dot" style="background: var(--color-success)"></span>Paid</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--color-warning)"></span>Partial</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--color-danger)"></span>Unpaid</div>
        <div class="legend-item"><span class="legend-dot" style="background: var(--color-text-muted)"></span>Vacant</div>
      </div>
    </div>

    <!-- ROOM GRID -->
    ${filtered.length === 0 ? renderEmptyRooms() : `
      <div class="room-grid">
        ${filtered.map(r => renderRoomTile(r)).join('')}
      </div>
    `}
  `;

  document.getElementById('page-content').innerHTML = html;
}

function renderStat(label, value, iconName, meta) {
  return `
    <div class="stat-card">
      <div class="stat-card-header">
        <div class="stat-card-label">${label}</div>
        <div class="stat-card-icon">${icon(iconName)}</div>
      </div>
      <div class="stat-card-value numeric">${value}</div>
      <div class="stat-card-meta">${meta}</div>
    </div>
  `;
}

function renderRoomTile(room) {
  const statusClass = `status-${room.derivedStatus}`;
  const tenantLine = room.tenant
    ? escapeHtml(room.tenant.full_name)
    : '<span style="color: var(--color-text-muted); font-style: italic">Vacant</span>';

  const meta = room.bill
    ? `<span class="muted">${room.bill.status === 'paid' ? 'Paid' : 'Balance'}</span><span class="room-tile-amount">${formatMoney(room.bill.balance)}</span>`
    : `<span class="muted">Rent</span><span class="room-tile-amount">${formatMoney(room.monthly_rent)}</span>`;

  return `
    <div class="room-tile ${statusClass}" onclick="openRoomDetail('${room.id}')">
      <div class="room-tile-name">${escapeHtml(room.name)}</div>
      <div class="room-tile-tenant">${tenantLine}</div>
      <div class="room-tile-meta">${meta}</div>
    </div>
  `;
}

function renderEmptyRooms() {
  return `
    <div class="card-elevated">
      <div class="empty-state">
        <div class="empty-state-icon">${icon('door')}</div>
        <h3>${CURRENT_FILTER === 'all' ? 'No rooms yet' : 'No rooms match this filter'}</h3>
        <p>${CURRENT_FILTER === 'all'
          ? 'Add your first room to start tracking occupancy and rent.'
          : 'Try a different filter or add more rooms.'}</p>
        ${CURRENT_FILTER === 'all'
          ? `<button class="btn btn-primary" onclick="openAddRoomModal()">${icon('plus')}<span>Add Room</span></button>`
          : `<button class="btn btn-secondary" onclick="setFilter('all')">View all rooms</button>`}
      </div>
    </div>
  `;
}

function renderNotFound() {
  return `
    <div class="card-elevated" style="margin-top: 80px">
      <div class="empty-state">
        <div class="empty-state-icon">${icon('alert')}</div>
        <h3>Property not found</h3>
        <p>The property you're looking for doesn't exist or you don't have access to it.</p>
        <a href="/properties" class="btn btn-primary">Back to Properties</a>
      </div>
    </div>
  `;
}

function setFilter(filter) {
  CURRENT_FILTER = filter;
  loadPropertyDetail(CURRENT_PROPERTY.id);
}

/* ---- ADD ROOM MODAL ---- */
function openAddRoomModal() {
  const content = `
    <form id="add-room-form">
      <div style="background: var(--color-primary-50); border: 1px solid var(--color-primary-100); padding: 12px 14px; border-radius: var(--radius-md); margin-bottom: 16px; font-size: 13px; color: var(--color-primary)">
        ${icon('info', 'icon')} Adding rooms to <strong>${escapeHtml(CURRENT_PROPERTY.name)}</strong>
      </div>

      <div class="form-group">
        <label class="label label-required" for="room-mode">How many rooms?</label>
        <select class="select" id="room-mode">
          <option value="single">Add a single room</option>
          <option value="bulk">Bulk-add multiple rooms</option>
        </select>
      </div>

      <div id="single-mode">
        <div class="form-group">
          <label class="label label-required" for="room-name">Room name</label>
          <input class="input" id="room-name" required placeholder="e.g. A1, B2, Unit 3" />
          <div class="input-help">Tenants will use this in M-Pesa as <strong>${CURRENT_PROPERTY.account_prefix}-NAME</strong></div>
        </div>
      </div>

      <div id="bulk-mode" style="display: none">
        <div class="form-row">
          <div class="form-group">
            <label class="label label-required" for="bulk-count">Number of rooms</label>
            <input class="input" id="bulk-count" type="number" min="1" max="100" value="5" />
          </div>
          <div class="form-group">
            <label class="label" for="bulk-start">Starting from</label>
            <input class="input" id="bulk-start" type="number" min="1" value="1" />
            <div class="input-help">Skip names already used.</div>
          </div>
        </div>
        <div id="bulk-preview" style="padding: 10px 14px; background: var(--color-surface-2); border-radius: var(--radius-md); font-family: var(--font-mono); font-size: 12px; color: var(--color-text-secondary); margin-bottom: 16px"></div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label" for="room-type">Unit type (optional)</label>
          <select class="select" id="room-type">
            <option value="">— choose —</option>
            <option value="bedsitter">Bedsitter</option>
            <option value="single">Single Room</option>
            <option value="1br">1 Bedroom</option>
            <option value="2br">2 Bedroom</option>
            <option value="3br">3 Bedroom</option>
            <option value="studio">Studio</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="label label-required" for="room-rent">Monthly rent</label>
          <div class="input-prefix-wrap">
            <span class="input-prefix">KSh</span>
            <input class="input" id="room-rent" type="number" min="0" step="100" required value="0" />
          </div>
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-room">Cancel</button>
    <button class="btn btn-primary" id="save-room">${icon('check')}<span>Save</span></button>
  `;

  const { backdrop, close } = openModal(content, { title: 'Add room(s)', footer });

  // Bulk preview
  const updateBulkPreview = () => {
    const count = parseInt(document.getElementById('bulk-count').value) || 0;
    const start = parseInt(document.getElementById('bulk-start').value) || 1;
    const names = generateRoomNames(CURRENT_PROPERTY.naming_convention, start + count - 1).slice(start - 1, start - 1 + count);
    const preview = document.getElementById('bulk-preview');
    if (count === 0) preview.textContent = 'Set a count to preview names…';
    else preview.textContent = names.slice(0, 16).join('  ·  ') + (names.length > 16 ? `  …and ${names.length - 16} more` : '');
  };

  document.getElementById('room-mode').addEventListener('change', (e) => {
    const isBulk = e.target.value === 'bulk';
    document.getElementById('single-mode').style.display = isBulk ? 'none' : 'block';
    document.getElementById('bulk-mode').style.display = isBulk ? 'block' : 'none';
    if (isBulk) updateBulkPreview();
  });

  document.getElementById('bulk-count').addEventListener('input', updateBulkPreview);
  document.getElementById('bulk-start').addEventListener('input', updateBulkPreview);

  document.getElementById('cancel-room').addEventListener('click', close);

  document.getElementById('save-room').addEventListener('click', async () => {
    const mode = document.getElementById('room-mode').value;
    const unitType = document.getElementById('room-type').value;
    const rent = parseFloat(document.getElementById('room-rent').value) || 0;

    let rows = [];
    if (mode === 'single') {
      const name = document.getElementById('room-name').value.trim();
      if (!name) { showToast('Room name is required', 'error'); return; }
      rows = [{ property_id: CURRENT_PROPERTY.id, name, monthly_rent: rent, unit_type: unitType || null, status: 'vacant' }];
    } else {
      const count = parseInt(document.getElementById('bulk-count').value) || 0;
      const start = parseInt(document.getElementById('bulk-start').value) || 1;
      if (count === 0) { showToast('Enter a number of rooms', 'error'); return; }
      const names = generateRoomNames(CURRENT_PROPERTY.naming_convention, start + count - 1).slice(start - 1, start - 1 + count);
      rows = names.map(name => ({ property_id: CURRENT_PROPERTY.id, name, monthly_rent: rent, unit_type: unitType || null, status: 'vacant' }));
    }

    const btn = document.getElementById('save-room');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div><span>Saving…</span>';

    const { error } = await sb.from('rooms').insert(rows);

    if (error) {
      btn.disabled = false;
      btn.innerHTML = `${icon('check')}<span>Save</span>`;
      showToast(error.message, 'error');
      return;
    }

    close();
    showToast(`${rows.length} ${rows.length === 1 ? 'room' : 'rooms'} added`, 'success');
    loadPropertyDetail(CURRENT_PROPERTY.id);
  });
}

/* ---- ROOM DETAIL MODAL ---- */
async function openRoomDetail(roomId) {
  const [roomRes, tenantRes, billRes, paymentsRes] = await Promise.all([
    sb.from('rooms').select('*').eq('id', roomId).single(),
    sb.from('tenants').select('*').eq('room_id', roomId).eq('status', 'active').maybeSingle(),
    sb.from('bills').select('*').eq('room_id', roomId).eq('bill_month', currentMonth()).eq('bill_year', currentYear()).maybeSingle(),
    sb.from('payments').select('*').eq('room_id', roomId).order('payment_date', { ascending: false }).limit(5),
  ]);

  const room = roomRes.data;
  const tenant = tenantRes.data;
  const bill = billRes.data;
  const payments = paymentsRes.data || [];

  const tenantSection = tenant ? `
    <div class="detail-list">
      <div class="detail-row"><span class="detail-label">Tenant</span><span class="detail-value">${escapeHtml(tenant.full_name)}</span></div>
      ${tenant.phone ? `<div class="detail-row"><span class="detail-label">Phone</span><span class="detail-value">${escapeHtml(tenant.phone)}</span></div>` : ''}
      ${tenant.email ? `<div class="detail-row"><span class="detail-label">Email</span><span class="detail-value">${escapeHtml(tenant.email)}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Lease started</span><span class="detail-value">${formatDate(tenant.lease_start)}</span></div>
      ${tenant.lease_end ? `<div class="detail-row"><span class="detail-label">Lease ends</span><span class="detail-value">${formatDate(tenant.lease_end)}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label">Deposit paid</span><span class="detail-value">${formatMoney(tenant.deposit_paid)}</span></div>
    </div>
    <div style="margin-top: 16px; display: flex; gap: 8px">
      <a href="/tenant-detail?id=${tenant.id}" class="btn btn-secondary btn-sm">${icon('user')}<span>Full profile</span></a>
    </div>
  ` : `
    <div class="empty-state" style="padding: 32px 16px">
      <div class="empty-state-icon" style="width: 44px; height: 44px">${icon('user')}</div>
      <h3 style="font-size: 14px">No tenant assigned</h3>
      <p style="font-size: 13px">This room is currently vacant.</p>
      <a href="/tenants?action=add&room=${room.id}" class="btn btn-primary btn-sm">${icon('plus')}<span>Add tenant</span></a>
    </div>
  `;

  const billSection = bill ? `
    <div class="detail-list">
      <div class="detail-row"><span class="detail-label">Rent</span><span class="detail-value">${formatMoney(bill.rent_amount)}</span></div>
      <div class="detail-row"><span class="detail-label">Water</span><span class="detail-value">${formatMoney(bill.water_amount)}</span></div>
      ${Number(bill.late_fee) > 0 ? `<div class="detail-row"><span class="detail-label">Late fee</span><span class="detail-value">${formatMoney(bill.late_fee)}</span></div>` : ''}
      <div class="detail-row"><span class="detail-label" style="font-weight: 600">Total due</span><span class="detail-value" style="font-weight: 600">${formatMoney(bill.total_due)}</span></div>
      <div class="detail-row"><span class="detail-label">Paid</span><span class="detail-value">${formatMoney(bill.total_paid)}</span></div>
      <div class="detail-row"><span class="detail-label">Balance</span><span class="detail-value" style="color: ${Number(bill.balance) > 0 ? 'var(--color-danger)' : 'var(--color-success)'}">${formatMoney(bill.balance)}</span></div>
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${billStatusBadge(bill.status)}</span></div>
    </div>
  ` : `
    <p style="color: var(--color-text-muted); font-size: 13px; padding: 12px 0">No bill generated for ${monthName(currentMonth())} ${currentYear()} yet.</p>
  `;

  const paymentsSection = payments.length === 0 ? '' : `
    <h4 style="margin: 24px 0 12px; font-size: 13px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600">Recent Payments</h4>
    ${payments.map(p => `
      <div class="detail-row">
        <span class="detail-label">${formatDate(p.payment_date, 'short')} · ${p.method.toUpperCase()}</span>
        <span class="detail-value" style="color: var(--color-success)">+${formatMoney(p.amount)}</span>
      </div>
    `).join('')}
  `;

  const content = `
    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border)">
      <div style="width: 56px; height: 56px; border-radius: 12px; background: var(--color-primary-50); color: var(--color-primary); display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600">${escapeHtml(room.name)}</div>
      <div style="flex: 1">
        <div style="font-size: 18px; font-weight: 600">${escapeHtml(room.name)}</div>
        <div style="font-size: 13px; color: var(--color-text-secondary)">${room.unit_type || 'Room'} · <span id="room-rent-display">${formatMoney(room.monthly_rent)}/month</span> · ${roomStatusBadge(room.status)}</div>
      </div>
    </div>

    <h4 style="font-size: 13px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-bottom: 12px">Current Tenant</h4>
    ${tenantSection}

    <h4 style="margin: 24px 0 12px; font-size: 13px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600">Bill — ${monthName(currentMonth())} ${currentYear()}</h4>
    ${billSection}
    ${paymentsSection}
  `;

  const footer = `
    <button class="btn btn-secondary" id="edit-room-btn">${icon('edit')}<span>Edit Room</span></button>
    ${!tenant ? `<a href="/tenants?action=add&room=${room.id}" class="btn btn-primary">${icon('plus')}<span>Add Tenant</span></a>` : ''}
  `;

  const { close } = openModal(content, { title: `Room ${room.name}`, size: 'lg', footer });
  document.getElementById('edit-room-btn').addEventListener('click', () => {
    close();
    openEditRoomModal(room);
  });
}

/* ---- EDIT PROPERTY MODAL ---- */
function openEditPropertyModal() {
  const content = `
    <form id="edit-property-form">
      <div class="form-group">
        <label class="label label-required" for="ep-name">Property name</label>
        <input class="input" id="ep-name" required value="${escapeHtml(CURRENT_PROPERTY.name)}" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label" for="ep-address">Address</label>
          <input class="input" id="ep-address" value="${escapeHtml(CURRENT_PROPERTY.address || '')}" />
        </div>
        <div class="form-group">
          <label class="label" for="ep-county">County / City</label>
          <input class="input" id="ep-county" value="${escapeHtml(CURRENT_PROPERTY.county || '')}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label label-required" for="ep-prefix">Account prefix</label>
          <input class="input" id="ep-prefix" required value="${escapeHtml(CURRENT_PROPERTY.account_prefix || '')}" style="text-transform: uppercase" />
        </div>
        <div class="form-group">
          <label class="label label-required" for="ep-water">Water rate (KSh/unit)</label>
          <div class="input-prefix-wrap">
            <span class="input-prefix">KSh</span>
            <input class="input" id="ep-water" type="number" min="0" step="0.01" required value="${CURRENT_PROPERTY.water_rate_per_unit}" />
          </div>
        </div>
      </div>

      <div style="border-top: 1px solid var(--color-border); margin-top: 24px; padding-top: 16px">
        <button type="button" class="btn btn-ghost" id="archive-btn" style="color: var(--color-danger)">${icon('trash')}<span>Archive this property</span></button>
        <div class="input-help" style="margin-top: 6px">Archiving hides the property but preserves all data and history.</div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-edit">Cancel</button>
    <button class="btn btn-primary" id="save-edit">${icon('check')}<span>Save Changes</span></button>
  `;

  const { backdrop, close } = openModal(content, { title: 'Edit property', footer, size: 'lg' });

  document.getElementById('ep-prefix').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  document.getElementById('cancel-edit').addEventListener('click', close);

  document.getElementById('archive-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Archive this property?',
      message: `${CURRENT_PROPERTY.name} will be hidden from your dashboard. You can restore it later. All tenants, bills, and payments are preserved.`,
      confirmText: 'Yes, Archive',
      danger: true,
    });
    if (!ok) return;
    await sb.from('properties').update({ archived: true }).eq('id', CURRENT_PROPERTY.id);
    showToast('Property archived', 'success');
    setTimeout(() => { window.location.href = '/properties'; }, 600);
  });

  document.getElementById('save-edit').addEventListener('click', async () => {
    const updates = {
      name: document.getElementById('ep-name').value.trim(),
      address: document.getElementById('ep-address').value.trim() || null,
      county: document.getElementById('ep-county').value.trim() || null,
      account_prefix: document.getElementById('ep-prefix').value.trim(),
      water_rate_per_unit: parseFloat(document.getElementById('ep-water').value) || 0,
    };

    const { error } = await sb.from('properties').update(updates).eq('id', CURRENT_PROPERTY.id);
    if (error) { showToast(error.message, 'error'); return; }
    close();
    showToast('Property updated', 'success');
    loadPropertyDetail(CURRENT_PROPERTY.id);
  });
}

/* ---- EDIT ROOM MODAL ---- */
function openEditRoomModal(room) {
  const unitTypes = [
    { value: 'bedsitter', label: 'Bedsitter' },
    { value: 'single', label: 'Single Room' },
    { value: '1br', label: '1 Bedroom' },
    { value: '2br', label: '2 Bedroom' },
    { value: '3br', label: '3 Bedroom' },
    { value: 'studio', label: 'Studio' },
    { value: 'other', label: 'Other' },
  ];

  const content = `
    <div style="background: var(--color-surface-2); border-radius: 10px; padding: 12px 14px; margin-bottom: 20px; font-size: 13px; color: var(--color-text-secondary)">
      ${icon('info')} Rent changes take effect on the next bill generation. Existing bills are not retroactively adjusted.
    </div>

    <div class="form-group">
      <label class="label label-required" for="er-rent">Monthly rent (KSh)</label>
      <div class="input-prefix-wrap">
        <span class="input-prefix">KSh</span>
        <input class="input" id="er-rent" type="number" min="0" step="100" value="${room.monthly_rent}" />
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="label" for="er-type">Unit type</label>
        <select class="select" id="er-type">
          <option value="">— none —</option>
          ${unitTypes.map(t => `<option value="${t.value}" ${room.unit_type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="label" for="er-status">Status</label>
        <select class="select" id="er-status">
          <option value="vacant" ${room.status === 'vacant' ? 'selected' : ''}>Vacant</option>
          <option value="occupied" ${room.status === 'occupied' ? 'selected' : ''}>Occupied</option>
          <option value="maintenance" ${room.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label class="label" for="er-notes">Notes</label>
      <textarea class="textarea" id="er-notes" rows="2" placeholder="Any room-specific notes…">${escapeHtml(room.notes || '')}</textarea>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-er">Cancel</button>
    <button class="btn btn-primary" id="save-er">${icon('check')}<span>Save Changes</span></button>
  `;

  const { close } = openModal(content, { title: `Edit Room ${room.name}`, footer });

  document.getElementById('cancel-er').addEventListener('click', close);

  document.getElementById('save-er').addEventListener('click', async () => {
    const rent = parseFloat(document.getElementById('er-rent').value);
    if (isNaN(rent) || rent < 0) { showToast('Enter a valid rent amount', 'error'); return; }

    const btn = document.getElementById('save-er');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div><span>Saving…</span>';

    const { error } = await sb.from('rooms').update({
      monthly_rent: rent,
      unit_type: document.getElementById('er-type').value || null,
      status: document.getElementById('er-status').value,
      notes: document.getElementById('er-notes').value.trim() || null,
    }).eq('id', room.id);

    if (error) {
      btn.disabled = false;
      btn.innerHTML = `${icon('check')}<span>Save Changes</span>`;
      showToast(error.message, 'error');
      return;
    }

    close();
    showToast(`Room ${room.name} updated — rent set to ${formatMoney(rent)}/month`, 'success');
    loadPropertyDetail(CURRENT_PROPERTY.id);
  });
}
