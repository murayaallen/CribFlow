/* =============================================================================
   DASHBOARD PAGE
   ============================================================================= */

(async function () {
  const user = await requireAuth();
  if (!user) return;

  try {
    const profile = await getCurrentProfile();
    await renderSidebar('dashboard');
    await renderDashboard(profile);
  } finally {
    // Dismiss the premium loader once the dashboard has painted its data.
    if (window.CFLoader) window.CFLoader.done();
  }
})();

async function renderDashboard(profile) {
  const greeting = getGreeting();
  const month = currentMonth();
  const year = currentYear();

  // Fetch all data in parallel
  const [
    propertiesRes,
    roomsRes,
    tenantsRes,
    billsRes,
    paymentsRes,
    mpesaRes,
    expiringLeasesRes,
    trendBillsRes,
    topOwingRes,
  ] = await Promise.all([
    sb.from('properties').select('id, name, archived').eq('archived', false),
    sb.from('rooms').select('id, status, monthly_rent, property_id'),
    sb.from('tenants').select('id, full_name, lease_end, status, room_id').eq('status', 'active'),
    sb.from('bills').select('id, total_due, total_paid, balance, status').eq('bill_month', month).eq('bill_year', year),
    sb.from('payments').select(`id, amount, payment_date, method, mpesa_code, tenant_id, room_id,
      tenants(full_name), rooms(name)`).order('payment_date', { ascending: false }).limit(8),
    sb.from('mpesa_transactions').select('id, amount, account_number, phone_number, transaction_time').eq('matched', false).limit(5),
    sb.from('tenants').select('id, full_name, lease_end, room_id, rooms(name, properties(name))').eq('status', 'active').not('lease_end', 'is', null),
    sb.from('bills').select('bill_month, bill_year, total_paid, total_due').gte('bill_year', year - 1),
    sb.from('bills').select('tenant_id, balance, tenants(id, full_name), rooms(name, properties(name))').gt('balance', 0).not('status', 'in', '("paid","void")'),
  ]);

  const properties = propertiesRes.data || [];
  const rooms = roomsRes.data || [];
  const tenants = tenantsRes.data || [];
  const bills = billsRes.data || [];
  const payments = paymentsRes.data || [];
  const unmatched = mpesaRes.data || [];
  const trendBills = trendBillsRes.data || [];

  // Aggregate top owing tenants across all open bills
  const owingMap = {};
  for (const b of (topOwingRes.data || [])) {
    const tid = b.tenant_id;
    if (!owingMap[tid]) owingMap[tid] = { tenant: b.tenants, room: b.rooms, total: 0 };
    owingMap[tid].total += Number(b.balance || 0);
  }
  const topOwing = Object.values(owingMap).sort((a, b) => b.total - a.total).slice(0, 6);

  // Filter expiring leases (within 30 days)
  const today = new Date();
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const expiringLeases = (expiringLeasesRes.data || []).filter(t => {
    if (!t.lease_end) return false;
    const end = new Date(t.lease_end);
    return end >= today && end <= in30Days;
  });

  // Compute stats
  const totalRooms = rooms.length;
  const vacantRooms = rooms.filter(r => r.status === 'vacant').length;
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length;
  const maintenanceRooms = rooms.filter(r => r.status === 'maintenance').length;
  const occupancyRate = totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

  const totalExpected = bills.reduce((s, b) => s + Number(b.total_due || 0), 0);
  const totalCollected = bills.reduce((s, b) => s + Number(b.total_paid || 0), 0);
  const totalOutstanding = totalExpected - totalCollected;
  const collectionRate = totalExpected ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const paidCount = bills.filter(b => b.status === 'paid').length;
  const partialCount = bills.filter(b => b.status === 'partial').length;
  const unpaidCount = bills.filter(b => b.status === 'unpaid').length;

  // Trend data — last 6 months
  const trendMonths = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (5 - i), 1);
    return { label: monthName(d.getMonth() + 1), month: d.getMonth() + 1, year: d.getFullYear() };
  });
  const trendCollected = trendMonths.map(({ month: m, year: y }) =>
    trendBills.filter(b => b.bill_month === m && b.bill_year === y)
      .reduce((s, b) => s + Number(b.total_paid || 0), 0)
  );
  const trendExpected = trendMonths.map(({ month: m, year: y }) =>
    trendBills.filter(b => b.bill_month === m && b.bill_year === y)
      .reduce((s, b) => s + Number(b.total_due || 0), 0)
  );

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <div class="eyebrow">${formatDate(new Date(), 'long')}</div>
        <div class="page-title" style="margin-top: 6px">
          ${greeting}, <span class="display" style="font-size: 30px">${escapeHtml((profile?.full_name || 'there').split(' ')[0])}</span>
        </div>
        <div class="page-subtitle">Here's how your properties are performing in ${fullMonthName(month)}.</div>
      </div>
      <div class="page-actions">
        <a href="/properties" class="btn btn-secondary">${icon('building')}<span>View Properties</span></a>
        <a href="/billing" class="btn btn-primary">${icon('receipt')}<span>Open Billing</span></a>
      </div>
    </header>

    ${unmatched.length > 0 ? renderUnmatchedAlert(unmatched.length) : ''}

    <!-- STAT CARDS -->
    <section class="grid-4 section">
      ${renderStatCard({ label: 'Total Properties', value: properties.length, icon: 'building', meta: `${totalRooms} ${totalRooms === 1 ? 'room' : 'rooms'} total` })}
      ${renderStatCard({ label: 'Occupancy', value: `${occupancyRate}%`, icon: 'users', meta: `${occupiedRooms} occupied · ${vacantRooms} vacant` })}
      ${renderStatCard({ label: `Collected · ${monthName(month)}`, value: formatMoney(totalCollected), icon: 'wallet', meta: totalExpected ? `${collectionRate}% of ${formatMoney(totalExpected)}` : 'No bills generated yet' })}
      ${renderStatCard({ label: 'Outstanding', value: formatMoney(totalOutstanding), icon: 'alert', meta: `Across ${bills.filter(b => b.balance > 0).length} ${bills.filter(b => b.balance > 0).length === 1 ? 'bill' : 'bills'}`, accent: totalOutstanding > 0 ? 'warning' : '' })}
    </section>

    <!-- CHARTS -->
    <section class="section dash-charts-grid">
      <!-- Revenue Trend -->
      <div class="card-elevated dash-chart-main">
        <div class="card-header">
          <div>
            <div class="card-title">Revenue Collected</div>
            <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px">6-month trend</div>
          </div>
          <div style="text-align:right">
            <div class="numeric" style="font-size:20px;font-weight:700;color:var(--color-primary)">${formatMoney(trendCollected.reduce((a,b)=>a+b,0))}</div>
            <div style="font-size:11px;color:var(--color-text-muted)">total this period</div>
          </div>
        </div>
        <div class="card-body" style="height:200px;padding-top:8px;padding-bottom:16px">
          <canvas id="chart-revenue"></canvas>
        </div>
      </div>

      <!-- Right column: two mini donut charts -->
      <div class="dash-chart-side">
        <!-- Occupancy donut -->
        <div class="card-elevated">
          <div class="card-body" style="display:flex;align-items:center;gap:18px;padding:18px 20px">
            <div style="position:relative;width:90px;height:90px;flex-shrink:0">
              <canvas id="chart-occupancy"></canvas>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
                <div class="numeric" style="font-size:17px;font-weight:700;color:var(--color-text);line-height:1">${occupancyRate}%</div>
                <div style="font-size:9px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">occ.</div>
              </div>
            </div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:10px">Occupancy</div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
                  <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:#15803D;flex-shrink:0"></span><span style="color:var(--color-text-muted)">Occupied</span></div>
                  <strong class="numeric">${occupiedRooms}</strong>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
                  <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:var(--color-border-strong);flex-shrink:0"></span><span style="color:var(--color-text-muted)">Vacant</span></div>
                  <strong class="numeric">${vacantRooms}</strong>
                </div>
                ${maintenanceRooms > 0 ? `<div style="display:flex;align-items:center;justify-content:space-between;font-size:12px"><div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:#B45309;flex-shrink:0"></span><span style="color:var(--color-text-muted)">Maint.</span></div><strong class="numeric">${maintenanceRooms}</strong></div>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Bill status donut -->
        <div class="card-elevated">
          <div class="card-body" style="display:flex;align-items:center;gap:18px;padding:18px 20px">
            <div style="position:relative;width:90px;height:90px;flex-shrink:0">
              <canvas id="chart-bills"></canvas>
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
                <div class="numeric" style="font-size:17px;font-weight:700;color:var(--color-text);line-height:1">${collectionRate}%</div>
                <div style="font-size:9px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-top:2px">paid</div>
              </div>
            </div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:10px">Bills · ${monthName(month)}</div>
              <div style="display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
                  <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:#15803D;flex-shrink:0"></span><span style="color:var(--color-text-muted)">Paid</span></div>
                  <strong class="numeric">${paidCount}</strong>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
                  <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:#B45309;flex-shrink:0"></span><span style="color:var(--color-text-muted)">Partial</span></div>
                  <strong class="numeric">${partialCount}</strong>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
                  <div style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:#B91C1C;flex-shrink:0"></span><span style="color:var(--color-text-muted)">Unpaid</span></div>
                  <strong class="numeric">${unpaidCount}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- COLLECTION PROGRESS -->
    ${totalExpected > 0 ? renderCollectionProgress(totalCollected, totalExpected, bills) : ''}

    <!-- RECENT PAYMENTS + TOP OWING + EXPIRING LEASES -->
    <section class="grid-3">
      <div class="card-elevated">
        <div class="card-header">
          <div class="card-title">Recent Payments</div>
          <a href="/payments" class="btn btn-ghost btn-sm">View all ${icon('arrowRight')}</a>
        </div>
        <div class="card-body" style="padding: 0">
          ${payments.length === 0 ? renderEmptyMini('inbox', 'No payments yet', 'Payments will appear here as soon as you record one.') : renderPaymentsList(payments)}
        </div>
      </div>

      <div class="card-elevated">
        <div class="card-header">
          <div class="card-title">Top Owing</div>
          <a href="/reports?tab=arrears" class="btn btn-ghost btn-sm">Full report ${icon('arrowRight')}</a>
        </div>
        <div class="card-body" style="padding: 0">
          ${topOwing.length === 0 ? renderEmptyMini('checkCircle', 'No outstanding balances', 'All tenants are up to date.') : renderTopOwing(topOwing)}
        </div>
      </div>

      <div class="card-elevated">
        <div class="card-header">
          <div class="card-title">Expiring Leases</div>
          <span class="badge ${expiringLeases.length > 0 ? 'badge-warning' : ''}">${expiringLeases.length} this month</span>
        </div>
        <div class="card-body" style="padding: 0">
          ${expiringLeases.length === 0 ? renderEmptyMini('calendar', 'No upcoming expirations', 'All current leases run beyond this month.') : renderExpiringLeases(expiringLeases)}
        </div>
      </div>
    </section>

    <!-- PROPERTIES OVERVIEW -->
    ${properties.length > 0 ? renderPropertiesOverview(properties, rooms) : renderFirstRunCTA()}
  `;

  document.getElementById('page-content').innerHTML = html;

  initCharts(trendMonths, trendCollected, trendExpected, rooms, bills, occupancyRate, collectionRate);
}

