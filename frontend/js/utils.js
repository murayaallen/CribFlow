/* =============================================================================
   UTILITIES — formatting, dates, helpers
   ============================================================================= */

// Theme variables for direct DOM injection (bypasses any CSS cache issues)
const DARK_VARS = {
  '--color-bg': '#0E0F0D', '--color-bg-elevated': '#161714',
  '--color-surface': '#161714', '--color-surface-2': '#1E1F1C', '--color-surface-3': '#272824',
  '--color-border': '#2A2B27', '--color-border-strong': '#363730', '--color-border-focus': '#1A6B53',
  '--color-text': '#EFEDE5', '--color-text-secondary': '#A8A59A', '--color-text-muted': '#656360',
  '--color-primary-50': 'rgba(15,76,58,0.25)', '--color-primary-100': 'rgba(15,76,58,0.35)',
  '--color-success-bg': 'rgba(21,128,61,0.15)', '--color-warning-bg': 'rgba(180,83,9,0.15)',
  '--color-danger-bg': 'rgba(185,28,28,0.15)', '--color-info-bg': 'rgba(30,64,175,0.15)',
  '--color-accent-50': 'rgba(200,146,74,0.12)',
};

function applyTheme(theme) {
  const el = document.documentElement;
  el.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    Object.entries(DARK_VARS).forEach(([k, v]) => el.style.setProperty(k, v));
  } else {
    Object.keys(DARK_VARS).forEach(k => el.style.removeProperty(k));
  }
}

// Apply saved theme immediately on every page
(function() {
  applyTheme(localStorage.getItem('rf-theme') || 'light');
})();

/* ---- CURRENCY ---- */
function formatMoney(amount, opts = {}) {
  if (amount === null || amount === undefined || isNaN(amount)) return `${CONFIG.CURRENCY} 0`;
  const { withSymbol = true, decimals = 0 } = opts;
  const formatted = new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(amount));
  return withSymbol ? `${CONFIG.CURRENCY} ${formatted}` : formatted;
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  return new Intl.NumberFormat('en-KE').format(Number(n));
}

/* ---- DATE ---- */
function formatDate(d, format = 'medium') {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const opts = {
    short: { day: 'numeric', month: 'short', year: '2-digit' },
    medium: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
    monthYear: { month: 'long', year: 'numeric' },
  }[format] || { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('en-KE', opts).format(date);
}

function formatDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date);
}

function relativeTime(d) {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDate(d, 'short');
}

function monthName(month) {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[month - 1] || '';
}

function fullMonthName(month) {
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return names[month - 1] || '';
}

function currentMonth() { return new Date().getMonth() + 1; }
function currentYear() { return new Date().getFullYear(); }

/* ---- ROOM NAME GENERATION ---- */
function generateRoomNames(convention, count, prefix = '') {
  const names = [];
  if (convention === 'numbers') {
    for (let i = 1; i <= count; i++) names.push(`${prefix}${i}`);
  } else if (convention === 'letters') {
    for (let i = 0; i < count; i++) {
      let label = '';
      let n = i;
      do {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
      } while (n >= 0);
      names.push(`${prefix}${label}`);
    }
  } else if (convention === 'alphanumeric') {
    // A1, A2, A3... B1, B2... rolls over every 10
    for (let i = 0; i < count; i++) {
      const letter = String.fromCharCode(65 + Math.floor(i / 10));
      const number = (i % 10) + 1;
      names.push(`${prefix}${letter}${number}`);
    }
  } else {
    for (let i = 1; i <= count; i++) names.push(`${prefix}Unit ${i}`);
  }
  return names;
}

/* ---- INITIALS for avatar ---- */
function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0])
    .join('')
    .toUpperCase();
}

/* ---- DEBOUNCE ---- */
function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/* ---- TOAST NOTIFICATIONS ---- */
function ensureToastContainer() {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

function showToast(message, type = 'info', opts = {}) {
  const { title = '', duration = 4000 } = opts;
  const container = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const iconName = { success: 'checkCircle', error: 'alert', warning: 'warning', info: 'info' }[type] || 'info';
  el.innerHTML = `
    <div class="toast-icon">${icon(iconName, 'icon')}</div>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" aria-label="Close">${icon('x')}</button>
    ${duration > 0 ? `<div class="toast-progress" style="animation-duration:${duration}ms"></div>` : ''}
  `;
  el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
  container.appendChild(el);
  if (duration > 0) setTimeout(() => removeToast(el), duration);
  return el;
}

function removeToast(el) {
  if (!el || el.dataset.leaving) return;
  el.dataset.leaving = '1';
  el.classList.add('is-leaving');
  setTimeout(() => el.remove(), 240);
}

/* ---- MODAL HELPERS ---- */
function openModal(content, opts = {}) {
  const { title = '', size = '', footer = '' } = opts;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${size ? 'modal-' + size : ''}" role="dialog" aria-modal="true">
      ${title ? `
        <div class="modal-header">
          <div class="modal-title">${title}</div>
          <button class="modal-close" aria-label="Close">${icon('x')}</button>
        </div>` : ''}
      <div class="modal-body">${content}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const close = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.classList.add('is-closing');
    setTimeout(() => backdrop.remove(), 180);
    document.body.style.overflow = '';
  };

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector('.modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  return { backdrop, close };
}

function confirmDialog(opts = {}) {
  const {
    title = 'Are you sure?',
    message = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
  } = opts;

  const iconName = opts.icon || (danger ? 'alert' : 'info');
  return new Promise((resolve) => {
    const content = `
      <div class="confirm-dialog">
        <div class="confirm-icon ${danger ? 'is-danger' : ''}">${icon(iconName)}</div>
        <div class="confirm-title">${escapeHtml(title)}</div>
        ${message ? `<p class="confirm-message">${escapeHtml(message)}</p>` : ''}
      </div>`;
    const footer = `
      <button class="btn btn-secondary" id="cancel-btn" style="flex:1">${escapeHtml(cancelText)}</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-btn" style="flex:1">${escapeHtml(confirmText)}</button>
    `;
    const { backdrop, close } = openModal(content, { footer });

    backdrop.querySelector('#cancel-btn').addEventListener('click', () => { close(); resolve(false); });
    backdrop.querySelector('#confirm-btn').addEventListener('click', () => { close(); resolve(true); });
  });
}

/* ---- ESCAPE HTML ---- */
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ---- BILL STATUS BADGE ---- */
function billStatusBadge(status) {
  const map = {
    paid: { class: 'badge-success', label: 'Paid' },
    partial: { class: 'badge-warning', label: 'Partial' },
    unpaid: { class: 'badge-danger', label: 'Unpaid' },
    void: { class: '', label: 'Void' },
  };
  const cfg = map[status] || { class: '', label: status };
  return `<span class="badge ${cfg.class} badge-dot">${cfg.label}</span>`;
}

function roomStatusBadge(status) {
  const map = {
    occupied: { class: 'badge-success', label: 'Occupied' },
    vacant: { class: '', label: 'Vacant' },
    maintenance: { class: 'badge-warning', label: 'Maintenance' },
  };
  const cfg = map[status] || { class: '', label: status };
  return `<span class="badge ${cfg.class}">${cfg.label}</span>`;
}
