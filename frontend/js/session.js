/* =============================================================================
   CRIBFLOW SESSION (T15) — auto sign-out after 10 minutes of inactivity
   Include on PROTECTED (app) pages only, after supabase-client.js + utils.js.
   Warns at 9 min; any real activity resets the timers.
   ============================================================================= */
(function () {
  var TIMEOUT_MS = 10 * 60 * 1000;   // sign out after 10 min idle
  var WARN_MS    = 9  * 60 * 1000;   // warn 1 min before
  var warnTimer, logoutTimer, warnToast = null, lastReset = 0;

  function clearWarn() {
    if (warnToast && typeof removeToast === 'function') removeToast(warnToast);
    warnToast = null;
  }

  function schedule() {
    clearTimeout(warnTimer);
    clearTimeout(logoutTimer);
    warnTimer = setTimeout(function () {
      if (typeof showToast === 'function') {
        warnToast = showToast('You’ll be signed out in 1 minute. Move your mouse or press a key to stay.', 'warning',
          { title: 'Still there?', duration: 60000 });
      }
    }, WARN_MS);
    logoutTimer = setTimeout(logout, TIMEOUT_MS);
  }

  function reset() {
    var now = Date.now();
    if (now - lastReset < 1000) return;   // throttle
    lastReset = now;
    clearWarn();
    schedule();
  }

  async function logout() {
    clearWarn();
    try { if (window.sb && sb.auth) await sb.auth.signOut(); } catch (e) {}
    window.location.href = '/auth?timeout=1';
  }

  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, reset, { passive: true });
  });
  // Re-arm when returning to the tab.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) reset(); });

  schedule();
})();
