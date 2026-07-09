/* =============================================================================
   SIDEBAR COMPONENT
   Renders the navigation sidebar into <div id="sidebar"></div>
   ============================================================================= */

const NAV_ITEMS = [
  { section: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard.html', icon: 'dashboard' },
  ]},
  { section: 'Property', items: [
    { id: 'properties', label: 'Properties', href: '/properties.html', icon: 'building' },
    { id: 'tenants', label: 'Tenants', href: '/tenants.html', icon: 'users' },
  ]},
  { section: 'Finances', items: [
    { id: 'billing', label: 'Billing', href: '/billing.html', icon: 'receipt' },
    { id: 'water', label: 'Water Readings', href: '/water.html', icon: 'droplet' },
    { id: 'payments', label: 'Payments', href: '/payments.html', icon: 'card' },
  ]},
  { section: 'Insights', items: [
    { id: 'reports', label: 'Reports', href: '/reports.html', icon: 'chart' },
  ]},
];

async function renderSidebar(activeId = '') {
  const profile = await getCurrentProfile();

  const sectionsHtml = NAV_ITEMS.map(section => `
    <div>
      <div class="sidebar-section-label">${section.section}</div>
      ${section.items.map(item => `
        <a href="${item.href}" class="sidebar-link ${item.id === activeId ? 'active' : ''}">
          ${icon(item.icon)}
          <span>${item.label}</span>
        </a>
      `).join('')}
    </div>
  `).join('');

  const sidebarHtml = `
    <aside class="sidebar" id="sidebar-el">
      <div class="sidebar-brand">
        <div class="sidebar-logo">
          <img src="/images/rentflow-logo/rentflow-logo/rentflow-icon-white.svg" alt="CribFlow" style="width:100%;height:100%;object-fit:contain;" />
        </div>
        <div class="sidebar-brand-text">
          <div class="sidebar-brand-name">CribFlow</div>
          <div class="sidebar-brand-tag">Crafted for Kenya's landlords.</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        ${sectionsHtml}
      </nav>

      <div class="sidebar-footer">
        <a href="/settings.html" class="sidebar-link ${activeId === 'settings' ? 'active' : ''}" style="margin-bottom: 4px">
          ${icon('settings')}
          <span>Settings</span>
        </a>
        <button class="sidebar-link" id="sidebar-theme-toggle" style="width:100%; margin-bottom: 8px; text-align:left">
          <span id="sidebar-theme-icon" style="width:16px;height:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center">
            ${document.documentElement.getAttribute('data-theme') === 'dark'
              ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
              : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
            }
          </span>
          <span id="sidebar-theme-label">${document.documentElement.getAttribute('data-theme') === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <div style="position:relative">
          <div class="sidebar-user" id="user-trigger">
            <div class="avatar">${getInitials(profile?.full_name || profile?.email)}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${escapeHtml(profile?.full_name || 'User')}</div>
              <div class="sidebar-user-email">${escapeHtml(profile?.email || '')}</div>
            </div>
          </div>
          <div class="user-menu" id="user-menu">
            <button class="user-menu-item" onclick="window.location.href='/settings.html'">
              ${icon('user')}
              <span>Profile</span>
            </button>
            <button class="user-menu-item" onclick="window.location.href='/settings.html'">
              ${icon('settings')}
              <span>Settings</span>
            </button>
            <div class="user-menu-divider"></div>
            <button class="user-menu-item danger" id="signout-btn">
              ${icon('logout')}
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    <button class="mobile-nav-toggle" id="mobile-toggle" aria-label="Open menu">
      ${icon('menu')}
    </button>
  `;

  const BOTTOM_NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard.html', icon: 'dashboard' },
    { id: 'properties', label: 'Properties', href: '/properties.html', icon: 'building' },
    { id: 'tenants', label: 'Tenants', href: '/tenants.html', icon: 'users' },
    { id: 'billing', label: 'Billing', href: '/billing.html', icon: 'receipt' },
    { id: 'payments', label: 'Payments', href: '/payments.html', icon: 'card' },
  ];

  const bottomNavHtml = `
    <nav class="bottom-nav">
      ${BOTTOM_NAV_ITEMS.map(item => `
        <a href="${item.href}" class="bottom-nav-item ${item.id === activeId ? 'active' : ''}">
          ${icon(item.icon)}
          <span>${item.label}</span>
        </a>
      `).join('')}
    </nav>
  `;

  const target = document.getElementById('sidebar') || document.body;
  target.insertAdjacentHTML('afterbegin', sidebarHtml);
  document.body.insertAdjacentHTML('beforeend', bottomNavHtml);

  // User menu toggle
  const userTrigger = document.getElementById('user-trigger');
  const userMenu = document.getElementById('user-menu');
  userTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    userMenu.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!userMenu?.contains(e.target)) userMenu?.classList.remove('open');
  });

  document.getElementById('signout-btn')?.addEventListener('click', signOut);

  document.getElementById('sidebar-theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('rf-theme', next);
    const sunSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    const moonSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    document.getElementById('sidebar-theme-icon').innerHTML = next === 'dark' ? sunSvg : moonSvg;
    document.getElementById('sidebar-theme-label').textContent = next === 'dark' ? 'Light mode' : 'Dark mode';
  });

  // Mobile toggle
  document.getElementById('mobile-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar-el').classList.toggle('open');
  });
  document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
    document.getElementById('sidebar-el').classList.remove('open');
  });
}
