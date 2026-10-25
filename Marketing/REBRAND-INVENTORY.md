# PBTable → Nexorally — rebrand inventory & checklist

Generated 13 Sep 2026. Scope (per decisions): rebrand the **club-app product** now
(marketing, docs, blog, app, leaderboards, member app, legal). Nexlane stays the legal
entity. All on Netlify. Email/Brevo stays `@pbtable.co.uk` for now. League + Tournament
fold in later (umbrella, phased).

**New brand:** Nexorally · tagline "Book · Play · Score · Rank"
**New palette:** ink `#101828` (was `#1B2B4B`) · accent orange `#f97316` (was coral `#D94F2B`) · muted `#475467` · border `#d0d5dd`
**Logo assets:** `Marketing/nexorally-logos/{png,svg}/nexorally-{lockup,mark}-{light,dark}.{png,svg}`

**Blast radius:** `PBTable` name = 515 hits / 92 files · `pbtable.com/.co.uk` = 354 / 62 · old colours = 95 / 27.

---

## GROUP A — SAFE (copy / visual). I can do these here, on a draft. No live risk.

### A1. Marketing site (`pbtable-site/`)
Name + colour + logo swaps in each page's inline CSS/content:
- `index.html`, `features.html`, `getting-started.html`, `bookings.html`, `graded-sessions.html`,
  `social-sessions.html`, `savings-calculator.html`, `terms.html`, `dpa.html`,
  `blog/index.html`, `blog/how-to-run-a-successful-pickleball-club-night.html`
- `site.webmanifest` (name, theme_color)
- Also the root working copies: `pbtable-website.html` (canonical home), `graded-sessions.html`, `social-sessions.html`

### A2. Docs (`pbtable-site/docs/`)
- Regenerate from the generator after updating: `_docs.css` tokens (ink/accent), the logo/wordmark in the template, and the brand name in `BUILD-SOURCE.md`.
- NOTE: canonical docs source is the **production repo** `docs/kb/*.md` — the name change there is a production-side edit (same as the "colours" fix). I update the bundle + regenerate; production updates the individual files.

### A3. Legal docs (`legal/`)
- `Nexlane-PBTable-Terms-of-Service-v1.0.md` (23 hits) and the web `terms.html`/`dpa.html`:
  product **PBTable → Nexorally**; KEEP "Paul Berry, trading as Nexlane"; KEEP `paul@pbtable.co.uk` contact for now (email migrates later).
- Rename files to `Nexlane-Nexorally-...` for tidiness (optional).

### A4. Brand assets to regenerate (from the new Nexorally mark)
- `pbtable-site/`: `pbtable-logo.png`, `pbtable-og.png`, `favicon.ico`, `favicon-16x16.png`,
  `favicon-32x32.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`,
  `PBTable Logo - Transparent.png`, `savings-logo.png`, `blog-og.jpg`/`blog-card.jpg`/`blog-hero.jpg` (share cards)
- Rebuild OG cards (`pbtable-og.png`, `blog-og.jpg`) with the Nexorally lockup + new palette.

### A5. Colour tokens
- Swap `#1B2B4B`→`#101828`, `#D94F2B`→`#f97316` (+ derive new hover/deep/light variants for `#0f1e38`, `#ff6844`) across A1 + A2 CSS.

---

## GROUP B — RISKY (domain / auth / backend / infra). Hand to production sessions with this spec.

### B1. App club-resolution — MUST accept BOTH domains before any flip
- `PBTable Bookings/src/services/backend.ts` — host detection (`demo.pbtable.com`, `<slug>.pbtable.com`) → strip `.pbtable.com` **or** `.nexorally.com`.
- `PBTable Bookings/src/services/clubSite.ts:48` — `https://${slug}.pbtable.com${...}` builds absolute club URLs → make domain-aware (use current origin / canonical).
- `PBTable Bookings/src/services/data.supabase.ts:760` — `https://demo.pbtable.com/wallet` default.

### B2. Edge functions (Supabase)
- `supabase/functions/provision-club/index.ts` — `APEX = "pbtable.com"` + **adds `<slug>.pbtable.com` as a Netlify domain alias** on new-club creation → new clubs should get `<slug>.nexorally.com` (and, during dual-run, ideally both). Sender name too.
- `supabase/functions/create-checkout-session/index.ts:60` — Stripe `return_url` → nexorally / dynamic.
- `supabase/functions/create-topup-checkout/index.ts:74-75` — top-up `success_url`/`cancel_url`.
- `supabase/functions/stripe-webhook/index.ts` — `TRIAL_CONVERT_URL` + `TRIAL_FROM` defaults (env-driven; set the env vars).

### B3. Infra (Netlify + DNS + Supabase + Stripe)
- Netlify: add `nexorally.com` + `*.nexorally.com` as domain aliases (wildcard) + auto-SSL; keep pbtable domains; later 301 pbtable → nexorally (per-subdomain).
- DNS: wildcard `*.nexorally.com` → Netlify; grab `nexorally.co.uk`.
- Supabase Auth: add nexorally site/redirect URLs (incl. wildcard) alongside pbtable; CORS.
- Stripe: return/Connect URLs; Customer Portal branding. (Statement descriptor: LATER.)
- `.netlify/netlify.toml` (both root and `PBTable Bookings/`) + `_redirects` — domain/redirect config.

### B4. App identity (app/native session)
- `PBTable Bookings/app.json` — `name`/`slug` `pbtable-bookings`, `scheme` `pbtablebookings` (deep-link scheme).
- `PBTable Bookings/src/theme.ts` + `src/components/ui.tsx` — app colour tokens (visual, but in the app repo).
- App copy: `Header.tsx`, `SignIn.tsx`, `types.ts`, `data.*.ts` "PBTable" strings.

---

## GROUP C — LATER (deferred by decision)
- **Email/Brevo migration** `@pbtable.co.uk` → `@nexorally.com` (kept for now — Brevo dependency).
- **Stripe statement descriptor** (kept for now).
- **InterCounty-League/** and **Tournament-Manager/** "PBTable" references (fold in when those products migrate under the umbrella).
- DB schema/migration **comments** mentioning PBTable (`supabase-schema.sql`, migrations) — cosmetic; leave.

## IGNORE — stale/experiment files (not live)
`pbtable-website.ORIGINAL.html`, `experiment.html`, `pbtable-taste-concept.html`,
`pbtable-site/apple-preview.html`, `make_logo.py`, `PBTable-Website-Reference.md`,
`PBTable - The Three-Hour Rule - Release Note.{html,pdf}`, `How your RDR rating works.html`.
(Optionally delete during cleanup.)

---

## Recommended order
1. **Me (here):** Group A on a fresh draft — new palette, logo, OG/favicons, name, legal — for your review. Nothing live changes.
2. **Production sessions:** Group B1 (dual-run) first, then B2/B3 allowlists + Netlify wildcard.
3. Flip canonical to nexorally; 301 the old; keep redirects forever.
4. Later: Group C (email, descriptor, League/Tournament).
