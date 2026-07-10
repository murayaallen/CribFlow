/* =============================================================================
   WATER READINGS PAGE
   ============================================================================= */

let SELECTED_MONTH = currentMonth();
let SELECTED_YEAR = currentYear();
let SELECTED_PROPERTY = null;
let ALL_PROPERTIES = [];

(async function () {
  const user = await requireAuth();
  if (!user) return;
  await renderSidebar('water');

  const { data: props } = await sb.from('properties').select('*').eq('archived', false).order('name');
  ALL_PROPERTIES = props || [];
  if (ALL_PROPERTIES.length > 0) SELECTED_PROPERTY = ALL_PROPERTIES[0].id;

  await loadWater();
})();

async function loadWater() {
  if (!SELECTED_PROPERTY) {
    renderEmptyNoProperties();
    return;
  }

  const property = ALL_PROPERTIES.find(p => p.id === SELECTED_PROPERTY);

  // Get all rooms in this property
  const { data: rooms } = await sb.from('rooms').select('id, name, status').eq('property_id', SELECTED_PROPERTY).order('name');

  // Get current period readings
  const { data: currentReadings } = await sb.from('water_readings').select('*')
    .in('room_id', (rooms || []).map(r => r.id))
    .eq('reading_month', SELECTED_MONTH).eq('reading_year', SELECTED_YEAR);

  // Get previous period readings for "previous reading" auto-fill
  const prevMonth = SELECTED_MONTH === 1 ? 12 : SELECTED_MONTH - 1;
  const prevYear = SELECTED_MONTH === 1 ? SELECTED_YEAR - 1 : SELECTED_YEAR;
  const { data: prevReadings } = await sb.from('water_readings').select('*')
    .in('room_id', (rooms || []).map(r => r.id))
    .eq('reading_month', prevMonth).eq('reading_year', prevYear);

  // Index for quick lookup
  const currentByRoom = {};
  (currentReadings || []).forEach(r => currentByRoom[r.room_id] = r);
  const prevByRoom = {};
  (prevReadings || []).forEach(r => prevByRoom[r.room_id] = r);

  renderPage(property, rooms || [], currentByRoom, prevByRoom);
}

