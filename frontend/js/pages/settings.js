/* =============================================================================
   SETTINGS PAGE
   Profile, M-Pesa paybill, email reminders, late fees
   ============================================================================= */

let CURRENT_PROFILE = null;
let CURRENT_SUBSCRIPTION = null;
let ACTIVE_TAB = 'subscription';

(async function () {
  const user = await requireAuth();
  if (!user) return;
  CURRENT_PROFILE = await getCurrentProfile();
  const { data: sub } = await sb.from('subscriptions').select('*').eq('user_id', user.id).single();
  CURRENT_SUBSCRIPTION = sub;
  await renderSidebar('settings');
  renderPage();
})();

function renderPage() {
  const p = CURRENT_PROFILE;

  const html = `
    <header class="page-header">
      <div class="page-title-block">
        <div class="page-title">Settings</div>
        <div class="page-subtitle">Manage your profile, M-Pesa integration, and notification preferences.</div>
      </div>
    </header>

    <div class="tabs">
      <div class="tab ${ACTIVE_TAB === 'subscription' ? 'active' : ''}" onclick="setTab('subscription')">${icon('zap')}<span style="margin-left:6px">Plan</span></div>
      <div class="tab ${ACTIVE_TAB === 'profile' ? 'active' : ''}" onclick="setTab('profile')">${icon('user')}<span style="margin-left:6px">Profile</span></div>
      <div class="tab ${ACTIVE_TAB === 'mpesa' ? 'active' : ''}" onclick="setTab('mpesa')">${icon('card')}<span style="margin-left:6px">M-Pesa</span></div>
      <div class="tab ${ACTIVE_TAB === 'billing' ? 'active' : ''}" onclick="setTab('billing')">${icon('receipt')}<span style="margin-left:6px">Billing & Penalties</span></div>
      <div class="tab ${ACTIVE_TAB === 'email' ? 'active' : ''}" onclick="setTab('email')">${icon('mail')}<span style="margin-left:6px">Email & Reminders</span></div>
      <div class="tab ${ACTIVE_TAB === 'security' ? 'active' : ''}" onclick="setTab('security')">${icon('shield')}<span style="margin-left:6px">Security</span></div>
    </div>

    <div id="settings-tab-body">${renderTab()}</div>
  `;

  document.getElementById('page-content').innerHTML = html;
}

function setTab(tab) { ACTIVE_TAB = tab; document.getElementById('settings-tab-body').innerHTML = renderTab(); }

function renderTab() {
  if (ACTIVE_TAB === 'subscription') return renderSubscriptionTab();
  if (ACTIVE_TAB === 'profile') return renderProfileTab();
  if (ACTIVE_TAB === 'mpesa') return renderMpesaTab();
  if (ACTIVE_TAB === 'billing') return renderBillingTab();
  if (ACTIVE_TAB === 'email') return renderEmailTab();
  if (ACTIVE_TAB === 'security') return renderSecurityTab();
}

