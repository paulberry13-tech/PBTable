# Decision 01 — how the native app picks its club

Taken 2026-08-31, the first decision of the native build. Supersedes nothing; this is
the answer to the "real blocker" named in `NATIVE-APP-HANDOVER.md`.

**Decision: the shipped app is production-only, the club is chosen by a picker on
first launch and stored locally, and once someone signs in their own membership is
authoritative over whatever was picked.**

---

## The problem

On web, `src/services/backend.ts` reads `window.location.hostname` and derives two
things from it: which Supabase project to talk to, and which club slug to use. That is
what lets ONE committed bundle serve `demo.pbtable.com` and every `<slug>.pbtable.com`.

A native app has no hostname. The existing fallback reads `EXPO_PUBLIC_*`, which bakes
the club in at build time — a separate binary and a separate App Store listing per
club. That contradicts the platform rule the whole product rests on: *a club is data
plus a subdomain, never a fork.*

## What the code actually showed

The handover expected this to be expensive — "it changes `backend.ts` from a constant
into state, which touches every data call". It does not, for two reasons found by
reading the data layer.

**1. "Which club" is really two questions, welded together by the hostname.**

- *Which Supabase project* — demo (`ezfpoyuebqjebxdcxyzy`) or production
  (`kxvtqsmjlhlajkoyejwk`). Separate projects, separate anon keys, separate auth stores.
- *Which club within the project* — the slug.

Every real club lives in the one production project. So on native, question 1 has a
fixed answer per build and only question 2 varies at runtime. Because the project is
constant, `supabase` can stay a module-level client: **no dynamic client, no
re-created auth storage, no rewrite of the data layer.**

**2. For a signed-in member, the club is already resolved from the database, not the
hostname.** `myClubId()` (`src/services/data.supabase.ts:212`) reads
`booking_members.auth_user_id → club_id`, and sessions, bookings, roster, wallet and
players all scope by that. The hostname slug is read in only seven places, every one
of them either signed-out or club-metadata:

| Read | Where | For |
| --- | --- | --- |
| `myClubId()` signed-out fallback | `data.supabase.ts:224` | the public session list before sign-in |
| `bookingEnabledForThisHost()` | `clubGate.ts:27` | the "booking isn't open yet" gate |
| `getClubBranding()` | `data.supabase.ts:649` | header club name + logo |
| `clubTakesPayments()` | `data.supabase.ts:668` | the `club_payments_enabled` RPC |
| `connect-topup` body | `data.supabase.ts:698` | which club's Stripe account is charged |
| `clubSignupInfo()` | `SignIn.tsx:94` | "is this club taking sign-ups?" |
| `joinClub()` | `SignIn.tsx:136` | which club a newcomer joins |

Seven call sites, not every data call.

## The decision, in parts

### 1. The project is a build constant; the club is state

`backend.ts` splits. `url` + `anonKey` are chosen by the build (PROD for anything
shipped to a store). The club becomes runtime state in a small `clubStore`.

### 2. The club is stored in AsyncStorage, not SecureStore

A slug is not a credential. `expo-secure-store` is also **not supported on web**
(SDK 57 docs, checked), so using it would mean a second code path for the web build
that shares this source tree. AsyncStorage is already a dependency (`2.2.0`) and is
already what persists the auth session on native (`supabaseClient.ts:25`).

### 3. First launch shows a club picker, listed from the database

`clubs` is readable by `anon` — `clubs_public_read ... using (true)`
(`03_rls_policies.sql:35`). Migration 47 replaced the table-level SELECT grant with a
column list to hide the commercial columns, but `name`, `slug` and `settings` are all
still in it. So:

- **No migration and no new RPC.** The picker is a plain anon `select`.
- It filters on `settings.booking_enabled === true` — strictly, the same comparison
  `clubGate` makes — so it can never offer a club that would immediately dead-end on
  the existing `BookingNotOpen` screen.

**Checked against the live production database on 2026-08-31**, with the shipped anon
key. Three clubs exist, and only one has booking switched on:

| slug | name | `booking_enabled` |
| --- | --- | --- |
| `glos` | Pickleball Gloucestershire Club | **true** |
| `swindon` | Swindon Pickleball Club | false |
| `melkshamds` | Melksham Drop Squad | false |

So the picker today lists **Gloucestershire only**. `booking_enabled` is a real JSON
boolean, not the string `"true"`, so the strict comparison is correct. No club has
`settings.logo_url` set, so every row uses the initial-letter fallback for now.

