/* =============================================================================
   REPORTS PAGE
   Monthly income summary, arrears, vacancy
   ============================================================================= */

let CURRENT_REPORT = 'monthly';
let SELECTED_MONTH = currentMonth();
let SELECTED_YEAR = currentYear();
let SELECTED_PROPERTY = 'all';
let ALL_PROPERTIES = [];

(async function () {
  const user = await requireAuth();
  if (!user) return;
  await renderSidebar('reports');

  const { data: props } = await sb.from('properties').select('id, name').eq('archived', false).order('name');
  ALL_PROPERTIES = props || [];
  await loadReport();
})();

async function loadReport() {
  if (CURRENT_REPORT === 'monthly') await loadMonthlyReport();
  else if (CURRENT_REPORT === 'arrears') await loadArrearsReport();
  else if (CURRENT_REPORT === 'vacancy') await loadVacancyReport();
}

function renderHeader() {
  return `
    <header class="page-header">
      <div class="page-title-block">
        <div class="page-title">Reports</div>
        <div class="page-subtitle">Income, arrears, and vacancy across your portfolio.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" onclick="window.print()">${icon('download')}<span>Print / PDF</span></button>
      </div>
    </header>

    <div class="tabs">
      <div class="tab ${CURRENT_REPORT === 'monthly' ? 'active' : ''}" onclick="setReport('monthly')">Monthly Income</div>
      <div class="tab ${CURRENT_REPORT === 'arrears' ? 'active' : ''}" onclick="setReport('arrears')">Arrears</div>
      <div class="tab ${CURRENT_REPORT === 'vacancy' ? 'active' : ''}" onclick="setReport('vacancy')">Vacancy</div>
    </div>
  `;
}

