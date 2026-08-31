# Going native — handover

Written 2026-08-31, at the end of the session that fixed the graded leaderboard. It
exists so the next session does not have to rediscover any of this.

**Read `CLAUDE.md` and `AGENTS.md` in this folder first.** This document only covers
what going native changes, and the things that are true but not yet written down.

---

## The decision already taken

Paul's call, 2026-08-31, after costing both paths:

- **Members get a native iOS/Android app.** That is this codebase, built natively.
- **Admins stay on the web dashboard.** Planning sessions, printing court slips and
  configuring a club is laptop work; a phone makes it worse, not better.
- **One exception: courtside score entry.** An admin should be able to enter results
  on a phone at the venue, in this app, behind an admin check. Spec below.

**Do not port the dashboard.** It is 9,100 lines of React DOM with 1,562 Tailwind
class names, 7 HTML tables, 80 inputs, 35 inline SVGs, `window.print` for the court
slips, canvas `toDataURL` for the session image and `URL.createObjectURL` for CSV.
None of that crosses to React Native. Rebuilding it was costed at 2–4 months against
2–4 weeks for the member app, for a screen nobody wants to use on a phone.

## What actually exists

- **This app**: Expo Router, 39 files, ~3,155 lines of TypeScript React Native. It has
  only ever been exported to **web** (`npx expo export -p web`) and committed into the
  dashboard repo as a static bundle.
- **No `eas.json`, no `ios/`, no `android/`.** It has never been built natively.
- `app.json` has `name`/`slug` `pbtable-bookings`, scheme `pbtablebookings`, an iOS
  icon, an Android adaptive icon, and the `expo-router` + `expo-splash-screen`
  plugins. That is the whole native config.

## Four things to solve before writing any feature code

### 1. Which club is this app? — the real blocker

On web, `src/services/backend.ts` resolves the Supabase project **and the club slug
from `window.location.hostname`**. That is what lets one committed bundle serve every
club subdomain.

A native app has no hostname. The file already has a fallback for that case, and it
reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_CLUB_SLUG` — which would mean **a
separate app build, and a separate App Store listing, per club.** That defeats the
whole multi-tenant model ("a club is data plus a subdomain, never a fork").

Decide this first. The sensible answer is a **club picker on first launch**, stored
locally, with the backend chosen from the picked club rather than from the build. It
changes `backend.ts` from a constant into state, which touches every data call, so it
is much cheaper to do before anything else than after.

### 2. Eleven `window.` / `location.` references break on native

```
app/(tabs)/wallet.tsx   5   Stripe return: URLSearchParams, localStorage, history.replaceState
components/Header.tsx   2   window.location.assign('/?admin=1') and '/'
services/backend.ts     1   the hostname read above
```

`Header.tsx` is easy — those two are the "Admin ›" and "‹ Club site" links; either
drop them or use `Linking.openURL`.

`wallet.tsx` is not. It is the whole Stripe-return flow and it is web-shaped: read
`session_id` from the query string, stash it in `localStorage`, strip it from the URL.
See below.

### 3. Stripe

Today: `connect-topup` returns a Checkout URL, the browser navigates to Stripe, and
`success_url` comes back carrying `session_id`, which `connect-topup-confirm` redeems.

On native there is no page to come back to. Either use the **Stripe React Native SDK**
(payment sheet in-app, the better experience and probably the right answer) or keep
Checkout in a browser and handle the return with a **deep link** on the
`pbtablebookings://` scheme.

Whichever you pick, keep the two properties that were hard-won: credit on the amount
Stripe reports and never on metadata, and stay idempotent per checkout session — both
`connect-topup-webhook` and the confirm path key on
`credits_ledger.stripe_checkout_session_id`, so whichever lands first wins.

**Gloucester is taking real card payments through the current flow.** Do not change
the edge functions to suit native without checking the web path still works.

### 4. Auth