⚠️ **Swindon is the beta cohort named in the handover** ("start a closed test with a
dozen Swindon members"). They cannot use the app at all until `booking_enabled` is
flipped for them — one settings change, no release. Nothing in this decision is
blocked by it, but the closed test is.

A list was chosen over typing a club code. It is friendlier, and it costs nothing that
is not already public — every club already has a public dashboard at
`<slug>.pbtable.com`. If that ever becomes unwanted (a club that wants to be
unlisted), the same screen can grow a "have a club code?" entry without changing
anything below it.

### 4. After sign-in, the member's own club wins

This is a rule, not a nicety. `getCurrentUser()` and `hasMemberRecord()`
(`auth.supabase.ts:74,101`) look up `booking_members` by `auth_user_id` **alone** —
there is no club in the query. So picking Swindon and then signing in with a
Gloucester membership currently yields Gloucester's data underneath Swindon's
branding.

The picked club is therefore a **pre-authentication default only**. On a mismatch the
stored club is silently switched to the member's real one and the branding re-read.

### 5. Web is untouched

Everything above is behind `Platform.OS === 'web'`. The web build keeps resolving from
the hostname exactly as it does now, so the bundle committed to every club site
behaves identically and `tools/stage-booking-app.sh` needs no change.

## Rejected

- **A build per club via `EXPO_PUBLIC_CLUB_SLUG`.** A separate App Store listing, review
  cycle and £79/yr per club, and it forks the product per customer.
- **Demo in the picker.** Demo is a *different Supabase project*, so it would need a
  second client, and `DEMO_EMAIL` / `DEMO_PASSWORD` would have to ship inside a public
  binary. Demo stays web-only.
- **Deriving the club purely from sign-in, with no picker.** The session list is public
  before sign-in by design; with no picked club there is nothing to show a visitor.

## A latent bug this uncovered

The old `backend.ts:45-51`: with no `window`, `resolve()` fell back to env, and env
defaulted to **DEMO with `isDemo: true`**. `DEMO_AUTOLOGIN`, `DEMO_TOPUP` and the demo
person-switcher are all gated on `isDemo` — which the handover correctly calls the
hard guarantee on web, and which silently inverted on native.

Nothing was live: there is no `.env` in this folder at all, so `USE_SUPABASE` was
false and a native run got the in-memory mock. But the trap was armed for exactly the
case the handover warns about — a native build made from the demo `.env` would have
carried demo behaviour with nothing left to stop it. Defaulting the native project to
PRODUCTION is what closes it.

## A related change: what USE_SUPABASE means on native

`USE_SUPABASE` was opt-in (`=== 'true'`), which on native meant no env → the mock →
no club, no picker, no sign-in. That is not a shippable default for a phone app, and
it would have made the picker dead code on device.

On **native** the flag is now opt-OUT: real backend unless `EXPO_PUBLIC_USE_SUPABASE=false`.
On **web** it is unchanged, so the demo export and local UI work are untouched.

## Consequences to carry forward

- **Multi-club membership.** `getCurrentUser()` uses `.single()`, so one person
  belonging to two clubs is an error today. Nothing here fixes that, but the club store
  is deliberately shaped as "the current club" rather than "the club", so the picker is
  where a club switcher would later live.
- **Stripe (decision 3) is safe from a stale pick.** `connect-topup` treats the slug as
  a *selector among the caller's own memberships* server-side
  (`supabase/functions/connect-topup/index.ts:60-76`), so a wrong slug fails rather
  than paying another club. The client should still send the member's real club.
- **Deep links.** `pbtablebookings://` and later universal links from
  `<slug>.pbtable.com` can pre-select a club straight into this store. No conflict.

## What was built

| File | Change |
| --- | --- |
| `src/services/backend.ts` | `BACKEND` → `PROJECT` (fixed) + `getClubSlug()`/`setClubSlug()` (state) |
| `src/services/clubStore.ts` | **new** — persistence, the club list, and the sign-in reconciliation |
| `src/components/ClubPicker.tsx` | **new** — the first-launch screen |
| `src/app/_layout.tsx` | boot order: fonts → club → gate → app; splash held until one of them can render |
| `src/components/BookingNotOpen.tsx` | native-only "Choose a different club", so the dead end isn't permanent |
| `src/store/AppContext.tsx` | all four sign-in paths route through `loadSignedInMember()` |
| `src/components/Header.tsx` | re-reads branding on `dataVersion`, so an adopted club re-brands |
| `clubGate.ts`, `config.ts`, `supabaseClient.ts`, `data.supabase.ts`, `SignIn.tsx` | slug and `isDemo` call sites |

`bookingEnabledForThisHost` is renamed `bookingEnabledForThisClub` — there is no host
on native, and the old name would have been a lie in the one place it matters most.

Verified: `npx tsc --noEmit` clean, and `npx expo export -p web --clear` produces all
nine static routes, so the prerender path survives the change.

## Verified on device — Android emulator, 2026-08-31

The first time this codebase has ever run natively. Confirmed by screenshot:

1. Cold start shows **CHOOSE YOUR CLUB**, listing *Pickleball Gloucestershire Club*
   and nothing else — correct, as it is the only club with booking enabled.
2. Tapping it boots the app: the club's name in the header, and the Sessions /
   My Bookings / Wallet tabs.
3. The session list reads live production data. It shows "No sessions match", which is
   **the truth** — `social_sessions` and `session_plans` both return zero upcoming rows
   for glos, verified directly against the database.

4. **The picked club survives a full device restart.** The emulator was shut down and
   rebooted; the app went straight to Gloucestershire's sessions with no picker. The
   AsyncStorage round-trip works.

Not yet exercised: sign-in, and the membership reconciliation that depends on it —
both need a real member's emailed code.

### The bug the device run caught

The picker's first run listed **"Pickleball Allstars Demo"** — a club that exists only
in the DEMO project. The native app had resolved to the demo backend.

Cause: `hostname()` tested for the *presence* of `window.location`. **React Native
defines both `window` and `window.location` under a Metro dev server**, and
`window.location.hostname` is then the dev server's host — `127.0.0.1`. That matches
the `isLocal` rule, which means demo.

Fixed by asking `Platform.OS`, not the global. A hostname is only ever meaningful on
web.

This is worth remembering beyond this one line: **`typeof window !== 'undefined'` is
not a web check in React Native.** Any other code that guards on the existence of a
browser global is suspect for the same reason.

## Minor, not fixed

The empty session list says "No sessions match — try clearing the filters above" even
when the "All" filter is selected and nothing is filtered. Cosmetic; noted rather than
changed, because it predates this work.
