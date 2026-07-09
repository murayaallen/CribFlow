/* =============================================================================
   CRIBFLOW THEME — shared light/dark handling (site + app)
   Include EARLY in <head> so the saved theme is applied before paint (no flash).
   Uses the same localStorage key ('rf-theme') as the app sidebar toggle.
   API: CFTheme.get() | .set('light'|'dark') | .toggle()  → emits 'themechange'.
   ============================================================================= */
(function () {
  var KEY = 'rf-theme';

  function get() { return document.documentElement.getAttribute('data-theme') || 'light'; }

  function set(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    document.dispatchEvent(new CustomEvent('themechange', { detail: t }));
  }

  // Apply saved theme (or fall back to system preference) immediately.
  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (!saved) {
    saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', saved);

  window.CFTheme = {
    get: get,
    set: set,
    toggle: function () { var next = get() === 'dark' ? 'light' : 'dark'; set(next); return next; },
  };
})();
