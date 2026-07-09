# CribFlow — Premium Redesign & Completion Plan

> **Canonical working folder from 2026-07-09:** `Desktop\CribFlow` (this repo).
> The old `Desktop\RentFlow` copy is frozen — do not edit it.
> **Discipline:** one commit per task (`T<n>: <what>`), pushed to GitHub after every task.
> Production hosts: `crib.flows.co.ke` (frontend) · `crib-api.flows.co.ke` (backend) · Supabase `vlupmakmclrmfeovinmi`.

---

## 1. Vision

CribFlow should feel **premium, almost elite** — a crafted Kenyan product, not an
AI-prompted template. Deep emerald + champagne gold heritage, real Nairobi property
photography (Westlands / Kileleshwa / Ngong Road), confident serif display type,
liquid-glass surfaces, deliberate motion. Calm, expensive, trustworthy — because it
handles people's rent money.

**Strict user flow:** Website (multipage) → Log in → Dashboard. No shortcuts, no
dead ends. Every stage has its own branded loading moment.

---

## 2. Design language (foundation for every task)

- **Palette:** deep emerald `#0F4C3A` → rich teal-black gradients; champagne gold
  `#C8924A→#E8B770` accents; warm ivory `#FAFAF6` light surfaces; charcoal
  `#141513` dark surfaces. Gradients used deliberately (heroes, buttons, stat
  accents) — never noisy.
- **Type:** serif display for headlines (e.g. Fraunces — character, "personality"),
  Plus Jakarta Sans / Manrope for UI body, tabular numerals for money. Bigger,
  more confident sizes; tighter tracking on display, generous line-height on body.
- **Spacing:** consistent 4/8px scale; sections breathe (96–140px vertical on site,
  24/32 rhythm in app). No cramped cards.
- **Surfaces:** liquid-glass (translucent blur + fine border + inner light) for
  auth card, nav, modals; elevated cards with soft multi-layer shadows in app.
- **Motion:** scroll-reveals, parallax on imagery, page-transition veil (shared
  across site pages), micro-interactions on hover/press, animated counters.
  Everything 150–450ms, eased, `prefers-reduced-motion` respected.
- **Voice:** short, confident, Kenyan-aware copy. Tagline replaces testimonials.

---

## 3. Task series (build order — commit after each)

### Stage A — Foundation
- **T0. Workspace + GitHub** ✅ folder copied, history intact. Remaining: create
  GitHub remote (user installs `gh` or creates repo on github.com), push.
- **T1. Design tokens v2** — rewrite `css/design-system.css` tokens: palette,
  gradients, type scale (serif display + UI sans via Google Fonts), spacing,
  radii, shadows, glass utilities, motion variables. App + site share tokens.
- **T2. Custom alert & dialog system** — replace default toasts/confirms with
  branded glass alerts (success/warn/error/info), animated in/out, consistent
  everywhere (`utils.js`).
- **T3. Loading experience ×3** — aesthetic branded loaders: (a) website entry,
  (b) auth launch, (c) dashboard launch. Shared mark animation (logo draw/pulse
  + gradient veil), each stage distinct but related.

### Stage B — The website (multipage)
- **T4. Site architecture** — split single landing into multipage:
  `index.html` (Home — becomes the SITE, not the dashboard), `features.html`,
  `how-it-works.html`, `about.html` (story/tagline/contact). Shared site
  nav/footer as JS partials. **Dashboard moves to `dashboard.html`** — every
  app link, sidebar entry, auth redirect, and `requireAuth()` bounce updated.
  Root flow: `/` = website → Login CTA → `auth.html` → `dashboard.html`.
- **T5. Home page** — cinematic hero with Nairobi high-rise imagery, parallax,
  animated stats (honest ones), feature teasers, statement photography bands,
  tagline section (replaces testimonials/reviews — **all reviews removed**),
  CTA. **No pricing anywhere on the site (removed for now).**
- **T6. Features + How-it-works pages** — scroll-driven storytelling, imagery,
  interactive cards, dashboard preview mock frames.
- **T7. About page** — brand story, tagline, contact (info@flows.co.ke), imagery.
- **T8. Page transitions + polish pass** — shared veil transition between site
  pages, scroll effects tuned, mobile nav (glass drawer), responsive/side-scroll
  audit of the whole site.

### Stage C — Auth
- **T9. Liquid-glass login/signup redesign** — glass card over property imagery,
  refined typography, no testimonial (tagline), branded loader into dashboard.