/* ---- CHARTS ---- */
function initCharts(trendMonths, trendCollected, trendExpected, rooms, bills, occupancyRate, collectionRate) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textMuted  = isDark ? '#656360' : '#8A877A';
  const gridColor  = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const tooltipBg  = isDark ? '#1E1F1C' : '#FFFFFF';
  const tooltipTxt = isDark ? '#EFEDE5' : '#1A1A17';

  Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";

  // ── Revenue bar chart ──
  const revCtx = document.getElementById('chart-revenue');
  if (revCtx) {
    const maxVal = Math.max(...trendCollected, 1);
    new Chart(revCtx, {
      type: 'bar',
      data: {
        labels: trendMonths.map(m => m.label),
        datasets: [
          {
            label: 'Expected',
            data: trendExpected,
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,76,58,0.07)',
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.75,
            categoryPercentage: 0.85,
          },
          {
            label: 'Collected',
            data: trendCollected,
            backgroundColor: trendCollected.map((v, i) =>
              i === trendCollected.length - 1
                ? 'rgba(15,76,58,0.9)'
                : 'rgba(15,76,58,0.55)'
            ),
            borderRadius: 6,
            borderSkipped: false,
            barPercentage: 0.75,
            categoryPercentage: 0.85,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTxt,
            bodyColor: textMuted,
            borderColor: isDark ? '#2A2B27' : '#E5E2D6',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: KSh ${Number(ctx.parsed.y).toLocaleString('en-KE')}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: textMuted, font: { size: 12 } },
          },
          y: {
            grid: { color: gridColor },
            border: { display: false },
            ticks: {
              color: textMuted,
              font: { size: 11 },
              callback: v => v === 0 ? '0' : v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v,
              maxTicksLimit: 5,
            },
          },
        },
      },
    });
  }

  // ── Occupancy donut ──
  const occCtx = document.getElementById('chart-occupancy');
  if (occCtx) {
    const occupied    = rooms.filter(r => r.status === 'occupied').length;
    const vacant      = rooms.filter(r => r.status === 'vacant').length;
    const maintenance = rooms.filter(r => r.status === 'maintenance').length;
    const total = occupied + vacant + maintenance || 1;
    new Chart(occCtx, {
      type: 'doughnut',
      data: {
        labels: ['Occupied', 'Vacant', 'Maintenance'],
        datasets: [{
          data: [occupied, vacant, maintenance || 0.001],
          backgroundColor: ['#15803D', isDark ? '#363730' : '#D1D0C8', '#B45309'],
          borderWidth: 0,
          hoverOffset: 3,
        }],
      },
      options: {
        cutout: '74%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTxt,
            bodyColor: textMuted,
            borderColor: isDark ? '#2A2B27' : '#E5E2D6',
            borderWidth: 1,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} of ${total}`,
            },
          },
        },
      },
    });
  }

  // ── Bills status donut ──
  const billsCtx = document.getElementById('chart-bills');
  if (billsCtx) {
    const paid    = bills.filter(b => b.status === 'paid').length;
    const partial = bills.filter(b => b.status === 'partial').length;
    const unpaid  = bills.filter(b => b.status === 'unpaid').length;
    const total   = paid + partial + unpaid || 1;
    new Chart(billsCtx, {
      type: 'doughnut',
      data: {
        labels: ['Paid', 'Partial', 'Unpaid'],
        datasets: [{
          data: [paid, partial, unpaid || 0.001],
          backgroundColor: ['#15803D', '#B45309', '#B91C1C'],
          borderWidth: 0,
          hoverOffset: 3,
        }],
      },
      options: {
        cutout: '74%',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipTxt,
            bodyColor: textMuted,
            borderColor: isDark ? '#2A2B27' : '#E5E2D6',
            borderWidth: 1,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} of ${total}`,
            },
          },
        },
      },
    });
  }
}

