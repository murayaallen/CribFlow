/* =============================================================================
   CRIBFLOW LOADER (T3) — shared triple loading experience
   Include EARLY in <head> so it paints before content (no FOUC):
     <script src="/js/loader.js" data-context="site|auth|dashboard"></script>
   Dismiss automatically on window load (after a minimum on-screen time), or
   call  CFLoader.done()  from a page once its data has rendered.
   Logo-agnostic: the mark is inline SVG (no image dependency).
   ============================================================================= */
(function () {
  var script = document.currentScript;
  var ctx = (script && script.dataset.context) || 'site';

  var TAGLINES = {
    site: 'Property management, refined.',
    auth: 'Welcome to CribFlow.',
    dashboard: 'Preparing your dashboard…',
  };

  // Gold house-and-flow mark that draws itself (pathLength=1 → uniform draw).
  var MARK =
    '<svg viewBox="0 0 64 64" fill="none" aria-hidden="true">' +
      '<defs>' +
        '<linearGradient id="cfg1" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#F3D6A4"/><stop offset="1" stop-color="#C8924A"/></linearGradient>' +
        '<linearGradient id="cfg2" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0" stop-color="#E8B770"/><stop offset="1" stop-color="#C8924A"/></linearGradient>' +
      '</defs>' +
      '<path class="cf-draw" pathLength="1" d="M11 31 L32 12 L53 31" stroke="url(#cfg1)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path class="cf-draw" pathLength="1" style="animation-delay:.18s" d="M16 29 V51 H48 V29" stroke="url(#cfg1)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path class="cf-draw" pathLength="1" style="animation-delay:.5s" d="M20 45 Q26 41 32 45 Q38 49 44 45" stroke="url(#cfg2)" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path class="cf-draw" pathLength="1" style="animation-delay:.66s" d="M22 51 Q28 47 34 51" stroke="url(#cfg2)" stroke-width="2.2" stroke-linecap="round" opacity="0.7"/>' +
    '</svg>';

  var el = document.createElement('div');
  el.id = 'cf-loader';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Loading CribFlow');
  el.innerHTML =
    '<div class="cf-loader-inner">' +
      '<div class="cf-loader-mark">' + MARK + '</div>' +
      '<div class="cf-loader-word"><span class="w-crib">Crib</span><span class="w-flow">Flow</span></div>' +
      '<div class="cf-loader-tag">' + (TAGLINES[ctx] || TAGLINES.site) + '</div>' +
      '<div class="cf-loader-bar"><div class="cf-loader-fill"></div></div>' +
    '</div>';

  (document.body || document.documentElement).appendChild(el);

  var mountedAt = Date.now();
  var MIN_MS = 850;   // minimum on-screen time so it never "flashes"

  function done() {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    var wait = Math.max(0, MIN_MS - (Date.now() - mountedAt));
    setTimeout(function () {
      el.classList.add('is-hidden');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 640);
    }, wait);
  }

  window.CFLoader = { done: done, context: ctx, el: el };

  // Fallback auto-dismiss: pages that fetch data should call CFLoader.done()
  // themselves once rendered; otherwise dismiss shortly after full load.
  if (document.readyState === 'complete') {
    setTimeout(done, 400);
  } else {
    window.addEventListener('load', function () { setTimeout(done, 300); });
  }

  // Safety net — never let the loader get stuck.
  setTimeout(done, 8000);
})();
