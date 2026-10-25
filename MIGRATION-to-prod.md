# PBTable — Demo → Production migration (handoff)

**Goal:** bring the full validated demo build into the production dashboard (`swindon.pbtable.com`
today, the *core* `pbtable-app` going forward), losing nothing, with **booking hidden for swindon**
but staying live on the demo.

**Source of truth:** the demo — `PBTable Bookings/demo-site/` (dashboard `index.html` + `app/` bundle),
live and verified on demo.pbtable.com. Backend = the **DEMO** Supabase project `ezfpoyuebqjebxdcxyzy`.

**Production targets:** Netlify site `pbtable-swindon` (→ `swindon.pbtable.com`), Supabase project
**`kxvtqsmjlhlajkoyejwk`**, repo `PBTable-Production` (GitHub).

**Safety rule:** nothing touches the production Supabase or the production deploy without an explicit
go. Reads (schema/diff) are fine; writes/deploys are gated (marked ⚠️).

---

## 0. Scope insight — this promotion is almost entirely FRONTEND

Since **booking is hidden for swindon**, the booking/comp **database backend is NOT required** for the
swindon promotion. It's deferred to "when a club enables booking" (§5). So the immediate job is:

- **Frontend merge** into the prod dashboard (`index.html`) — no prod DB changes.
- **One config change** (host‑derived backend/tenant) — the un‑fork linchpin.
- **One club setting** (`booking_enabled:false` for swindon).

No production database migration is needed to go live on swindon.

---

## 1. What changed on the demo, and where it must go

### Frontend‑only (dashboard `index.html`) — PORT THESE, no DB needed
- **Guided session setup** — Courts + Games/Rounds are dropdowns of only valid options, auto‑default
  to best fit (graded + all social formats incl. mixer). Helpers `gameOptions`, `gameOptLabel`,
  `courtOptions` + snapping effects.
- **Top players 👑** — club‑adjustable bar (`clubs.settings.top_players = {mode,value}`, mode
  `rating|percent|count`); helper `topPlayerSet`; crown on leaderboard rows (mobile + desktop) and the
  `PlayerView` hero; admin settings control next to "Milestone ratings". Reads a jsonb setting — **no
  schema change.**
- **Social card fixes** — stale‑schedule/phantom‑player guard, "in the line‑up" labelling, Live→
  Complete/Past badges; builder `planData` drops stale courts; `remove`/`clearAll` clear the schedule.
- **Page headers** (Leaderboard + Social + builder eyebrows).
- **Keep‑pairs discoverability** hints.
- **8‑digit OTP copy** — admin sign‑in text says "8‑digit", submit unlocks at 8 (input already
  `maxLength=8`). *(NB: verify prod's copy; prod may already differ.)*
- **`sbWrite` token handling** — demo now refreshes proactively + retries on 401. **Prod ALREADY
  retries on 401** (verified) but has no proactive refresh → adopt the demo's version (superset).
- **Host‑derived config block** (§3) — replaces hardcoded `SB_URL`/`SB_KEY` + the `'swindon'` fallback.
- **Hide‑booking switch** (§4).

### Member app (`src/` → built into `/app`) — only matters when booking is ON
- One admin surface: in‑app admin removed; header has a web‑only **"Admin ›"** link → `/?admin=1`.
- Venue on session cards, custom top‑up amount, "‹ Club site" back link.
- Since swindon booking is OFF, the `/app` bundle is inert there — port it for future clubs but it
  isn't user‑facing on swindon.

---

## 2. Production source — LOCATED + verified (12 Jul 2026)

Prod dashboard = **`Desktop/PBTable-Production/site/index.html`** (346 KB), inside the `PBTable-Production`
git repo (its **own** repo — do NOT nest it inside the `Documents/PBTable` repo; both already on OneDrive).
`netlify.toml` publishes `site/`. The repo also has `db/`, `supabase/`, `RUNBOOK.md`, `docs/`.

**Verified: the demo is a clean functional SUPERSET of prod.** Demo has **17 feature functions prod
lacks** (comps, `topPlayerSet`, `courtOptions`/`gameOptions`, court seeders `protect/mixed/random/
keepPairs`, `mixerRounds`, `InfoPopover`, the `sbComp*` helpers…); prod has **ZERO functions the demo
lacks**. Prod's 145 "unique" lines are just OLDER versions of code the demo already updated (pre-dropdown
court/games `<input>`s, `DEFAULT_SETTINGS` without `top_players`, old `SessionBuilder`/`buildSchedule`/
`PlayerView` signatures, format list without `mixer`, the simpler `sbWrite`). **No prod-only feature exists.**

