# Nexorally switchover runbook

The end-to-end plan to move `<slug>.pbtable.com` → `<slug>.nexorally.com` **without breaking anything**.
Companion to [`REBRAND-INVENTORY.md`](REBRAND-INVENTORY.md) (what/where) and [`STRIPE-NEXORALLY-PRICING-SPEC.md`](STRIPE-NEXORALLY-PRICING-SPEC.md) (billing).

## Guiding principle: dual-run, then flip, then 301 forever

Everything is made to **accept BOTH domains** before anything **prefers** the new one. pbtable.com keeps working the entire time; there is no flag-day. Because the app resolves the club from "the first DNS label" (domain-agnostic), `<slug>.nexorally.com` already resolves to the right club the moment DNS points at Netlify.

**Confirmed infrastructure (2026-09-18):**
- DNS/nameservers at **IONOS** (not Netlify). Club subdomains are **per-club CNAMEs** at IONOS → Netlify apps. No wildcard today.
- `pbtable.com` apex → marketing Netlify site (A `75.2.60.5`). `<slug>.pbtable.com` → app site(s) (`pbtable-app` / `pbtable-swindon` / `pbtable-demo`).
- `nexorally.com` registered at IONOS, **empty** (no site, no email). `.co.uk/.store/.info` also owned → redirect to `.com`.
- Email sends via **Brevo on pbtable.co.uk** (welcome email + Supabase Auth sign-in codes). **Resend is dormant** (no-op, no API key). Mail stays `@pbtable.co.uk` through the whole migration.

---

## PHASE 0 — Prep now (safe, additive, zero effect on live pbtable.com)

Everything here either sits un-deployed in the repo, or is additive in a console (adding nexorally never removes pbtable).