function renderPage(property, rooms, currentByRoom, prevByRoom) {
  const enteredCount = Object.keys(currentByRoom).length;
  const totalUnits = Object.values(currentByRoom).reduce((s, r) => s + Number(r.units_used || 0), 0);
  const totalRevenue = Object.values(currentByRoom).reduce((s, r) => s + Number(r.amount_due || 0), 0);

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <div class="page-title">Water Readings</div>
        <div class="page-subtitle">Enter monthly meter readings — water charges calculate automatically.</div>
      </div>
    </header>

    <div class="filter-bar">
      <select class="select" id="prop-sel" style="width: auto; min-width: 200px">
        ${ALL_PROPERTIES.map(p => `<option value="${p.id}" ${SELECTED_PROPERTY === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
      </select>
      <select class="select" id="month-sel" style="width: auto; min-width: 140px">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<option value="${m}" ${m === SELECTED_MONTH ? 'selected' : ''}>${fullMonthName(m)}</option>`).join('')}
      </select>
      <select class="select" id="year-sel" style="width: auto; min-width: 100px">
        ${[currentYear() - 1, currentYear(), currentYear() + 1].map(y => `<option value="${y}" ${y === SELECTED_YEAR ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <div style="margin-left: auto; font-size: 13px; color: var(--color-text-secondary)">
        Water rate: <strong>${formatMoney(property.water_rate_per_unit)}/unit</strong>
      </div>
    </div>

    <section class="grid-3 section">
      ${renderStat('Readings Entered', `${enteredCount} of ${rooms.length}`, 'droplet', `${rooms.length - enteredCount} pending`)}
      ${renderStat('Total Units', formatNumber(totalUnits), 'chart', `${fullMonthName(SELECTED_MONTH)} ${SELECTED_YEAR}`)}
      ${renderStat('Water Revenue', formatMoney(totalRevenue), 'wallet', 'For this period')}
    </section>

    ${rooms.length === 0 ? `
      <div class="card-elevated">
        <div class="empty-state">
          <div class="empty-state-icon">${icon('door')}</div>
          <h3>No rooms in this property</h3>
          <p>Add rooms to ${escapeHtml(property.name)} first.</p>
          <a href="/property-detail?id=${property.id}" class="btn btn-primary">Manage Property</a>
        </div>
      </div>
    ` : `
      <form id="readings-form">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Status</th>
                <th>Previous Reading</th>
                <th>Current Reading</th>
                <th>Units Used</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rooms.map(r => renderRow(r, currentByRoom[r.id], prevByRoom[r.id], property.water_rate_per_unit)).join('')}
            </tbody>
          </table>
        </div>

        <div style="display: flex; justify-content: flex-end; margin-top: 16px; gap: 12px">
          <button type="button" class="btn btn-secondary" onclick="loadWater()">${icon('refresh')}<span>Reset</span></button>
          <button type="button" class="btn btn-primary" onclick="saveAllReadings()">${icon('check')}<span>Save All Readings</span></button>
        </div>
      </form>
    `}
  `;

  document.getElementById('page-content').innerHTML = html;

  document.getElementById('prop-sel').addEventListener('change', (e) => { SELECTED_PROPERTY = e.target.value; loadWater(); });
  document.getElementById('month-sel').addEventListener('change', (e) => { SELECTED_MONTH = parseInt(e.target.value); loadWater(); });
  document.getElementById('year-sel').addEventListener('change', (e) => { SELECTED_YEAR = parseInt(e.target.value); loadWater(); });

  // Wire live calc
  document.querySelectorAll('input[data-row]').forEach(input => {
    input.addEventListener('input', () => updateRowCalc(input.dataset.row, property.water_rate_per_unit));
  });
}

function renderRow(room, currentReading, prevReading, rate) {
  const prev = currentReading?.previous_reading ?? prevReading?.current_reading ?? 0;
  const curr = currentReading?.current_reading ?? '';
  const units = currentReading?.units_used ?? '';
  const amount = currentReading?.amount_due ?? 0;
  const isVacant = room.status === 'vacant';

  return `
    <tr data-row="${room.id}" ${isVacant ? 'style="opacity:.55"' : ''}>
      <td style="font-weight: 600">${escapeHtml(room.name)}</td>
      <td>${roomStatusBadge(room.status)}</td>
      <td>
        <input class="input" type="number" step="0.01" min="0" value="${prev}"
          data-row="${room.id}" data-field="prev" style="max-width: 120px; padding: 6px 10px; font-size: 13px" ${isVacant ? 'disabled' : ''} />
      </td>
      <td>
        <input class="input" type="number" step="0.01" min="0" value="${curr}"
          data-row="${room.id}" data-field="curr" style="max-width: 120px; padding: 6px 10px; font-size: 13px" placeholder="Enter…" ${isVacant ? 'disabled' : ''} />
      </td>
      <td class="numeric" id="units-${room.id}" style="font-weight: 500">${units !== '' ? formatNumber(units) : '—'}</td>
      <td class="numeric" id="amount-${room.id}" style="font-weight: 600; color: var(--color-primary)">${amount > 0 ? formatMoney(amount) : '—'}</td>
    </tr>
  `;
}

function updateRowCalc(roomId, rate) {
  const prev = parseFloat(document.querySelector(`input[data-row="${roomId}"][data-field="prev"]`).value) || 0;
  const curr = parseFloat(document.querySelector(`input[data-row="${roomId}"][data-field="curr"]`).value) || 0;
  const units = curr - prev;
  const amount = units * rate;

  const unitsEl = document.getElementById(`units-${roomId}`);
  const amountEl = document.getElementById(`amount-${roomId}`);

  if (curr === 0 && prev === 0) {
    unitsEl.textContent = '—';
    amountEl.textContent = '—';
    return;
  }

  if (units < 0) {
    unitsEl.innerHTML = '<span style="color: var(--color-danger)">Invalid</span>';
    amountEl.textContent = '—';
    return;
  }

  unitsEl.textContent = formatNumber(units);
  amountEl.textContent = formatMoney(amount);
}

async function saveAllReadings() {
  const property = ALL_PROPERTIES.find(p => p.id === SELECTED_PROPERTY);
  const rate = property.water_rate_per_unit;

  const rows = [];
  document.querySelectorAll('tr[data-row]').forEach(tr => {
    const roomId = tr.dataset.row;
    const prev = parseFloat(tr.querySelector('input[data-field="prev"]').value) || 0;
    const curr = parseFloat(tr.querySelector('input[data-field="curr"]').value) || 0;
    if (curr > 0 && curr >= prev) {
      rows.push({
        room_id: roomId,
        reading_month: SELECTED_MONTH,
        reading_year: SELECTED_YEAR,
        previous_reading: prev,
        current_reading: curr,
        rate_at_reading: rate,
      });
    }
  });

  if (rows.length === 0) {
    showToast('No valid readings to save', 'warning');
    return;
  }

  // Upsert (will replace existing)
  const { error } = await sb.from('water_readings').upsert(rows, {
    onConflict: 'room_id,reading_month,reading_year',
  });

  if (error) { showToast(error.message, 'error'); return; }
  showToast(`${rows.length} ${rows.length === 1 ? 'reading' : 'readings'} saved`, 'success');
  loadWater();
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

function renderEmptyNoProperties() {
  document.getElementById('page-content').innerHTML = `
    <header class="page-header">
      <div class="page-title-block">
        <div class="page-title">Water Readings</div>
      </div>
    </header>
    <div class="card-elevated">
      <div class="empty-state">
        <div class="empty-state-icon">${icon('building')}</div>
        <h3>Add a property first</h3>
        <p>You need at least one property with rooms before you can enter water meter readings.</p>
        <a href="/properties" class="btn btn-primary">${icon('plus')}<span>Add Property</span></a>
      </div>
    </div>
  `;
}
