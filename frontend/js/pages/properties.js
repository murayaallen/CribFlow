/* =============================================================================
   PROPERTIES PAGE
   ============================================================================= */

(async function () {
  const user = await requireAuth();
  if (!user) return;
  await renderSidebar('properties');
  await loadProperties();

  // Open add modal if ?action=add in URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('action') === 'add') openAddPropertyModal();
})();

async function loadProperties() {
  const { data: properties, error } = await sb
    .from('properties')
    .select(`id, name, address, county, water_rate_per_unit, account_prefix, archived,
             rooms(id, status)`)
    .eq('archived', false)
    .order('created_at', { ascending: false });

  if (error) {
    showToast(error.message, 'error');
    return;
  }

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <div class="page-title">Properties</div>
        <div class="page-subtitle">${properties.length} ${properties.length === 1 ? 'property' : 'properties'} under management</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openAddPropertyModal()">${icon('plus')}<span>Add Property</span></button>
      </div>
    </header>

    ${properties.length === 0 ? renderEmptyState() : renderPropertyGrid(properties)}
  `;

  document.getElementById('page-content').innerHTML = html;
}

function renderPropertyGrid(properties) {
  return `
    <div class="property-grid">
      ${properties.map(p => {
        const rooms = p.rooms || [];
        const occupied = rooms.filter(r => r.status === 'occupied').length;
        const vacant = rooms.filter(r => r.status === 'vacant').length;
        return `
          <a href="/property-detail.html?id=${p.id}" class="property-card" style="text-decoration: none">
            <div class="property-card-header">
              <div class="property-card-name">${escapeHtml(p.name)}</div>
              ${p.address ? `<div class="property-card-address">${escapeHtml(p.address)}${p.county ? ', ' + escapeHtml(p.county) : ''}</div>` : ''}
            </div>
            <div class="property-card-body">
              <div class="property-card-stat">
                <div class="property-card-stat-value">${rooms.length}</div>
                <div class="property-card-stat-label">Rooms</div>
              </div>
              <div class="property-card-stat">
                <div class="property-card-stat-value" style="color: var(--color-success)">${occupied}</div>
                <div class="property-card-stat-label">Occupied</div>
              </div>
              <div class="property-card-stat">
                <div class="property-card-stat-value" style="color: var(--color-text-muted)">${vacant}</div>
                <div class="property-card-stat-label">Vacant</div>
              </div>
            </div>
          </a>
        `;
      }).join('')}
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="card-elevated">
      <div class="empty-state">
        <div class="empty-state-icon">${icon('building')}</div>
        <h3>No properties yet</h3>
        <p>Add your first property to start managing rooms, tenants, and rent collection.</p>
        <button class="btn btn-primary" onclick="openAddPropertyModal()">${icon('plus')}<span>Add Property</span></button>
      </div>
    </div>
  `;
}

/* ---- ADD PROPERTY MODAL ---- */
async function openAddPropertyModal() {
  // Check plan limits
  const user = await getCurrentUser();
  const { data: canAdd } = await sb.rpc('can_add_property', { p_user_id: user.id });
  if (!canAdd) {
    const { close } = openModal(`
      <div style="text-align: center; padding: 16px 0">
        <div class="stat-card-icon" style="width: 56px; height: 56px; border-radius: 14px; background: var(--color-warning-bg); color: var(--color-warning); margin: 0 auto 16px">${icon('alert')}</div>
        <h3 style="margin-bottom: 8px">Property limit reached</h3>
        <p style="font-size: 14px; color: var(--color-text-secondary); line-height: 1.6; max-width: 360px; margin: 0 auto 20px">
          Your current plan doesn't allow more properties. Upgrade to Basic or Pro to manage more.
        </p>
        <a href="/settings.html" class="btn btn-primary">${icon('zap')}<span>View Plans</span></a>
      </div>
    `, { title: 'Plan limit reached' });
    return;
  }

  const content = `
    <form id="add-property-form">
      <div class="form-group">
        <label class="label label-required" for="prop-name">Property name</label>
        <input class="input" id="prop-name" required placeholder="e.g. Sunrise Court" />
        <div class="input-help">A friendly name you'll recognise (e.g. street name, building name).</div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label" for="prop-address">Street address</label>
          <input class="input" id="prop-address" placeholder="e.g. 45 Jogoo Road" />
        </div>
        <div class="form-group">
          <label class="label" for="prop-county">County / City</label>
          <input class="input" id="prop-county" placeholder="e.g. Nairobi" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label label-required" for="prop-prefix">Account prefix</label>
          <input class="input" id="prop-prefix" required maxlength="6" placeholder="SRC" style="text-transform: uppercase" />
          <div class="input-help">Tenants will type <strong>PREFIX-A1</strong> as M-Pesa account number.</div>
        </div>
        <div class="form-group">
          <label class="label label-required" for="prop-water-rate">Water rate (KSh per unit)</label>
          <div class="input-prefix-wrap">
            <span class="input-prefix">KSh</span>
            <input class="input" id="prop-water-rate" type="number" min="0" step="0.01" required value="0" />
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="label label-required" for="prop-naming">Room naming convention</label>
        <select class="select" id="prop-naming" required>
          <option value="alphanumeric">Alphanumeric (A1, A2, B1, B2…)</option>
          <option value="numbers">Numbers (1, 2, 3, 4…)</option>
          <option value="letters">Letters (A, B, C, D…)</option>
          <option value="custom">Custom (Unit 1, Unit 2…)</option>
        </select>
      </div>

      <div class="form-group">
        <label class="label">Room groups (optional)</label>
        <div class="input-help" style="margin-bottom: 10px">Add groups of rooms by type. Each group gets its own rent. You can add more rooms later.</div>
        <div id="room-groups-list"></div>
        <button type="button" class="btn btn-secondary btn-sm" id="add-room-group" style="margin-top: 8px">
          + Add room group
        </button>
      </div>

      <div id="room-preview" style="display:none; margin-top: 4px; padding: 12px 14px; background: var(--color-surface-2); border-radius: var(--radius-md); border: 1px solid var(--color-border)">
        <div class="eyebrow" style="margin-bottom: 6px">Preview</div>
        <div id="room-preview-list" style="font-family: var(--font-mono); font-size: 12px; color: var(--color-text-secondary); line-height: 1.6"></div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" id="cancel-prop">Cancel</button>
    <button class="btn btn-primary" id="save-prop">${icon('check')}<span>Create Property</span></button>
  `;

  const { backdrop, close } = openModal(content, { title: 'Add new property', footer, size: 'lg' });

  const ROOM_TYPES = [
    { value: 'bedsitter', label: 'Bedsitter', prefix: 'BS' },
    { value: 'studio', label: 'Studio', prefix: 'ST' },
    { value: '1bedroom', label: '1 Bedroom', prefix: '1B' },
    { value: '2bedroom', label: '2 Bedroom', prefix: '2B' },
    { value: '3bedroom', label: '3 Bedroom', prefix: '3B' },
    { value: '4bedroom', label: '4 Bedroom', prefix: '4B' },
    { value: 'other', label: 'Other', prefix: 'RM' },
  ];

  let roomGroups = [];

  function renderRoomGroups() {
    const list = document.getElementById('room-groups-list');
    if (roomGroups.length === 0) {
      list.innerHTML = '';
      updateGroupPreview();
      return;
    }
    list.innerHTML = roomGroups.map((g, i) => `
      <div style="display:grid; grid-template-columns: 1fr 80px 120px 36px; gap: 8px; align-items: end; margin-bottom: 8px">
        <div>
          ${i === 0 ? '<div style="font-size:11px;font-weight:600;color:var(--color-text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Type</div>' : ''}
          <select class="select" onchange="updateGroup(${i}, 'type', this.value)">
            ${ROOM_TYPES.map(t => `<option value="${t.value}" ${g.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div>
          ${i === 0 ? '<div style="font-size:11px;font-weight:600;color:var(--color-text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Count</div>' : ''}
          <input class="input" type="number" min="1" max="200" value="${g.count}" onchange="updateGroup(${i}, 'count', this.value)" oninput="updateGroup(${i}, 'count', this.value)" />
        </div>
        <div>
          ${i === 0 ? '<div style="font-size:11px;font-weight:600;color:var(--color-text-muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em">Rent (KSh)</div>' : ''}
          <input class="input" type="number" min="0" step="500" value="${g.rent}" placeholder="0" onchange="updateGroup(${i}, 'rent', this.value)" oninput="updateGroup(${i}, 'rent', this.value)" />
        </div>
        <div>
          ${i === 0 ? '<div style="font-size:11px;margin-bottom:4px">&nbsp;</div>' : ''}
          <button type="button" class="btn btn-ghost btn-icon" onclick="removeGroup(${i})" title="Remove">✕</button>
        </div>
      </div>
    `).join('');
    updateGroupPreview();
  }

  window.updateGroup = (i, field, val) => {
    if (field === 'count') roomGroups[i].count = Math.max(1, parseInt(val) || 1);
    else if (field === 'rent') roomGroups[i].rent = parseFloat(val) || 0;
    else roomGroups[i].type = val;
    updateGroupPreview();
  };

  window.removeGroup = (i) => {
    roomGroups.splice(i, 1);
    renderRoomGroups();
  };

  function updateGroupPreview() {
    const preview = document.getElementById('room-preview');
    const list = document.getElementById('room-preview-list');
    if (roomGroups.length === 0) { preview.style.display = 'none'; return; }
    preview.style.display = 'block';
    const lines = roomGroups.map(g => {
      const t = ROOM_TYPES.find(x => x.value === g.type) || ROOM_TYPES[0];
      const samples = Array.from({ length: Math.min(g.count, 4) }, (_, i) => `${t.prefix}${i + 1}`);
      const more = g.count > 4 ? ` …+${g.count - 4}` : '';
      return `${t.label} (${g.count}): ${samples.join(', ')}${more} — KSh ${g.rent.toLocaleString()}`;
    });
    list.innerHTML = lines.join('<br>');
  }

  document.getElementById('add-room-group').addEventListener('click', () => {
    roomGroups.push({ type: 'bedsitter', count: 1, rent: 0 });
    renderRoomGroups();
  });

  // Auto-uppercase prefix
  document.getElementById('prop-prefix').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  document.getElementById('cancel-prop').addEventListener('click', close);

  document.getElementById('save-prop').addEventListener('click', async () => {
    const name = document.getElementById('prop-name').value.trim();
    const address = document.getElementById('prop-address').value.trim();
    const county = document.getElementById('prop-county').value.trim();
    const prefix = document.getElementById('prop-prefix').value.trim();
    const waterRate = parseFloat(document.getElementById('prop-water-rate').value) || 0;
    const naming = document.getElementById('prop-naming').value;

    if (!name) { showToast('Property name is required', 'error'); return; }
    if (!prefix) { showToast('Account prefix is required', 'error'); return; }

    const btn = document.getElementById('save-prop');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner spinner-sm" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div><span>Creating…</span>';

    const user = await getCurrentUser();
    const { data: property, error } = await sb
      .from('properties')
      .insert({
        user_id: user.id,
        name,
        address: address || null,
        county: county || null,
        account_prefix: prefix,
        water_rate_per_unit: waterRate,
        naming_convention: naming,
      })
      .select()
      .single();

    if (error) {
      btn.disabled = false;
      btn.innerHTML = `${icon('check')}<span>Create Property</span>`;
      showToast(error.message, 'error');
      return;
    }

    // Bulk create rooms from groups
    if (roomGroups.length > 0) {
      const rows = [];
      for (const g of roomGroups) {
        const t = ROOM_TYPES.find(x => x.value === g.type) || ROOM_TYPES[0];
        for (let i = 1; i <= g.count; i++) {
          rows.push({
            property_id: property.id,
            name: `${t.prefix}${i}`,
            unit_type: t.label,
            monthly_rent: g.rent,
            status: 'vacant',
          });
        }
      }
      const { error: roomError } = await sb.from('rooms').insert(rows);
      if (roomError) {
        showToast('Property created, but rooms failed: ' + roomError.message, 'warning');
      }
    }

    close();
    showToast(`${name} created successfully`, 'success');
    setTimeout(() => { window.location.href = `/property-detail.html?id=${property.id}`; }, 600);
  });
}
