# CribFlow Redesign — Requirements Checklist

Living tracker of **every item from the brief**. ✅ done · 🔨 in progress · ⬜ pending · 🔒 blocked (needs asset/toggle)
Commits pushed to `github.com/murayaallen/CribFlow` after each task.

## Setup & process
- ✅ Copy project to new folder `Desktop\CribFlow`; work from here
- ✅ GitHub set up; commit after every task (10 commits pushed)
- ✅ Fable for design direction / Opus for task execution
- ✅ Roadmap of tasks (`docs/REDESIGN-PLAN.md`) + image briefs + logo briefs
- ✅ Remove pricing from the website (no pricing on the new site)
- ✅ Remove reviews/comments → tagline (landing rebuilt; auth testimonial removed in T9 🔨)

## Foundation (done)
- ✅ Premium palette + gradients + color system, elite feel (T1)
- ✅ Better font style/size — Fraunces serif display + hero type scale (T1)
- ✅ Better, organised spacing scale (T1)
- ✅ Personality (voice, serif, brand tone) not "AI-prompted" (T1/T4)
- ✅ Custom alert styles — glass toasts + branded confirm (T2)
- ✅ Interactive effects — hover-lift, shine, glow, orbs (T1)
- ✅ Enhanced (not reduced) motion (T1)
- ✅ Loading screens — aesthetically brilliant, site/login/dashboard, prolonged (T3)
- ✅ Liquid-glass UI utilities (T1)

## Website (multipage)
- ✅ Multipage website — Home, Features, How-it-works, About (T4)
- ✅ Strict flow: website → login → dashboard (`dashboard.html` pivot) (T4)
- ✅ Scrolling effects / animations populated (scroll-reveal, parallax) (T4/polish)
- ✅ Image allocation — backgrounds, showpieces, display art slots (T4/polish)
- ✅ Texture + animated backgrounds in sections (grain + ambient orbs) (polish)
- ✅ Light/dark theme toggle on the site (+ persists with app) (polish)
- 🔒 Populate real house/apartment photography (T5–T7) — **needs the 10 photos**
- ⬜ Page-switching transition effect between site pages (T8)

## Auth
- 🔨 Login page redesign — liquid glass, tagline (T9, in progress)
- 🔒 Email verification on login — verify/resend screens (T10) — **needs Supabase "confirm email" toggle**

## Dashboard / app
- ⬜ Dashboard UX overhaul — scale, usability, UX (T11)
- ⬜ Billing + Payments easy to use (priority) (T12)
- ⬜ All dashboard sections polished (T13)
- ⬜ Mobile responsiveness deep pass — no side-scroll, scaling, scroll UX (T14)
- ✅ App inherits new tokens/alerts/loader/theme already (T1–T3)

## Security & session
- ✅ 10-minute inactivity auto-logout (T15)
- ⬜ Confirm end-to-end connections well protected (E2E security audit) (T16)

## Brand assets
- ✅ Logos integrated — nav, sidebar, auth, favicon (T17)
- ✅ Profile/brand logo for website + dashboard (T17)
- ⬜ Email header logo + email template reskin (T18)
- ⬜ Optional logo tweaks/polish for final spectacle (T17 follow-up)

## Ship
- ⬜ Full QA pass (T19)
- ⬜ Files to re-upload to DirectAdmin (whole `frontend/` + any backend) (T20)
- 🔒 Benched from before: M-Pesa sandbox test, cron jobs, Supabase Pro + PITR

## Your inputs still needed
1. 🔒 **10 photos** → `frontend/images/site/` (unlocks T5–T7 + showpieces)
2. 🔒 **Supabase** Auth → enable "Confirm email" (unlocks T10)
3. Benched: Daraja sandbox creds + test tenant; paste cron jobs