### 0a. Stage code as backward-compatible (in repo, deploy later)
- [ ] `PBTable Bookings/src/services/clubSite.ts:48` — extract the hardcoded apex into a single constant `const CLUB_APEX = 'pbtable.com'` (native-only club links). No behaviour change now; switchover = flip one line.
- [ ] `supabase/functions/provision-club/index.ts:14` — make apex env-driven: `const APEX = Deno.env.get('CLUB_APEX') ?? 'pbtable.com'`. Default unchanged, so deploying is safe; switchover = set the env var.
- [ ] `supabase/functions/create-checkout-session/index.ts:60` — make the marketing return URL env-driven: `Deno.env.get('MARKETING_URL') ?? 'https://pbtable.com'`.
- [ ] `supabase/functions/stripe-webhook/index.ts:134` — already env-driven via `TRIAL_CONVERT_URL` (default pbtable.com). No code change; switchover = set env var.
- [ ] `supabase/functions/create-topup-checkout/index.ts:74-75` — default success/cancel URLs point at `demo.pbtable.com`; client passes its own origin so this is only a fallback. Update default for tidiness.
- [ ] `backend.ts` — **NO CHANGE NEEDED.** Slug = first label (works for nexorally); demo detected via `startsWith('demo.')` (matches `demo.nexorally.com`). Optional: drop the redundant `demo.pbtable.com` literal + refresh comments.
- [ ] `app.json` (native) + app `theme.ts` — apply the Nexorally name/slug/scheme/colours (native isn't in production, so safe to stage). Note the deep-link scheme change `pbtablebookings://`.

### 0b. Dashboard backend map (additive)
- [ ] `PB_BACKENDS` (in `PBTable Bookings/demo-site/index.html`, and wherever the production club-dashboard index is generated) — **add** nexorally host→backend entries alongside the pbtable ones so the dashboard agrees with `backend.ts`. Additive; pbtable entries stay.

### 0c. Console allowlists (additive — safe to do today)
- [ ] **Supabase Auth** → URL Configuration: add `https://*.nexorally.com` and `https://nexorally.com` to the redirect allow-list and (if used) additional Site URLs. Keep all pbtable entries. This lets nexorally sign-in work the moment it's live, and changes nothing for pbtable.
- [ ] **Stripe** → add `nexorally.com` to any Checkout/branding allowed domains. (Most return URLs are origin-derived, so they follow the hostname automatically.)

### 0d. Stand up the DNS zone (no flip yet)
- [ ] **Netlify** → Domains → add `nexorally.com`; copy the 4 Netlify nameservers.
- [ ] **IONOS** → nexorally.com → set custom nameservers to Netlify's. (Zero risk: nexorally.com serves nothing yet.)
- [ ] Do **not** attach the domain to sites yet if you want to stay fully dark. Attaching (0e/Phase 1) is what makes nexorally publicly serve.

---

## PHASE 1 — Stand nexorally up in parallel & verify (still no change for existing clubs)

Do this when you're ready to test. pbtable.com stays fully live throughout.

- [ ] **Netlify** → marketing site: add domain `nexorally.com` (apex). → app site (`pbtable-app`): add **wildcard `*.nexorally.com`**. Netlify auto-provisions SSL incl. the wildcard cert (this is why DNS moved to Netlify).
- [ ] Deploy the Phase-0a staged code (functions + sites). All backward-compatible; pbtable keeps working.
- [ ] **Verify on nexorally while pbtable still works** — full loop on one club (e.g. `glos.nexorally.com`): dashboard loads → `/app` → sign in (member OTP) → book a session → wallet top-up (Stripe). Confirm branding + data correct.
- [ ] Confirm `demo.nexorally.com` resolves to the demo project (via `startsWith('demo.')`).

---

## PHASE 2 — Flip canonical (new clubs + marketing born on nexorally)

- [ ] `provision-club`: set `CLUB_APEX=nexorally.com` (env). **Also** skip the per-club Netlify-alias API step — the wildcard now covers new clubs (remove/guard that call).
- [ ] Marketing site: flip canonical/OG/Twitter + demo links to nexorally. In `pbtable-website.html` that's lines **8, 23, 26, 33** (canonical, og:url, og:image, twitter:image) and the `demo.pbtable.com` links (**680, 707, 712, 1278**); same across all `pbtable-site/*.html` (see inventory). Re-sync `pbtable-site/index.html` and deploy.
- [ ] Set `MARKETING_URL=https://nexorally.com` and `TRIAL_CONVERT_URL=https://nexorally.com/#order` (Supabase function env).
- [ ] Start sending new emails with nexorally links (content only; sender stays pbtable.co.uk — see Group C).
- [ ] Existing clubs keep working on pbtable.com — no rush, no forced cutover.

---

## PHASE 3 — Redirect old → new, forever

- [ ] Edge 301: `<slug>.pbtable.com/<path>` → `<slug>.nexorally.com/<path>`, **preserving the subdomain label** and path. Apex `pbtable.com` → `nexorally.com`.
- [ ] Use **302 during transition**, promote to **301** only once confident (browsers cache 301s hard).
- [ ] `.co.uk / .store / .info` → **IONOS domain forwarding**, 301 → `https://nexorally.com`.
- [ ] Keep all redirects permanently — cheap, protects old bookmarks / QR codes / shared links.
- [ ] Google/Bing Search Console: add nexorally.com property, submit sitemap; the 301 carries link equity.

---

## Known gotchas (tell clubs / expect)
1. **Members sign in once more** at cutover — Supabase sessions are per-origin (localStorage), so `pbtable.com` and `nexorally.com` are separate. Same OTP flow, one extra sign-in. (Covered in the club heads-up email.)
2. **Don't 301 permanently too early** — start with 302.
3. **Don't touch pbtable.com's IONOS mail records** — MX/DKIM/SPF/DMARC stay; email keeps flowing.
4. **Wildcard SSL needs Netlify DNS** — the reason nexorally.com's nameservers move to Netlify.

---

## GROUP C — Email migration (deferred; do after the domain move)
Not required for switchover. When ready to send from `@nexorally.com`:
1. Add nexorally.com as a **sending domain in Brevo** (consolidate — drop dormant Resend unless its templating is wanted); add its DKIM/SPF/DMARC records in **Netlify DNS**.
2. Verify a sender (e.g. `hello@nexorally.com` / `noreply@nexorally.com`).
3. Update the "from" in: `provision-club` (Brevo), Supabase Auth email sender (sign-in codes), `TRIAL_FROM` (+ Resend `from` if kept).
4. Retire pbtable.co.uk sending. Keep the IONOS mailbox for replies until fully moved. **Never let pbtable.co.uk lapse during transition.**

---

## Rollback
- Phases 0–1 add nexorally without removing pbtable, so rollback = detach nexorally domains / revert env vars; pbtable is untouched throughout.
- Phase 2 is reversible by reverting the marketing deploy + env vars.
- Phase 3 (301) is the only "committing" step — hence 302-first.