Members sign in with an emailed code — no passwords, no magic link (deliberately: no
clickable link for mail scanners to consume). That model is native-friendly; the code
is typed in. What needs attention is **where the session is stored**: supabase-js
defaults to `localStorage`, which does not exist on native. Configure it with
AsyncStorage or, better, `expo-secure-store`.

## Courtside score entry — the one admin feature

Paul asked for this specifically. It is small, because the backend already allows it.

**No migration and no new RPC needed.** From `03_rls_policies.sql`:

```sql
grant insert, update, delete on public.matches to authenticated;
create policy matches_admin_insert on public.matches
  for insert to authenticated with check (private.is_club_admin(club_id));
```

So a signed-in club admin can insert matches directly. Everyone can read them.

`public.matches` is `club_id, played_on, seq, p1..p4, s1, s2` with
`unique (club_id, played_on, seq)` — **no session id**. A match belongs to a *date*.

**Copy the sequencing from the dashboard's `atPostBatch`** (in
`PBTable-Production/site/index.html`): read the current max `seq` for that club and
date, then insert continuing from it. Results **append** — that is what lets a club
run two sessions on one day and have both count.

Gate the screen on `private.is_club_admin`; the cheapest honest check is to attempt
something admin-only and hide the screen when it is refused. Do not gate on "has a
login" — every member has one.

Ratings recompute in the browser from the full match history, so entering scores here
updates the leaderboard on the club's website with no extra work.

## Testing — what hardware is actually needed

Paul develops on **Windows**, and has an **iPhone** and a **Mac**. That combination
covers everything; the Mac is a convenience, not a dependency.

- **Day to day: iPhone + Expo Go, dev server on Windows.** Same wifi, live reload, no
  Mac involved. This covers layout, navigation, data and auth — most of the work.
- **Android: the emulator on Windows** is fine. A physical Android device is optional.
- **The Mac is only for the iOS Simulator**, which cannot run on Windows. It needs
  Xcode. Either drag in a simulator build from EAS (no code on the Mac, but re-download
  after every change) or run the dev server there too.
- **Claude is not needed on the Mac.** Testing runs the app; it does not write it.
- **EAS builds iOS in the cloud**, so no Mac is needed to *build* — only to run a
  simulator.

Expo Go stops being enough the moment the **Stripe React Native SDK** goes in, because
it cannot load custom native modules. From that point it is development builds via EAS,
installed on the iPhone through TestFlight.

⚠️ **This project lives in OneDrive.** If the repo syncs to the Mac, exclude
`node_modules` — tens of thousands of platform-specific files that will not match
anyway. Run `npm install` on each machine separately.

Real hardware is non-negotiable for the parts that matter most: **Apple Pay and Google
Pay do not exist in a simulator, and iOS push notifications do not work in one.**

## Store approval, and who takes a cut

### Apple's 30% almost certainly does not apply

In-App Purchase, and Apple's 15–30%, covers **digital** goods consumed in the app.
Physical goods and **real-world services are carved out** — which is how Eventbrite,
ClassPass and gym apps charge by card with Apple taking nothing. Booking court time is
a real-world service. Google Play has the same carve-out.

**The wallet is the grey area.** Stored value could be read as selling "credits". The
accepted defence is that the balance is only ever redeemable for real-world sessions
(the Starbucks model). Two things keep it clearly on the right side:

- Never call it credits, coins or tokens in the UI. It is a **club balance** that pays
  for sessions.
- Ideally also support paying for a single session outright, so the wallet is a
  convenience rather than the only way in.

Treat this as *likely fine, worth re-checking against current guidelines before
submitting* — not as settled.

### Apple — £79/yr

- App Store Connect record, bundle ID, screenshots at required sizes, age rating
- **Privacy policy URL** — mandatory
- **App Privacy questionnaire** — email, name, and payment handled by Stripe
- ⚠️ **In-app account deletion is mandatory for any app that lets users create an
  account.** This app does, via self-signup (`join_club`, migration 30), and as of
  2026-08-31 there is **no deletion path anywhere in `src`** — verified, zero hits.
  **This is a build item, not paperwork.** It also needs thought: deleting an auth user
  must not orphan bookings or corrupt ratings. `booking_members.player_id` is
  ON DELETE SET NULL, and `is_club_member` deliberately reads an unlinked member as a
  member, so a careless delete changes what someone is charged.