/* ---- SUBSCRIPTION / PLAN TAB ---- */
function renderSubscriptionTab() {
  const s = CURRENT_SUBSCRIPTION || {};
  const plans = [
    { id: 'free', name: 'Free', price: 'KES 0', props: 2, rooms: 10, features: 'Basic tracking only', current: s.plan === 'free' },
    { id: 'basic', name: 'Basic', price: 'KES 1,000/mo', props: 10, rooms: 50, features: 'Email, Reports, Reminders', current: s.plan === 'basic' },
    { id: 'pro', name: 'Pro', price: 'KES 2,500/mo', props: 'Unlimited', rooms: 'Unlimited', features: 'Everything + SMS, Automation, Priority Support', current: s.plan === 'pro' },
  ];

  const featureList = s.features || {};

  return `
    <div class="card-elevated" style="margin-bottom: 20px">
      <div class="card-header">
        <div>
          <div class="card-title">Current Plan</div>
          <div style="font-size: 13px; color: var(--color-text-muted); margin-top: 2px">
            Status: <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-warning'} badge-dot">${(s.status || 'active').replace('_',' ')}</span>
          </div>
        </div>
        <div style="text-align: right">
          <div style="font-size: 28px; font-weight: 700; color: var(--color-primary); text-transform: capitalize">${s.plan || 'Free'}</div>
          <div class="eyebrow" style="margin-top: 2px">${s.current_period_end ? 'Renews ' + formatDate(s.current_period_end, 'short') : 'No expiry'}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="grid-2">
          <div>
            <div class="eyebrow" style="margin-bottom: 8px">Your limits</div>
            <div class="detail-list">
              <div class="detail-row"><span class="detail-label">Max properties</span><span class="detail-value">${s.max_properties || 2}</span></div>
              <div class="detail-row"><span class="detail-label">Max rooms per property</span><span class="detail-value">${s.max_rooms_per_property || 10}</span></div>
            </div>
          </div>
          <div>
            <div class="eyebrow" style="margin-bottom: 8px">Features included</div>
            <div class="detail-list">
              <div class="detail-row"><span class="detail-label">Email notifications</span><span class="detail-value">${featureList.email ? '${icon("checkCircle")} Enabled' : '${icon("x")} Not included'}</span></div>
              <div class="detail-row"><span class="detail-label">Reports</span><span class="detail-value">${featureList.reports ? '${icon("checkCircle")} Enabled' : '${icon("x")} Not included'}</span></div>
              <div class="detail-row"><span class="detail-label">Auto reminders</span><span class="detail-value">${featureList.reminders ? '${icon("checkCircle")} Enabled' : '${icon("x")} Not included'}</span></div>
              <div class="detail-row"><span class="detail-label">SMS notifications</span><span class="detail-value">${featureList.sms ? '${icon("checkCircle")} Enabled' : '${icon("x")} Not included'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="eyebrow" style="margin-bottom: 16px">Available plans</div>
    <div class="grid-3">
      ${plans.map(p => `
        <div class="card-elevated" style="${p.current ? 'border-color: var(--color-primary); border-width: 2px' : ''}">
          <div class="card-body-tight" style="padding: 24px; text-align: center">
            ${p.current ? '<div class="badge badge-primary" style="margin-bottom: 12px">Current plan</div>' : ''}
            <div style="font-size: 20px; font-weight: 600; margin-bottom: 16px">${p.name}</div>
            <div style="text-align: left; font-size: 13px; color: var(--color-text-secondary); line-height: 1.8">
              <div class="flex items-center gap-2">${icon('check')} ${p.props} properties</div>
              <div class="flex items-center gap-2">${icon('check')} ${p.rooms} rooms per property</div>
              <div class="flex items-center gap-2">${icon('check')} ${p.features}</div>
            </div>
            ${!p.current ? `<button class="btn btn-secondary w-full" style="width: 100%; margin-top: 20px" disabled>${p.id === 'free' ? 'Downgrade' : 'Upgrade'}</button>
            <div style="font-size: 11px; color: var(--color-text-muted); margin-top: 6px">Contact us to change plans</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ---- PROFILE TAB ---- */
function renderProfileTab() {
  const p = CURRENT_PROFILE;
  setTimeout(() => {
    document.getElementById('profile-form')?.addEventListener('submit', saveProfile);
  }, 0);
  return `
    <div class="card-elevated">
      <div class="card-header"><div class="card-title">Personal Profile</div></div>
      <div class="card-body">
        <form id="profile-form">
          <div class="form-row">
            <div class="form-group">
              <label class="label label-required" for="pf-name">Full name</label>
              <input class="input" id="pf-name" required value="${escapeHtml(p.full_name || '')}" />
            </div>
            <div class="form-group">
              <label class="label" for="pf-phone">Phone</label>
              <input class="input" id="pf-phone" type="tel" value="${escapeHtml(p.phone || '')}" placeholder="+254 7XX XXX XXX" />
            </div>
          </div>

          <div class="form-group">
            <label class="label" for="pf-email">Email</label>
            <input class="input" id="pf-email" type="email" value="${escapeHtml(p.email || '')}" disabled />
            <div class="input-help">To change your email, contact support.</div>
          </div>

          <div class="form-group">
            <label class="label" for="pf-business">Business name (optional)</label>
            <input class="input" id="pf-business" value="${escapeHtml(p.business_name || '')}" placeholder="e.g. Mwangi Properties Ltd" />
            <div class="input-help">Shown on receipts and bills sent to tenants.</div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 24px">
            <button type="submit" class="btn btn-primary">${icon('check')}<span>Save Profile</span></button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function saveProfile(e) {
  e.preventDefault();
  const updates = {
    full_name: document.getElementById('pf-name').value.trim(),
    phone: document.getElementById('pf-phone').value.trim() || null,
    business_name: document.getElementById('pf-business').value.trim() || null,
  };
  const { error } = await sb.from('profiles').update(updates).eq('id', CURRENT_PROFILE.id);
  if (error) { showToast(error.message, 'error'); return; }
  CURRENT_PROFILE = { ...CURRENT_PROFILE, ...updates };
  showToast('Profile updated', 'success');
}

/* ---- M-PESA TAB (self-service connect wizard) ---- */
function renderMpesaTab() {
  const p = CURRENT_PROFILE;
  setTimeout(() => {
    loadMpesaStatus();
    document.getElementById('mpesa-connect-form')?.addEventListener('submit', connectMpesa);
    document.getElementById('prefix-form')?.addEventListener('submit', saveMpesaPrefix);
  }, 0);
  return `
    <div class="card-elevated">
      <div class="card-header"><div class="card-title">M-Pesa Connection</div></div>
      <div class="card-body">
        <div style="background: var(--color-info-bg); padding: 14px; border-radius: var(--radius-md); margin-bottom: 20px; font-size: 13px; color: var(--color-info); line-height: 1.6">
          ${icon('info')} <strong>How it works:</strong> tenants pay <strong>your own paybill</strong> using <strong>PREFIX-UNIT</strong> as the account number (e.g. <code>SRC-A1</code>). Money goes straight to you — CribFlow just records it and matches it to the right tenant. Connect once below and we register the payment-notification URL with Safaricom for you.
        </div>

        <div id="mpesa-status" style="margin-bottom: 20px"></div>

        <form id="mpesa-connect-form">
          <div class="form-row">
            <div class="form-group">
              <label class="label label-required" for="mp-paybill">Paybill number</label>
              <input class="input" id="mp-paybill" value="${escapeHtml(p.paybill_number || '')}" placeholder="e.g. 247247" required />
            </div>
            <div class="form-group">
              <label class="label" for="mp-env">Environment</label>
              <select class="select" id="mp-env">
                <option value="production">Production (live paybill)</option>
                <option value="sandbox">Sandbox (testing)</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="label label-required" for="mp-ckey">Daraja Consumer Key</label>
            <input class="input" id="mp-ckey" placeholder="from developer.safaricom.co.ke → your app" required autocomplete="off" />
          </div>
          <div class="form-group">
            <label class="label label-required" for="mp-csecret">Daraja Consumer Secret</label>
            <input class="input" id="mp-csecret" type="password" placeholder="used once to register, then discarded" required autocomplete="off" />
            <div class="input-help">We use this once to register your callback URL with Safaricom, then discard it — it is never stored.</div>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 8px">
            <button type="submit" class="btn btn-primary" id="mp-connect-btn">${icon('link')}<span>Connect &amp; Register</span></button>
          </div>
        </form>
      </div>
    </div>

    <div class="card-elevated section" style="margin-top: 20px">
      <div class="card-header"><div class="card-title">Default account prefix</div></div>
      <div class="card-body">
        <form id="prefix-form">
          <div class="form-group">
            <label class="label" for="mp-default-prefix">Default account prefix</label>
            <input class="input" id="mp-default-prefix" value="${escapeHtml(p.account_prefix || '')}" placeholder="e.g. RNT" maxlength="6" style="text-transform: uppercase" />
            <div class="input-help">Used as a fallback when a property doesn't have its own prefix.</div>
          </div>
          <div style="display: flex; justify-content: flex-end">
            <button type="submit" class="btn btn-secondary">${icon('check')}<span>Save prefix</span></button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function loadMpesaStatus() {
  const el = document.getElementById('mpesa-status');
  if (!el) return;
  try {
    const s = await apiGet('/api/mpesa/status');
    if (s.registration_status === 'registered') {
      el.innerHTML = `<div style="background: var(--color-success-bg); border: 1px solid var(--color-success-border, #BBF7D0); padding: 12px 14px; border-radius: var(--radius-md); font-size: 13px; color: var(--color-success); display: flex; align-items: center; gap: 10px">
        ${icon('checkCircle')}<div style="flex: 1"><strong>Connected</strong> — Paybill ${escapeHtml(s.paybill_number || '')} (${escapeHtml(s.environment || '')})${s.registered_at ? ` · registered ${formatDate(s.registered_at, 'short')}` : ''}</div>
        <button class="btn btn-secondary btn-sm" id="mp-disconnect">Disconnect</button></div>`;
      document.getElementById('mp-disconnect')?.addEventListener('click', disconnectMpesa);
    } else if (s.registration_status === 'failed') {
      el.innerHTML = `<div style="background: var(--color-danger-bg); border: 1px solid #FCA5A5; padding: 12px 14px; border-radius: var(--radius-md); font-size: 13px; color: var(--color-danger)">
        ${icon('alert')} <strong>Last attempt failed.</strong> ${escapeHtml(s.last_error || '')} — check your credentials and try again.</div>`;
    } else {
      el.innerHTML = `<div style="font-size: 13px; color: var(--color-text-muted)">${icon('info')} Not connected yet. Enter your paybill and Daraja credentials below to start receiving M-Pesa payments.</div>`;
    }
  } catch (err) {
    el.innerHTML = `<div style="font-size: 13px; color: var(--color-text-muted)">Couldn't reach the backend (${escapeHtml(err.message)}). Make sure the API server is running.</div>`;
  }
}

async function connectMpesa(e) {
  e.preventDefault();
  const paybill = document.getElementById('mp-paybill').value.trim();
  const consumerKey = document.getElementById('mp-ckey').value.trim();
  const consumerSecret = document.getElementById('mp-csecret').value.trim();
  const environment = document.getElementById('mp-env').value;
  if (!paybill || !consumerKey || !consumerSecret) { showToast('Paybill, key and secret are required', 'error'); return; }

  const btn = document.getElementById('mp-connect-btn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner spinner-sm" style="border-color:rgba(255,255,255,.3);border-top-color:#fff"></div><span>Connecting…</span>';
  try {
    await apiPost('/api/mpesa/connect', { paybill, consumerKey, consumerSecret, environment });
    document.getElementById('mp-csecret').value = '';
    CURRENT_PROFILE = { ...CURRENT_PROFILE, paybill_number: paybill };
    showToast('M-Pesa connected & notification URL registered', 'success');
    loadMpesaStatus();
  } catch (err) {
    showToast(`Connect failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icon('link')}<span>Connect &amp; Register</span>`;
  }
}

async function disconnectMpesa() {
  const ok = await confirmDialog({
    title: 'Disconnect M-Pesa?',
    message: 'Payments to this paybill will stop auto-recording until you reconnect.',
    confirmText: 'Disconnect', danger: true,
  });
  if (!ok) return;
  try {
    await apiPost('/api/mpesa/disconnect', {});
    CURRENT_PROFILE = { ...CURRENT_PROFILE, paybill_number: null };
    showToast('M-Pesa disconnected', 'success');
    loadMpesaStatus();
  } catch (err) { showToast(err.message, 'error'); }
}

async function saveMpesaPrefix(e) {
  e.preventDefault();
  const prefix = document.getElementById('mp-default-prefix').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { error } = await sb.from('profiles').update({ account_prefix: prefix || null }).eq('id', CURRENT_PROFILE.id);
  if (error) { showToast(error.message, 'error'); return; }
  CURRENT_PROFILE = { ...CURRENT_PROFILE, account_prefix: prefix || null };
  showToast('Prefix saved', 'success');
}

/* ---- BILLING & PENALTIES TAB ---- */
function renderBillingTab() {
  const p = CURRENT_PROFILE;
  setTimeout(() => {
    document.getElementById('billing-form')?.addEventListener('submit', saveBilling);
    document.getElementById('lp-type')?.addEventListener('change', toggleLateFeeFields);
    toggleLateFeeFields();
  }, 0);
  return `
    <div class="card-elevated">
      <div class="card-header"><div class="card-title">Late Payment Penalties</div></div>
      <div class="card-body">
        <form id="billing-form">
          <div class="form-group">
            <label class="label" for="lp-type">Penalty type</label>
            <select class="select" id="lp-type">
              <option value="none" ${p.late_penalty_type === 'none' ? 'selected' : ''}>No penalty</option>
              <option value="flat" ${p.late_penalty_type === 'flat' ? 'selected' : ''}>Flat fee (KSh)</option>
              <option value="percent" ${p.late_penalty_type === 'percent' ? 'selected' : ''}>Percentage of unpaid amount</option>
            </select>
          </div>

          <div class="form-row" id="lp-amount-fields">
            <div class="form-group">
              <label class="label" for="lp-amount">Penalty amount</label>
              <div class="input-prefix-wrap">
                <span class="input-prefix" id="lp-prefix">KSh</span>
                <input class="input" id="lp-amount" type="number" min="0" step="10" value="${p.late_penalty_amount || 0}" />
              </div>
              <div class="input-help" id="lp-help">Charged once when payment is overdue.</div>
            </div>
            <div class="form-group">
              <label class="label" for="lp-grace">Grace period (days)</label>
              <input class="input" id="lp-grace" type="number" min="0" max="30" value="${p.grace_period_days || 0}" />
              <div class="input-help">Days after due date before penalty applies.</div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 24px">
            <button type="submit" class="btn btn-primary">${icon('check')}<span>Save Penalty Settings</span></button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function toggleLateFeeFields() {
  const type = document.getElementById('lp-type')?.value;
  const fields = document.getElementById('lp-amount-fields');
  const prefix = document.getElementById('lp-prefix');
  const help = document.getElementById('lp-help');
  if (!fields) return;
  if (type === 'none') {
    fields.style.display = 'none';
  } else {
    fields.style.display = 'grid';
    if (prefix) prefix.textContent = type === 'percent' ? '%' : 'KSh';
    if (help) help.textContent = type === 'percent'
      ? 'Percentage of the outstanding bill amount.'
      : 'Flat fee charged once when payment is overdue.';
  }
}

async function saveBilling(e) {
  e.preventDefault();
  const updates = {
    late_penalty_type: document.getElementById('lp-type').value,
    late_penalty_amount: parseFloat(document.getElementById('lp-amount').value) || 0,
    grace_period_days: parseInt(document.getElementById('lp-grace').value) || 0,
  };
  const { error } = await sb.from('profiles').update(updates).eq('id', CURRENT_PROFILE.id);
  if (error) { showToast(error.message, 'error'); return; }
  CURRENT_PROFILE = { ...CURRENT_PROFILE, ...updates };
  showToast('Penalty settings saved', 'success');
}

/* ---- EMAIL TAB ---- */
function renderEmailTab() {
  const p = CURRENT_PROFILE;
  setTimeout(() => {
    document.getElementById('email-form')?.addEventListener('submit', saveEmail);
  }, 0);
  return `
    <div class="card-elevated">
      <div class="card-header"><div class="card-title">Reminder Schedule</div></div>
      <div class="card-body">
        <form id="email-form">
          <div class="form-group">
            <label class="label" for="rd">Send reminder after this many days overdue</label>
            <input class="input" id="rd" type="number" min="1" max="60" value="${p.reminder_days || 5}" style="max-width: 140px" />
            <div class="input-help">Tenants will receive a polite reminder by email after their bill is overdue by this many days.</div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 24px">
            <button type="submit" class="btn btn-primary">${icon('check')}<span>Save Reminder Schedule</span></button>
          </div>
        </form>
      </div>
    </div>

    <div class="card-elevated section" style="margin-top: 20px">
      <div class="card-header"><div class="card-title">Email Sender Configuration</div></div>
      <div class="card-body">
        <p style="font-size: 14px; color: var(--color-text-secondary); line-height: 1.6; margin-bottom: 16px">
          Email sending uses Gmail SMTP via the backend. Configure these environment variables in your <code>backend/.env</code> file:
        </p>
        <pre style="background: var(--color-surface-2); padding: 16px; border-radius: var(--radius-md); font-family: var(--font-mono); font-size: 12px; line-height: 1.7; overflow-x: auto; color: var(--color-text-secondary)">GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx</pre>
        <p style="font-size: 13px; color: var(--color-text-muted); margin-top: 12px; line-height: 1.6">
          You'll need to generate a Gmail <strong>App Password</strong> (not your regular password). See <a href="https://support.google.com/accounts/answer/185833" target="_blank">Google's guide</a> for instructions.
        </p>
      </div>
    </div>
  `;
}

async function saveEmail(e) {
  e.preventDefault();
  const updates = { reminder_days: parseInt(document.getElementById('rd').value) || 5 };
  const { error } = await sb.from('profiles').update(updates).eq('id', CURRENT_PROFILE.id);
  if (error) { showToast(error.message, 'error'); return; }
  CURRENT_PROFILE = { ...CURRENT_PROFILE, ...updates };
  showToast('Reminder schedule saved', 'success');
}

/* ---- SECURITY TAB ---- */
function renderSecurityTab() {
  setTimeout(() => {
    document.getElementById('pwd-form')?.addEventListener('submit', changePassword);
    document.getElementById('signout-all')?.addEventListener('click', signOutEverywhere);
  }, 0);
  return `
    <div class="card-elevated">
      <div class="card-header"><div class="card-title">Change Password</div></div>
      <div class="card-body">
        <form id="pwd-form">
          <div class="form-group">
            <label class="label label-required" for="new-pwd">New password</label>
            <input class="input" id="new-pwd" type="password" minlength="8" required placeholder="At least 8 characters" />
            <div class="input-help">Use 8+ characters with letters and numbers.</div>
          </div>
          <div class="form-group">
            <label class="label label-required" for="new-pwd-confirm">Confirm new password</label>
            <input class="input" id="new-pwd-confirm" type="password" minlength="8" required />
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 24px">
            <button type="submit" class="btn btn-primary">${icon('key')}<span>Update Password</span></button>
          </div>
        </form>
      </div>
    </div>

    <div class="card-elevated section" style="margin-top: 20px">
      <div class="card-header"><div class="card-title">Sessions</div></div>
      <div class="card-body">
        <p style="font-size: 14px; color: var(--color-text-secondary); margin-bottom: 16px; line-height: 1.6">
          Sign out of all devices. You'll need to sign in again on each device you use.
        </p>
        <button class="btn btn-secondary" id="signout-all" style="color: var(--color-danger)">${icon('logout')}<span>Sign out everywhere</span></button>
      </div>
    </div>
  `;
}

async function changePassword(e) {
  e.preventDefault();
  const pw1 = document.getElementById('new-pwd').value;
  const pw2 = document.getElementById('new-pwd-confirm').value;
  if (pw1 !== pw2) { showToast('Passwords do not match', 'error'); return; }
  const { error } = await sb.auth.updateUser({ password: pw1 });
  if (error) { showToast(error.message, 'error'); return; }
  document.getElementById('new-pwd').value = '';
  document.getElementById('new-pwd-confirm').value = '';
  showToast('Password updated', 'success');
}

async function signOutEverywhere() {
  const ok = await confirmDialog({
    title: 'Sign out of all devices?',
    message: 'You\'ll need to sign in again on every device.',
    confirmText: 'Yes, sign out',
    danger: true,
  });
  if (!ok) return;
  await sb.auth.signOut({ scope: 'global' });
  window.location.href = '/auth.html';
}