⇒ **This is a PROMOTION, not a two‑way merge.** `demo-site/index.html` essentially *becomes* the prod
dashboard. Only **two** things are genuinely per‑deploy and must be preserved (not overwritten by demo):
  1. **Backend config** — `SB_URL`/`SB_KEY`/`SB_SLUG` → replace with the host‑derived block (§3).
  2. **`BASELINE_DATE`** — prod `'2026-06-12'` (swindon's leaderboard anchor); demo is `''`. Keep prod's,
     or lift it into per‑deploy config / a per‑club setting.

Also note: **prod currently has NO booking** ("Book a session" appears 0× in prod, 1× in demo). So
promoting demo → swindon would *add* booking unless gated OFF — exactly what the §4 `booking_enabled`
switch is for.

---

## 3. Host‑derived config block (drop‑in; replaces the hardcoded `SB_URL`/`SB_KEY`/`SB_SLUG`)

```js
var PB_BACKENDS = {
  demo: { url:'https://ezfpoyuebqjebxdcxyzy.supabase.co', key:'sb_publishable_CHXN6W3MdpC7Of4SOBjfBg_5t5QKc7r', fallbackSlug:'demo' },
  prod: { url:'https://kxvtqsmjlhlajkoyejwk.supabase.co', key:'sb_publishable_B7pUA8KnDogi3xI7RX50XA_wL4pal7_', fallbackSlug:null }
};
var PB = (function(){
  var host=(typeof location!=='undefined'?location.hostname:'').toLowerCase();
  var isDemo = host==='demo.pbtable.com' || /\.netlify\.app$/.test(host) || host==='localhost' || host==='127.0.0.1' || host==='';
  var be = isDemo?PB_BACKENDS.demo:PB_BACKENDS.prod;
  var m = host.match(/^([a-z0-9-]+)\.pbtable\.com$/);
  var sub = (m && m[1]!=='www' && m[1]!=='demo') ? m[1] : null;
  return { url:be.url, key:be.key, slug:sub||be.fallbackSlug, isDemo:isDemo, host:host };
})();
var SB_URL=PB.url; var SB_KEY=PB.key; var SB_SLUG=PB.slug;   // slug may be null in prod → boot guard
```
**Companion:** a null‑slug guard where the club first loads (`sbClubMeta`/club‑id) → render a neutral
"which club?" landing instead of querying `slug=eq.null`.

---

## 4. Hide booking for swindon (per‑club, config‑driven)

Add a `booking_enabled` club setting (default **true**). Dashboard hides the **Booking** pill in
`ModeSwitch` + the "Book a session →" CTA when it's `false`. Then set swindon's club row on the prod DB:
`settings.booking_enabled = false`. Demo stays `true`.

---

## 5. DB migrations — DEFERRED (only when a prod club enables booking; NOT for swindon)

The demo project has the full backend: RPCs `book_spot, cancel_booking, session_spots,
session_attendees, session_roster, admin_create_session, admin_cancel_session, admin_remove_booking,
admin_comp_booking, comp_admins`; tables `bookings, credits_ledger, booking_members, club_admins`;
cols `bookings.comp, bookings.comped_by`. When booking is switched on for a real prod club, replicate
these to `kxvtqsmjlhlajkoyejwk` (export the demo migrations). ⚠️ Gated. **Skip for swindon.**

---

## 6. Ordered steps

1. ✅ Freeze demo as reference (done — live + verified).
2. Write this doc (done).
3. ✅ Add `booking_enabled` switch + host‑derived config + null‑slug guard to the demo source (done;
   verified on localhost:4610 — renders, no console errors, resolves to demo backend + slug 'swindon',
   both booking entry points shown since `booking_enabled` defaults true).
4. ✅ Get the prod dashboard source (see §2) — done 12 Jul 2026.
5. ✅ **Diff + stage** — done. **Finding:** prod's *committed* code is a demo subset, BUT prod's
   **working tree** has an uncommitted `M site/index.html` (37+/9-) the doc's superset analysis missed
   — real unshipped prod work: (a) **social‑world green accent** (`--social` tokens + `SOCIAL*` consts
   threaded through `ModeSwitch`, `AdminModal` tabs, `SocialSessionCard`, `SocialBuilder`, App header),
   (b) **OG/Twitter social‑preview meta** + per‑club `document.title = "… · PBTable"`, (c) per‑world
   header label ("Social Play"/"Pickleball League"). So the promotion is a **two‑way merge**, not an
   overwrite. Decision (Paul, 12 Jul): **unify green‑social + OG forward** into the core app (recolors
   demo's social areas green too — mirrors pbtable.com). Also found a 3rd per‑deploy value: **CSP
   `connect-src`** was hardcoded to one Supabase project → the host‑derived single file needs BOTH
   hosts allowed (else CSP‑blocked on the other). **Staged file:** `scratchpad/prod-index.staged.html`
   = demo base + host‑derived config + `BASELINE_DATE='2026-06-12'` + CSP(both hosts) + green‑social +
   OG meta. Verified locally: renders, 0 console errors, club loads, `--social`=#16a34a, Social view
   eyebrow="Social Play" + green header bar, Booking pill present (default on). **Prod repo untouched;
   nothing deployed.** Graded surfaces confirmed still coral (1 SessionBuilder 3px bar unchanged).
6. ✅ Set swindon's prod DB `settings.booking_enabled = false` (done 12 Jul 2026, approved). jsonb
   merge preserved all keys (tier=full, theme=bold-sporty, logo, milestones). Inert until the new
   code deploys (current prod has no booking) → **no window where booking shows**. `top_players` left
   unset → code default (rating 4.7) applies, fits swindon.
7. ✅ **Deployed** to prod (12 Jul 2026, approved). Method: **manual** `netlify deploy --prod
   --dir=<prod-deploy> --site=3a0202b7-d8de-4ab9-8e70-cba09bc28e38` (pbtable-swindon). Deploy dir =
   current prod `site/` assets (pbtable-logo/mark.png, rdr-guide.html, whatson.html) + staged
   index.html + a `_headers` file replicating netlify.toml's security headers (a --dir deploy skips
   netlify.toml). Deploy id `6a53efb5f38acd5bc712e50b`, live in ~12s.
8. ✅ **Verified** `swindon.pbtable.com` (live): backend=prod `kxvtqsmjlhlajkoyejwk`, slug=swindon,
   title="Swindon Pickleball Club · PBTable", **booking pill + CTA HIDDEN**, `--social`=#16a34a,
   Graded header bar coral / Social view eyebrow="Social Play" + green bar, leaderboard renders (top
   rating 4.513), **0 crowns = correct** (no swindon player ≥ 4.7 default), 0 console errors.

⚠️ **DURABILITY FOLLOW-UP (not yet done):** this was a *manual* CLI deploy — it is NOT in git. The
prod repo (`PBTable-Production`) is git-connected to pbtable-swindon with production branch **`main`**,
but is currently checked out on branch **`booking`**, and `main` is OLDER than what's now deployed.
**Risk:** the next git push to `main` triggers a Netlify build that would REVERT this manual deploy.
To make it durable, commit the merged `index.html` (+ config/CSP/BASELINE choices) onto `main` and
push.

**Branch tidy — done 12 Jul 2026.** Deleted `fix-default-session` (==main), `session-builder` &
`social-sessions` (both ⊆ `booking`, lossless), and `onboarding` (unique commit `23009ec` — subdomain
work superseded; reflog-recoverable). **Kept:** `main` (prod branch), `booking` (dev tip holding all
committed prod work: 40 commits ahead of main), `dupr-engine` (deliberate alt-engine experiment). The
stale remote `origin/session-builder` was left in place by choice.

**Durability commit — DONE 12 Jul 2026.** Committed the exact live `site/` (index.html + the 3 assets
main lacked: pbtable-mark.png, rdr-guide.html, whatson.html) onto `main` via a throwaway worktree
(so `booking`'s uncommitted state was never touched), commit `6ee7dc8`, pushed `d5a1580..6ee7dc8`.
Netlify rebuilt `main` (deploy state `ready`) → **git now matches the live production deploy**;
future `main` pushes no longer revert it. Re-verified swindon.pbtable.com from the git build:
title="Swindon Pickleball Club · PBTable", backend=prod, slug=swindon, booking hidden, `--social`=
#16a34a, renders, 0 console errors. `booking` branch retains all prior committed prod history.

## ✅ MIGRATION COMPLETE
swindon.pbtable.com runs the unified core-app dashboard from `PBTable-Production` `main` (Netlify
`pbtable-swindon`, site 3a0202b7-d8de-4ab9-8e70-cba09bc28e38), booking hidden via prod DB
`clubs.settings.booking_enabled=false`. Demo unchanged at demo.pbtable.com (own site + demo backend).
## Un-fork renames (12 Jul 2026)
- ✅ **Netlify prod site** `pbtable-swindon`→`pbtable-app` (custom domain unaffected).
- ✅ **Demo club slug** `swindon`→`demo` (demo project). Cascade handled: dashboard `fallbackSlug='demo'`
  (both files), app rebuilt with `EXPO_PUBLIC_CLUB_SLUG=demo` (needs `--clear`), refreshed the
  `private.rdr_standings` matview (else `rdr_leaderboard('demo')` returns 0). Prod file also fixed to
  `fallbackSlug='demo'` (commit `47ea545`) so it's correct when served via pbtable-app.netlify.app.
  Verified: demo dashboard + app both resolve `demo`, leaderboard 64 rows, 0 errors; swindon unaffected.
- ⏳ **GitHub repo rename** `PBTable-Production`→`pbtable-app`: PENDING — no `gh`/token in the agent env.
  Do it in the GitHub UI, then verify Netlify (pbtable-app) still auto-deploys (its link is by repo NAME,
  repo_id null) and update the local remote.

- ✅ **Demo dashboard synced to prod** (12 Jul 2026): brought prod's green-social accent + OG/social
  meta + generic title into `demo-site/index.html` (rebuilt from the prod file, then re-applied demo's
  keepers). Verified live: green-social on Social view, OG present, booking kept, 0 errors. **Nothing
  lost** — `BASELINE_DATE=''` preserved (demo leaderboard unchanged), neutral `'PBTable'` name defaults
  kept. The two dashboards now differ on ONLY: `BASELINE_DATE` (`''` demo / `'2026-06-12'` prod —
  intentional per-deploy) and 3 cosmetic lines where the demo is actually AHEAD (neutral `'PBTable'`
  name defaults + current comments vs prod's stale `'Swindon Pickleball Club'` + old comments).
  **Prod synced too (commit `c5173f7`, 12 Jul 2026):** prod's stale `'Swindon Pickleball Club'` name
  defaults → `'PBTable'` (×2) + comments refreshed. **The two dashboards are now BYTE-IDENTICAL except
  the single `BASELINE_DATE` line** (`''` demo / `'2026-06-12'` prod). A Test→Prod promotion is now
  literally "copy demo→prod, flip BASELINE_DATE". Verified swindon.pbtable.com post-deploy: real club
  name still loads from DB, booking hidden, backend prod — no behaviour change.

Still deferred: booking DB backend replication to prod (only when a prod club enables booking);
making `BASELINE_DATE` a per-club setting so even that line is shared (full single-source).
9. (Later) Rename repo + Netlify site → `pbtable-app`; rename demo club slug `swindon → demo`; the
   config is already host‑derived → demo & prod are now one codebase.

---

## 7. Verification checklist (swindon, post‑deploy)
- [ ] Leaderboard shows crowns on 4.7+ players; ratings/positions unchanged vs before.
- [ ] Guided court/games dropdowns present in graded + social builders.
- [ ] Social‑card fixes present; no phantom‑player counts.
- [ ] Booking pill + "Book a session →" CTA are HIDDEN.
- [ ] Admin sign‑in works; saving a plan works (token refresh) after a long session.
- [ ] No console errors; page not blanked.