- *Sign in with Apple* is only required where third-party login is offered. Email codes
  only, so exempt.

### Google Play — $25 one-off

- Data safety form, content rating questionnaire, privacy policy, target API level
- ⚠️ **A new *personal* developer account must run a closed test with 12 testers for
  14 continuous days before it can publish publicly.** An **Organisation** account is
  understood to avoid this, and requires a **D-U-N-S number** from Dun & Bradstreet.

  **Paul trades as a sole trader.** D&B does issue D-U-N-S numbers to sole traders, so
  an Organisation account looks available — but whether Google then treats a sole
  trader as exempt from the testing requirement is **NOT VERIFIED**. Check the
  account-type step in the Play Console signup, which states the requirements
  authoritatively. Do not plan around my recollection of it.

  Apply for the D-U-N-S number early regardless: the free route takes roughly 30 days.

  **And do not treat the testing rule as a blocker.** Twelve testers for fourteen days
  is a beta programme worth running anyway, and Paul has three clubs of members — one
  of which is asking for the app. Start a closed test with a dozen Swindon members
  while the Stripe and account-deletion work is in progress and the fortnight passes
  in parallel, for free, with real bookings and real payments before it goes public.

Budget: account approval in days, first Apple review a few days to a week, and assume
one rejection. The rejections are usually mundane — a missing privacy field, a
wrong-sized screenshot.

## The build pipeline changes

Today `tools/stage-booking-app.sh` in `PBTable-Production` builds the **web** export,
renames `assets/node_modules` to `assets/vendor` and commits it into `site/app`. That
pipeline stays — the web app is not going away.

Native builds are a **second, parallel** pipeline (EAS), not a replacement. Keep them
separate, and keep the web staging script working.

## Traps that carry over

- **`npx expo export` inlines `EXPO_PUBLIC_*` at build time and caches it.** Always
  export with `--clear`. This has already cost one broken deploy — the app shipped
  with the old env baked in.
- **Two variants build from this one tree**: the demo build (auto-login, Stripe test)
  and the production build (demo credentials blanked, and the prod stager greps the
  output to *prove* they are absent). Native adds a third. Do not let credentials
  cross.
- **The Netlify CLI silently drops any directory named `node_modules`** from
  `--dir` deploys, which is why fonts are renamed to `assets/vendor`. Web only, but
  it is why that rename exists — do not "tidy" it away.
- **PostgREST needs table-level SELECT to honour `Prefer: return=representation`.**
  Several tables now have column-list grants instead, so a write that suddenly 401s
  with `42501` usually just needs `return=minimal`. Bit us again on 2026-08-29.
- **An empty-body RPC probe returns `PGRST202` whether or not the function exists.**
  Always probe with the real argument names, and calibrate against a function you know
  is missing.
- **`players` is column-list granted.** `seed_ord` and `email` are not readable even
  by a signed-in club admin. If the app needs a player field, check the grant first.

## What not to do

- Do not add a rating calculation to this app. Ratings are computed in one place, by
  the browser, from the full match history. A second implementation would drift — the
  database already has one and it disagrees with the public figures by up to 0.015.
- Do not build admin session planning, club settings, players or reports here.
- Do not deploy `wallet-topup` to production. It is demo-only.
- Do not push to `main` without Paul saying so in that moment. A push is instantly
  live on every club site.

## Starting the session

```bash
cd "C:\Users\PaulBerry\OneDrive - Berry Business Informatics\Documents\PBTable\PBTable Bookings"
claude --add-dir "..\..\..\Desktop\PBTable-Production"
```

The second directory gives it the migrations, the RLS policies and the dashboard it is
mirroring. Read this file, then `CLAUDE.md`, then `src/services/backend.ts` — that last
one is where the first decision lives.