/* ---- STAT CARD ---- */
function renderStatCard({ label, value, icon: iconName, meta, accent = '' }) {
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

/* ---- COLLECTION PROGRESS ---- */
function renderCollectionProgress(collected, expected, bills) {
  const pct = expected ? Math.min(100, Math.round((collected / expected) * 100)) : 0;
  const paidCount = bills.filter(b => b.status === 'paid').length;
  const partialCount = bills.filter(b => b.status === 'partial').length;
  const unpaidCount = bills.filter(b => b.status === 'unpaid').length;

  return `
    <section class="card-elevated section">
      <div class="card-body">
        <div class="flex justify-between items-center" style="margin-bottom: 16px">
          <div>
            <div class="eyebrow">Collection Progress · ${fullMonthName(currentMonth())}</div>
            <div style="margin-top: 6px; display: flex; align-items: baseline; gap: 8px">
              <span class="numeric" style="font-size: 24px; font-weight: 600">${formatMoney(collected)}</span>
              <span class="muted" style="font-size: 14px">of ${formatMoney(expected)} expected</span>
            </div>
          </div>
          <div style="text-align: right">
            <div class="numeric" style="font-size: 28px; font-weight: 600; color: var(--color-primary); letter-spacing: -0.02em">${pct}%</div>
            <div class="eyebrow" style="margin-top: 2px">complete</div>
          </div>
        </div>
        <div style="height: 8px; background: var(--color-surface-2); border-radius: 100px; overflow: hidden">
          <div style="height: 100%; width: ${pct}%; background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-light) 100%); border-radius: 100px; transition: width 600ms ease"></div>
        </div>
        <div class="flex" style="margin-top: 16px; gap: 24px; font-size: 13px">
          <div class="flex items-center gap-2"><span class="legend-dot" style="background: var(--color-success)"></span><span class="muted">Paid:</span><strong class="numeric">${paidCount}</strong></div>
          <div class="flex items-center gap-2"><span class="legend-dot" style="background: var(--color-warning)"></span><span class="muted">Partial:</span><strong class="numeric">${partialCount}</strong></div>
          <div class="flex items-center gap-2"><span class="legend-dot" style="background: var(--color-danger)"></span><span class="muted">Unpaid:</span><strong class="numeric">${unpaidCount}</strong></div>
        </div>
      </div>
    </section>
  `;
}

/* ---- PAYMENTS LIST ---- */
function renderPaymentsList(payments) {
  return `
    <div class="detail-list" style="padding: 8px 0">
      ${payments.map(p => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 10px 24px;">
          <div class="avatar avatar-sm">${getInitials(p.tenants?.full_name || '?')}</div>
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 14px; font-weight: 500; color: var(--color-text)">${escapeHtml(p.tenants?.full_name || 'Unknown')}</div>
            <div style="font-size: 12px; color: var(--color-text-muted)">
              Unit ${escapeHtml(p.rooms?.name || '?')} · ${p.method.toUpperCase()}${p.mpesa_code ? ' · ' + escapeHtml(p.mpesa_code) : ''} · ${relativeTime(p.payment_date)}
            </div>
          </div>
          <div class="numeric" style="font-size: 14px; font-weight: 600; color: var(--color-success)">+${formatMoney(p.amount)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ---- TOP OWING TENANTS ---- */
function renderTopOwing(list) {
  return `
    <div style="padding: 8px 0">
      ${list.map(item => `
        <a href="/tenant-detail?id=${item.tenant?.id}" style="display: flex; align-items: center; gap: 12px; padding: 10px 24px; text-decoration: none; transition: background 0.15s" onmouseover="this.style.background='var(--color-surface-2)'" onmouseout="this.style.background=''">
          <div class="avatar avatar-sm">${getInitials(item.tenant?.full_name || '?')}</div>
          <div style="flex: 1; min-width: 0">
            <div style="font-size: 14px; font-weight: 500; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap">${escapeHtml(item.tenant?.full_name || 'Unknown')}</div>
            <div style="font-size: 12px; color: var(--color-text-muted)">Unit ${escapeHtml(item.room?.name || '?')} · ${escapeHtml(item.room?.properties?.name || '')}</div>
          </div>
          <div class="numeric" style="font-size: 13px; font-weight: 600; color: var(--color-danger); flex-shrink: 0">${formatMoney(item.total)}</div>
        </a>
      `).join('')}
    </div>
  `;
}

/* ---- EXPIRING LEASES ---- */
function renderExpiringLeases(leases) {
  return `
    <div style="padding: 8px 0">
      ${leases.map(l => {
        const days = Math.ceil((new Date(l.lease_end) - new Date()) / (1000*60*60*24));
        return `
          <div style="display: flex; align-items: center; gap: 12px; padding: 10px 24px;">
            <div class="stat-card-icon" style="width: 32px; height: 32px; background: var(--color-warning-bg); color: var(--color-warning)">${icon('calendar')}</div>
            <div style="flex: 1; min-width: 0">
              <div style="font-size: 14px; font-weight: 500">${escapeHtml(l.full_name)}</div>
              <div style="font-size: 12px; color: var(--color-text-muted)">
                Unit ${escapeHtml(l.rooms?.name || '?')} · ${escapeHtml(l.rooms?.properties?.name || '')}
              </div>
            </div>
            <div style="text-align: right">
              <div style="font-size: 13px; font-weight: 600; color: var(--color-warning)">${days} ${days === 1 ? 'day' : 'days'}</div>
              <div style="font-size: 11px; color: var(--color-text-muted)">${formatDate(l.lease_end, 'short')}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/* ---- UNMATCHED ALERT ---- */
function renderUnmatchedAlert(count) {
  return `
    <div class="card-elevated section" style="border-left: 3px solid var(--color-warning)">
      <div class="card-body" style="display: flex; align-items: center; gap: 16px">
        <div class="stat-card-icon" style="background: var(--color-warning-bg); color: var(--color-warning); width: 40px; height: 40px">${icon('alert')}</div>
        <div style="flex: 1">
          <div style="font-size: 14px; font-weight: 600">${count} M-Pesa ${count === 1 ? 'payment needs' : 'payments need'} matching</div>
          <div style="font-size: 13px; color: var(--color-text-secondary); margin-top: 2px">Some payments couldn't be auto-matched to a tenant. Review and assign them manually.</div>
        </div>
        <a href="/payments?tab=unmatched" class="btn btn-secondary btn-sm">Review</a>
      </div>
    </div>
  `;
}

/* ---- PROPERTIES OVERVIEW ---- */
const PROP_IMAGES = [
  '/images/apartment.jpg',
  '/images/apartment 2.jpg',
  '/images/apartment 3.jpg',
];

function renderPropertiesOverview(properties, rooms) {
  return `
    <section class="section">
      <div class="flex justify-between items-center" style="margin-bottom: 16px">
        <h3 style="font-size: 16px">Your Properties</h3>
        <a href="/properties" class="btn btn-ghost btn-sm">View all ${icon('arrowRight')}</a>
      </div>
      <div class="property-grid">
        ${properties.slice(0, 3).map((p, idx) => {
          const propRooms = rooms.filter(r => r.property_id === p.id);
          const occupied = propRooms.filter(r => r.status === 'occupied').length;
          const vacant = propRooms.filter(r => r.status === 'vacant').length;
          const occupancyPct = propRooms.length ? Math.round((occupied / propRooms.length) * 100) : 0;
          const imgSrc = PROP_IMAGES[idx % PROP_IMAGES.length];
          return `
            <a href="/property-detail?id=${p.id}" class="property-card" style="text-decoration: none; overflow: hidden; position: relative;">
              <div style="
                position: absolute; inset: 0;
                background: url('${imgSrc}') center/cover no-repeat;
                filter: brightness(0.22) saturate(0.7);
                z-index: 0; border-radius: inherit;
                transition: transform 0.4s ease;
              " class="prop-card-img"></div>
              <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(7,31,23,0.95) 0%, rgba(10,43,30,0.6) 60%, transparent 100%); z-index: 1; border-radius: inherit;"></div>
              <div style="position: relative; z-index: 2;">
                <div class="property-card-header" style="border-bottom: 1px solid rgba(255,255,255,0.08)">
                  <div class="property-card-name" style="color: #fff">${escapeHtml(p.name)}</div>
                  <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 4px; font-weight: 600">${occupancyPct}% occupied</div>
                </div>
                <div class="property-card-body">
                  <div class="property-card-stat">
                    <div class="property-card-stat-value" style="color: #fff">${propRooms.length}</div>
                    <div class="property-card-stat-label" style="color: rgba(255,255,255,0.45)">Rooms</div>
                  </div>
                  <div class="property-card-stat">
                    <div class="property-card-stat-value" style="color: #6BDDAD">${occupied}</div>
                    <div class="property-card-stat-label" style="color: rgba(255,255,255,0.45)">Occupied</div>
                  </div>
                  <div class="property-card-stat">
                    <div class="property-card-stat-value" style="color: rgba(255,255,255,0.5)">${vacant}</div>
                    <div class="property-card-stat-label" style="color: rgba(255,255,255,0.45)">Vacant</div>
                  </div>
                </div>
              </div>
            </a>
          `;
        }).join('')}
      </div>
    </section>

    <style>
      .property-card:hover .prop-card-img { transform: scale(1.05); }
    </style>
  `;
}

/* ---- EMPTY MINI ---- */
function renderEmptyMini(iconName, title, description) {
  return `
    <div class="empty-state" style="padding: 40px 24px">
      <div class="empty-state-icon" style="width: 44px; height: 44px">${icon(iconName)}</div>
      <h3 style="font-size: 14px">${title}</h3>
      <p style="font-size: 13px; margin-bottom: 0">${description}</p>
    </div>
  `;
}

/* ---- FIRST RUN CTA ---- */
function renderFirstRunCTA() {
  return `
    <section class="card-elevated section">
      <div class="card-body" style="text-align: center; padding: 64px 24px">
        <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: var(--color-primary-50); border-radius: 16px; display: flex; align-items: center; justify-content: center; color: var(--color-primary)">${icon('building').replace('<svg', '<svg width="32" height="32"')}</div>
        <h2 style="font-size: 20px; margin-bottom: 8px">Add your first property</h2>
        <p style="font-size: 14px; color: var(--color-text-secondary); max-width: 420px; margin: 0 auto 24px; line-height: 1.6">
          Get started by registering a property. You'll set up rooms, water rates, and naming conventions in just a few clicks.
        </p>
        <a href="/properties?action=add" class="btn btn-primary btn-lg">${icon('plus')}<span>Add Property</span></a>
      </div>
    </section>
  `;
}

/* ---- HELPERS ---- */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
