/* =============================================================================
   CRIBFLOW SITE (T4) — shared nav + footer + scroll motion for the website
   Pages include: <header id="site-nav"></header> ... <footer id="site-footer">
   Set  <body data-nav="dark">  when the page opens on a dark hero.
   ============================================================================= */
(function () {
  document.documentElement.classList.add('js');

  // Logo-agnostic gold house glyph (swapped for the real logo at T17).
  var GLYPH =
    '<svg class="site-logo-glyph" viewBox="0 0 32 32" fill="none" aria-hidden="true">' +
      '<rect width="32" height="32" rx="8" fill="#0F4C3A"/>' +
      '<path d="M8 17 L16 9 L24 17" stroke="#E8B770" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M10.5 15.5 V23 H21.5 V15.5" stroke="#E8B770" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M12 22 Q16 19.5 20 22" stroke="#C8924A" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>';

  var WORD = '<span class="w-crib">Crib</span><span class="w-flow">Flow</span>';
  var LINKS = [
    { href: '/', label: 'Home' },
    { href: '/features.html', label: 'Features' },
    { href: '/how-it-works.html', label: 'How it works' },
    { href: '/about.html', label: 'About' },
  ];

  var path = location.pathname.replace(/index\.html$/, '') || '/';
  function isActive(href) {
    if (href === '/') return path === '/';
    return path.indexOf(href) === 0;
  }

  function navLinksHTML(cls) {
    return LINKS.map(function (l) {
      return '<a class="' + cls + (isActive(l.href) ? ' active' : '') + '" href="' + l.href + '">' + l.label + '</a>';
    }).join('');
  }

  /* ---- NAV ---- */
  var nav = document.getElementById('site-nav');
  if (nav) {
    nav.className = 'site-nav' + (document.body.dataset.nav === 'dark' ? ' on-dark' : '');
    nav.innerHTML =
      '<a class="site-logo" href="/">' + GLYPH + WORD + '</a>' +
      '<nav class="site-nav-links">' + navLinksHTML('site-nav-link') +
        '<a class="btn btn-primary site-nav-cta" href="/auth.html">Log in</a>' +
      '</nav>' +
      '<button class="site-nav-toggle" aria-label="Menu">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18" stroke-linecap="round"/></svg>' +
      '</button>';

    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 24); };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

    // mobile drawer
    var drawer = document.createElement('div');
    drawer.className = 'site-drawer';
    drawer.innerHTML =
      '<button class="site-drawer-close" aria-label="Close">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12" stroke-linecap="round"/></svg>' +
      '</button>' + navLinksHTML('') +
      '<a class="btn btn-primary btn-lg" href="/auth.html">Log in</a>';
    document.body.appendChild(drawer);
    nav.querySelector('.site-nav-toggle').addEventListener('click', function () { drawer.classList.add('open'); document.body.style.overflow = 'hidden'; });
    drawer.querySelector('.site-drawer-close').addEventListener('click', function () { drawer.classList.remove('open'); document.body.style.overflow = ''; });
  }

  /* ---- FOOTER ---- */
  var footer = document.getElementById('site-footer');
  if (footer) {
    var year = new Date().getFullYear();
    footer.className = 'site-footer';
    footer.innerHTML =
      '<div class="site-footer-inner">' +
        '<div class="site-footer-brand">' +
          '<a class="site-logo" href="/">' + GLYPH + WORD + '</a>' +
          '<p>Property management, refined — automated billing and M-Pesa reconciliation for Kenya’s landlords.</p>' +
        '</div>' +
        '<div><h4>Product</h4>' +
          '<a href="/features.html">Features</a><a href="/how-it-works.html">How it works</a><a href="/auth.html">Log in</a>' +
        '</div>' +
        '<div><h4>Company</h4>' +
          '<a href="/about.html">About</a><a href="mailto:info@flows.co.ke">Contact</a>' +
        '</div>' +
      '</div>' +
      '<div class="site-footer-bottom">' +
        '<span>© ' + year + ' CribFlow. All rights reserved.</span>' +
        '<span>Built in Nairobi · a flows.co.ke product</span>' +
      '</div>';
  }

  /* ---- SCROLL-REVEAL ---- */
  var reveals = document.querySelectorAll('[data-reveal]');
  if (reveals.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          var d = e.target.getAttribute('data-reveal-delay');
          if (d) e.target.style.setProperty('--reveal-delay', d + 'ms');
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }
})();