- **T10. Email verification** — enable Supabase email confirmations; build
  verify-your-email screen, resend flow, unverified-login handling, and the
  verified redirect. (Needs one dashboard toggle — user click, guided.)

### Stage D — Dashboard experience
- **T11. App shell polish** — sidebar (new logo, glass accents), header, page
  transitions in-app, dashboard launch loader, profile avatar/logo surfaced.
- **T12. Billing + Payments UX overhaul** (priority pages) — clearer hierarchy,
  bigger touch targets, sticky action bars, simplified flows (generate → send →
  track), mobile tables that scroll gracefully with pinned key columns.
- **T13. All remaining pages sweep** — Properties, Tenants (+details), Water,
  Reports, Settings: spacing, typography, empty states, mobile scaling,
  interactive touches, custom alerts wired in.
- **T14. Mobile responsiveness deep pass** — every page at 360/390/768 widths:
  no horizontal page scroll (tables scroll inside), thumb-sized controls,
  readable scale, smooth scrolling.

### Stage E — Security & session
- **T15. 10-minute inactivity timeout** — activity tracker (mouse/key/touch/scroll),
  warning alert at 9 min, auto sign-out + redirect to login with friendly notice.
- **T16. End-to-end connection audit** — verify + document: HTTPS everywhere,
  CORS lock, security headers/CSP, RLS spot-checks, JWT handling, secrets
  hygiene, callback guards. Fix anything found.

### Stage F — Brand assets
- **T17. Logo refinement** — polish existing house mark into final CribFlow mark
  (cleaner geometry, gold accent tuning), export set: full logo, icon, white,
  favicon, email header. Wire everywhere: site nav, splash, sidebar, auth,
  email templates, favicon (currently 404).
- **T18. Email template reskin** — bills/receipts/reminders match new brand
  (logo header, palette, type).

### Stage G — Ship
- **T19. Full QA pass** — flow walk (site → login → verify → dashboard → billing
  → payment → email), cross-device, dark mode, load times.
- **T20. Deploy to DirectAdmin** — full re-upload (see §6) + benched items.

---

## 4. Imagery needed (user is sourcing — see prompts in plan message / §7)

Save to **`frontend/images/site/`** with these exact names (JPG or WebP):
`hero-westlands.jpg`, `kileleshwa-midrise.jpg`, `ngong-road-complex.jpg`,
`interior-living.jpg`, `balcony-skyline.jpg`, `gated-compound.jpg`,
`tower-night.jpg`, `rooftop-amenity.jpg`, `entrance-detail.jpg`,
`manager-portrait.jpg`.
Hero/banners ≥2400×1350 (16:9); interiors ≥1600px; portrait 4:5.

---

## 5. User (Allen) task list

1. **GitHub:** install GitHub CLI (`winget install GitHub.cli`) then `gh auth login`
   — OR create an empty **private** repo `CribFlow` on github.com and paste its URL.
2. **Images:** generate/source the 10 photos per the briefs → drop into
   `Desktop\CribFlow\frontend\images\site\` with the exact filenames above.
3. **Supabase toggle (at T10):** Auth → Providers → Email → enable "Confirm email"
   (guided when we get there).
4. **Benched (unchanged):** Daraja sandbox creds + test tenant (M-Pesa test);
   paste `crib-cron.sh` + 3 cron jobs (recipe in memory/deployment doc).
5. **Later:** rotate `info@flows.co.ke` password; Supabase Pro + PITR at go-live.

---

## 6. DirectAdmin re-upload map (grows as tasks land)

Already pending from before: `js/pages/payments.js`, `landing.html`,
`images/rentflow-logo/` (404 live). **After this redesign the entire `frontend/`
tree is re-uploaded fresh** (structure changes: new `index.html` site home,
`dashboard.html`, new pages, `images/site/`, new brand assets) — plus
`backend/services/mailer.js` already done, and any backend files T16 touches.
`js/config.js` on the server must be preserved (or re-set: API_URL + keys).

---

## 7. Carried-forward context (from memory)

- Live + verified: frontend/backend/SSL/CORS/health, DB reconciled, money engine
  8/8, email via info@flows.co.ke (SMTP 587). M-Pesa sandbox + cron **benched**.
- Multi-landlord M-Pesa is self-service; secrets never stored; money settles
  directly to landlords.
- Supabase on **Free** — upgrade to Pro + PITR before real money.