/* ---- MONTHLY INCOME REPORT ---- */
async function loadMonthlyReport() {
  let query = sb.from('bills').select(`*, rooms(properties(id, name))`)
    .eq('bill_month', SELECTED_MONTH).eq('bill_year', SELECTED_YEAR);
  const { data: bills } = await query;
  let filtered = bills || [];
  if (SELECTED_PROPERTY !== 'all') {
    filtered = filtered.filter(b => b.rooms?.properties?.id === SELECTED_PROPERTY);
  }

  // Group by property
  const byProperty = {};
  filtered.forEach(b => {
    const propId = b.rooms?.properties?.id;
    const propName = b.rooms?.properties?.name || 'Unknown';
    if (!byProperty[propId]) byProperty[propId] = { name: propName, bills: 0, due: 0, paid: 0, water: 0, rent: 0 };
    byProperty[propId].bills++;
    byProperty[propId].due += Number(b.total_due);
    byProperty[propId].paid += Number(b.total_paid);
    byProperty[propId].water += Number(b.water_amount);
    byProperty[propId].rent += Number(b.rent_amount);
  });

  const totalDue = filtered.reduce((s, b) => s + Number(b.total_due), 0);
  const totalPaid = filtered.reduce((s, b) => s + Number(b.total_paid), 0);
  const totalRent = filtered.reduce((s, b) => s + Number(b.rent_amount), 0);
  const totalWater = filtered.reduce((s, b) => s + Number(b.water_amount), 0);
  const collectionRate = totalDue ? Math.round((totalPaid / totalDue) * 100) : 0;

  const html = `
    ${renderHeader()}

    <div class="filter-bar">
      <select class="select" id="month-sel" style="width: auto; min-width: 140px">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === SELECTED_MONTH ? 'selected' : ''}>${fullMonthName(m)}</option>`).join('')}
      </select>
      <select class="select" id="year-sel" style="width: auto; min-width: 100px">
        ${[currentYear() - 2, currentYear() - 1, currentYear(), currentYear() + 1].map(y => `<option value="${y}" ${y === SELECTED_YEAR ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <select class="select" id="prop-sel" style="width: auto; min-width: 200px">
        <option value="all">All properties</option>
        ${ALL_PROPERTIES.map(p => `<option value="${p.id}" ${SELECTED_PROPERTY === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
    </div>

    <div class="card-elevated section">
      <div class="card-header">
        <div>
          <div class="card-title">Income Summary · ${fullMonthName(SELECTED_MONTH)} ${SELECTED_YEAR}</div>
          <div class="muted" style="font-size: 13px; margin-top: 2px">${SELECTED_PROPERTY === 'all' ? 'All properties' : escapeHtml(ALL_PROPERTIES.find(p => p.id === SELECTED_PROPERTY)?.name)}</div>
        </div>
        <div style="text-align: right">
          <div class="numeric" style="font-size: 28px; font-weight: 600; color: var(--color-primary); letter-spacing: -0.02em">${collectionRate}%</div>
          <div class="eyebrow">collected</div>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-4">
          ${renderMiniStat('Bills issued', filtered.length, 'receipt')}
          ${renderMiniStat('Total expected', formatMoney(totalDue), 'wallet')}
          ${renderMiniStat('Total collected', formatMoney(totalPaid), 'check')}
          ${renderMiniStat('Outstanding', formatMoney(totalDue - totalPaid), 'alert')}
        </div>
        <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--color-border)">
          <div class="grid-2">
            ${renderMiniStat('Rent income', formatMoney(totalRent), 'home')}
            ${renderMiniStat('Water income', formatMoney(totalWater), 'droplet')}
          </div>
        </div>
      </div>
    </div>

    ${SELECTED_PROPERTY === 'all' && Object.keys(byProperty).length > 0 ? `
      <section class="card-elevated section">
        <div class="card-header"><div class="card-title">By Property</div></div>
        <div style="overflow-x: auto">
          <table class="table">
            <thead><tr><th>Property</th><th>Bills</th><th>Rent</th><th>Water</th><th>Total Due</th><th>Collected</th><th>Outstanding</th><th>Rate</th></tr></thead>
            <tbody>
              ${Object.values(byProperty).map(p => `
                <tr>
                  <td style="font-weight: 500">${escapeHtml(p.name)}</td>
                  <td>${p.bills}</td>
                  <td class="numeric">${formatMoney(p.rent)}</td>
                  <td class="numeric">${formatMoney(p.water)}</td>
                  <td class="numeric" style="font-weight: 500">${formatMoney(p.due)}</td>
                  <td class="numeric" style="color: var(--color-success)">${formatMoney(p.paid)}</td>
                  <td class="numeric" style="color: var(--color-danger)">${formatMoney(p.due - p.paid)}</td>
                  <td><strong>${p.due ? Math.round((p.paid / p.due) * 100) : 0}%</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    ` : ''}
  `;

  document.getElementById('page-content').innerHTML = html;
  attachFilterListeners();
}

/* ---- ARREARS REPORT ---- */
async function loadArrearsReport() {
  const { data: bills } = await sb.from('bills').select(`*, tenants(full_name, phone, email), rooms(name, properties(id, name))`)
    .gt('balance', 0).order('bill_year').order('bill_month');

  let filtered = bills || [];
  if (SELECTED_PROPERTY !== 'all') {
    filtered = filtered.filter(b => b.rooms?.properties?.id === SELECTED_PROPERTY);
  }

  // Group by tenant
  const byTenant = {};
  filtered.forEach(b => {
    const tid = b.tenant_id;
    if (!byTenant[tid]) byTenant[tid] = {
      tenant: b.tenants, room: b.rooms, bills: [], total: 0,
    };
    byTenant[tid].bills.push(b);
    byTenant[tid].total += Number(b.balance);
  });

  const tenants = Object.values(byTenant).sort((a, b) => b.total - a.total);
  const totalArrears = tenants.reduce((s, t) => s + t.total, 0);

  const html = `
    ${renderHeader()}

    <div class="filter-bar">
      <select class="select" id="prop-sel" style="width: auto; min-width: 200px">
        <option value="all">All properties</option>
        ${ALL_PROPERTIES.map(p => `<option value="${p.id}" ${SELECTED_PROPERTY === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <div style="margin-left: auto; font-size: 13px; color: var(--color-text-secondary)">
        Total arrears: <strong style="color: var(--color-danger)">${formatMoney(totalArrears)}</strong> across ${tenants.length} ${tenants.length === 1 ? 'tenant' : 'tenants'}
      </div>
    </div>

    ${tenants.length === 0 ? `
      <div class="card-elevated">
        <div class="empty-state">
          <div class="empty-state-icon" style="color: var(--color-success); background: var(--color-success-bg)">${icon('checkCircle')}</div>
          <h3>No outstanding balances</h3>
          <p>All tenants are up to date on their payments.</p>
        </div>
      </div>
    ` : `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Tenant</th><th>Property · Unit</th><th>Phone</th><th>Bills Owed</th><th>Total Owed</th><th></th></tr></thead>
          <tbody>
            ${tenants.map(t => {
              const oldestBill = t.bills.reduce((oldest, b) => {
                const bd = new Date(b.bill_year, b.bill_month - 1);
                const od = new Date(oldest.bill_year, oldest.bill_month - 1);
                return bd < od ? b : oldest;
              }, t.bills[0]);
              const periods = t.bills.map(b => `${monthName(b.bill_month)} ${b.bill_year}`).join(', ');
              return `
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 12px">
                      <div class="avatar avatar-sm">${getInitials(t.tenant?.full_name || '?')}</div>
                      <div>
                        <div style="font-weight: 500">${escapeHtml(t.tenant?.full_name || '—')}</div>
                        ${t.tenant?.email ? `<div style="font-size: 12px; color: var(--color-text-muted)">${escapeHtml(t.tenant.email)}</div>` : ''}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style="font-weight: 500">${escapeHtml(t.room?.properties?.name || '')}</div>
                    <div style="font-size: 12px; color: var(--color-text-muted)">Unit ${escapeHtml(t.room?.name || '')}</div>
                  </td>
                  <td style="font-size: 13px">${escapeHtml(t.tenant?.phone || '—')}</td>
                  <td>
                    <div>${t.bills.length} ${t.bills.length === 1 ? 'bill' : 'bills'}</div>
                    <div style="font-size: 11px; color: var(--color-text-muted)">${periods}</div>
                  </td>
                  <td class="numeric" style="font-weight: 600; color: var(--color-danger); font-size: 15px">${formatMoney(t.total)}</td>
                  <td><button class="btn btn-secondary btn-sm" onclick="window.location.href='/tenant-detail?id=${t.bills[0].tenant_id}'">${icon('externalLink')}<span>View</span></button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  document.getElementById('page-content').innerHTML = html;
  attachFilterListeners();
}

/* ---- VACANCY REPORT ---- */
async function loadVacancyReport() {
  let propsQuery = sb.from('properties').select(`*, rooms(*)`).eq('archived', false);
  if (SELECTED_PROPERTY !== 'all') propsQuery = propsQuery.eq('id', SELECTED_PROPERTY);
  const { data: properties } = await propsQuery;

  const items = [];
  let totalRooms = 0, totalVacant = 0, totalLostMonthly = 0;

  (properties || []).forEach(p => {
    (p.rooms || []).forEach(r => {
      totalRooms++;
      if (r.status === 'vacant') {
        totalVacant++;
        totalLostMonthly += Number(r.monthly_rent || 0);
        items.push({ property: p, room: r });
      }
    });
  });

  const occupancyRate = totalRooms ? Math.round(((totalRooms - totalVacant) / totalRooms) * 100) : 0;

  const html = `
    ${renderHeader()}

    <div class="filter-bar">
      <select class="select" id="prop-sel" style="width: auto; min-width: 200px">
        <option value="all">All properties</option>
        ${ALL_PROPERTIES.map(p => `<option value="${p.id}" ${SELECTED_PROPERTY === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
    </div>

    <section class="grid-3 section">
      ${renderMiniStat('Occupancy Rate', `${occupancyRate}%`, 'chart')}
      ${renderMiniStat('Vacant Rooms', `${totalVacant} of ${totalRooms}`, 'door')}
      ${renderMiniStat('Lost Income / Month', formatMoney(totalLostMonthly), 'trendDown')}
    </section>

    ${items.length === 0 ? `
      <div class="card-elevated">
        <div class="empty-state">
          <div class="empty-state-icon" style="color: var(--color-success); background: var(--color-success-bg)">${icon('checkCircle')}</div>
          <h3>Fully occupied</h3>
          <p>Every room across your selected properties is currently leased.</p>
        </div>
      </div>
    ` : `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Property</th><th>Unit</th><th>Type</th><th>Monthly Rent</th><th>Vacant Since</th></tr></thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td style="font-weight: 500">${escapeHtml(i.property.name)}</td>
                <td style="font-weight: 500">${escapeHtml(i.room.name)}</td>
                <td><span class="muted">${i.room.unit_type || '—'}</span></td>
                <td class="numeric">${formatMoney(i.room.monthly_rent)}</td>
                <td><span class="muted" style="font-size: 13px">${formatDate(i.room.updated_at, 'short')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  document.getElementById('page-content').innerHTML = html;
  attachFilterListeners();
}

/* ---- HELPERS ---- */
function setReport(r) { CURRENT_REPORT = r; loadReport(); }

function attachFilterListeners() {
  document.getElementById('month-sel')?.addEventListener('change', (e) => { SELECTED_MONTH = parseInt(e.target.value); loadReport(); });
  document.getElementById('year-sel')?.addEventListener('change', (e) => { SELECTED_YEAR = parseInt(e.target.value); loadReport(); });
  document.getElementById('prop-sel')?.addEventListener('change', (e) => { SELECTED_PROPERTY = e.target.value; loadReport(); });
}

function renderMiniStat(label, value, iconName) {
  return `
    <div style="padding: 14px; background: var(--color-surface-2); border-radius: var(--radius-md)">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
        <div class="eyebrow">${label}</div>
        <div style="color: var(--color-text-muted)">${icon(iconName)}</div>
      </div>
      <div class="numeric" style="font-size: 22px; font-weight: 600; letter-spacing: -0.01em">${value}</div>
    </div>
  `;
}
