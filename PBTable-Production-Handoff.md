# PBTable — Production Handoff & Onboarding-Automation Brief

> **Purpose:** Bring the PBTable Production (app/database) session fully up to date on the marketing + billing system that now feeds it, then specify the next build: **automating club onboarding** so a paid signup provisions itself with zero manual steps. No secret keys are included here — those live only in Supabase secrets.

---

## 1. Current state (as of 2026-06-23)

PBTable is **live and taking subscriptions**.

- **Marketing site** `pbtable.com` (Netlify, single static file) has an embedded Stripe Checkout. A club picks a plan, pays, and a subscription is created — **live mode**, real money.
- **Billing backend** runs as two Supabase Edge Functions in the existing **PBTable Production** project. A Stripe webhook records every subscriber in a new `subscriptions` table.
- **First club:** Swindon Pickleball Club (the existing pilot, slug `swindon`, ~85 players) was comped free via a 100%-off-forever coupon and **manually linked** (`subscriptions.club_id`) to its real `clubs` row.
- **Onboarding is currently MANUAL** — see §5. **The next step (this brief) is to automate it.**

---

## 2. System map

```
pbtable.com (Netlify, static)
   └─ embedded Stripe Checkout (pk_live)
        │  POST /functions/v1/create-checkout-session   (creates the Checkout Session)
        ▼
   Stripe (LIVE, account under "Nexlane", branded "PBTable")
        │  fires events
        ▼
   POST /functions/v1/stripe-webhook   (Supabase Edge Function)
        └─ writes/updates the `subscriptions` table in PBTable Production

PBTable Production (Supabase project: kxvtqsmjlhlajkoyejwk, region eu-west-1/Ireland)
   ├─ existing app tables: clubs, club_admins, players, matches, activity
   └─ new billing table:   subscriptions   (links to clubs via club_id)

demo.pbtable.com  = a SEPARATE Netlify site (read-only demo); not part of billing.
```

---

## 3. The Production database

Existing app tables (the live leaderboard engine), unchanged:

- `clubs` — `id uuid PK`, `name text`, `slug text`, `created_at timestamptz`, `baseline_date date`
- `club_admins` — `club_id uuid`, `user_id uuid` (Supabase auth user), `created_at`
- `players`, `matches`, `activity` — the rating/leaderboard data

**New, additive billing table** (created by `supabase-schema.sql`; touches nothing above):

```
subscriptions
  id                     uuid PK
  club_id                uuid  → clubs(id)  (NULLABLE — set during onboarding)
  contact_name           text
  contact_email          text NOT NULL
  club_name              text          -- the name typed on the order form
  stripe_customer_id     text
  stripe_subscription_id text UNIQUE
  status                 text          -- active | past_due | canceled | ...
  plan                   text          -- 'founder' | 'club'
  billing                text          -- 'monthly' | 'annual'
  price_id               text
  current_period_end     timestamptz
  created_at, updated_at timestamptz
```

RLS is **enabled with no policies** → only the service role (the Edge Functions) can read/write it. The public site has no direct access.

---

## 4. How billing works now

**Stripe (LIVE):** account trades as **Nexlane** but is branded **PBTable** (public name, statement descriptor, logo). Four live products/prices:

| Plan | Price | Live Price ID |
|------|-------|---------------|
| Founder monthly | £19 | `price_1TlW2x1uDFkhZnpp0khvPajy` |
| Founder annual | £190 | `price_1TlW2s1uDFkhZnppmc05X2hW` |
| Standard (=Club) monthly | £29 | `price_1TlW2v1uDFkhZnppHJvcXiSi` |
| Standard (=Club) annual | £290 | `price_1TlW2o1uDFkhZnpp2kWsWrsD` |

No free trials → the **first period is charged immediately at checkout**. `payment_method_collection: "if_required"` means a £0 (fully-comped) checkout skips the card; any real charge still collects + charges the card.

**Edge Functions** (both deployed with **"Verify JWT" OFF**; base URL `https://kxvtqsmjlhlajkoyejwk.supabase.co/functions/v1/`):

- `create-checkout-session` — uses the `withSupabase({ auth: "none" })` wrapper. Validates the price against an allowlist, creates an embedded Checkout Session (`mode: subscription`, `allow_promotion_codes: true`), returns the client secret. Puts `club`, `contact_name`, `contact_email`, `plan`, `billing`, `price_id` into both session metadata and `subscription_data.metadata`.
- `stripe-webhook` — plain `Deno.serve` (needs the raw body). Verifies the Stripe signature, then:
  - `checkout.session.completed` → **upsert** a `subscriptions` row (status `active`) from the session metadata.
  - `customer.subscription.updated` / `.deleted` → update `status` + `current_period_end`.

**Secrets in Supabase** (Edge Functions → Secrets): `STRIPE_SECRET_KEY` (sk_live), `STRIPE_WEBHOOK_SECRET` (live whsec). `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are auto-provided.

---

## 5. Current onboarding = MANUAL

When a club subscribes today, the webhook records a `subscriptions` row with the **typed** `club_name` but `club_id = NULL`. A human then:

1. Finds/creates the club in `clubs`.
2. Sets `subscriptions.club_id` to that club's id.
3. Sets up the admin login and (eventually) the subdomain.

This is deliberate — auto-matching a free-typed name to a club is fragile. **Automating this is the next step.**

---

## 6. NEXT STEP — automate onboarding

**Goal:** a paid signup on `pbtable.com` provisions the club end-to-end with no human in the loop.

**"Provisioned" =**
1. A `clubs` row exists (name + unique slug).
2. `subscriptions.club_id` is linked to it.
3. An **admin** Supabase Auth user exists, linked via `club_admins`.
4. The admin gets a **login invite** (magic link / set password).
5. The club's board is reachable at `<slug>.pbtable.com` (needs wildcard DNS — see §8).

**Where it lives:** extend the `stripe-webhook` `checkout.session.completed` handler to run a provisioning routine (or have it invoke a dedicated `provision-club` function). Keeping it in the webhook is simplest and fires exactly when payment completes.

**Design decisions / hard parts to resolve:**

- **New vs existing club.** Most signups are brand-new → create. A few pre-exist (e.g. Swindon) → link, don't duplicate. Recommendation for v1: **assume new and create**, guard against duplicate slugs; handle the rare "known club subscribes" case via a manual flag or an optional code on the order form.
- **Slug generation.** Slugify `club_name` (e.g. "Bristol Pickleball Club" → `bristol-pickleball-club`), then ensure uniqueness against `clubs.slug` (append `-2`, `-3` on collision). Decide a house convention (Swindon used the short `swindon`).
- **Idempotency.** The webhook retries — provisioning must be safe to run twice. Guard: if the `subscriptions` row for this `stripe_subscription_id` already has `club_id`, skip. Lean on unique constraints (`clubs.slug`, `subscriptions.stripe_subscription_id`).
- **Admin user + invite.** Use the Supabase Auth **Admin API** (service role): `inviteUserByEmail` (or `createUser` + generate a magic link), then insert `club_admins(club_id, user_id)`. Handle the case where the email already has a user.
- **Email deliverability.** Supabase's built-in auth email is rate-limited and not production-grade — configure **custom SMTP** for reliable invite/welcome emails. (Also set up SPF/DKIM/DMARC on pbtable.com before any bulk email.)
- **Access gating.** The app should treat `subscriptions.status` as the on/off switch — `active` → full access; `past_due` → grace/reminder; `canceled` → pause the club's board. The webhook already keeps `status` current; the app needs to read it.
- **Partial-failure handling.** If club created but admin invite fails, don't leave a half-state — make each step idempotent and log clearly so a retry completes it.

**Suggested build order:**
1. `slugify()` + unique-slug helper.
2. In the webhook (after the subscription upsert): if new signup → create `clubs` row → set `subscriptions.club_id` → create/invite admin → link `club_admins`.
3. Make every step idempotent (guard on existing club_id / slug / user).
4. Configure Supabase Auth custom SMTP; finalise invite/welcome email.
5. App: gate access on `subscriptions.status`.
6. Infra: wildcard DNS + app subdomain routing so `<slug>.pbtable.com` resolves (see §8).

---

## 7. Edge Function gotchas (hard-won — read before editing functions)

- Deploy functions via the Supabase dashboard editor; **set the name correctly at creation** (renaming does NOT change the URL slug). Toggle **"Verify JWT" OFF** for public endpoints.
- For the **webhook**, use plain `Deno.serve` — the `withSupabase` wrapper swallowed Stripe's raw request body ("No webhook payload"). The webhook also writes to the DB via the **PostgREST REST API + service-role key** (no `@supabase/supabase-js` import).
- Stripe signature verification on Deno **requires** `Stripe.createSubtleCryptoProvider()` passed as the 5th arg to `constructEventAsync`, plus `httpClient: Stripe.createFetchHttpClient()` on the Stripe client — otherwise the worker crashes.
- **Secrets are project-wide** and can get knocked out when editing them — if a function returns `WORKER_ERROR`, check `STRIPE_SECRET_KEY` etc. still exist. Redeploy a function after changing a secret so it boots with the new value.

---

## 8. Reference (non-secret)

- **Supabase project:** `PBTable Production`, ref `kxvtqsmjlhlajkoyejwk`, URL `https://kxvtqsmjlhlajkoyejwk.supabase.co`, region `eu-west-1` (Ireland — fine for UK GDPR).
- **Function URLs:** `…/functions/v1/create-checkout-session`, `…/functions/v1/stripe-webhook`.
- **Marketing site:** Netlify project `vocal-madeleine` → `pbtable.com` (+ `www`, `.co.uk` redirect). Live publishable key `pk_live_51TlPPQ…` is embedded in the page. Deploy folder: `pbtable-site/` (`index.html` + `pbtable-logo.png` + `_redirects`).
- **Local source files** (in the PBTable folder): `pbtable-website.html` (master), `supabase-schema.sql`, `supabase/functions/create-checkout-session/index.ts`, `supabase/functions/stripe-webhook/index.ts`.
- **Subdomain plan (not built yet):** one wildcard `*.pbtable.com` → the app, then the app reads the subdomain → finds the club by `slug`. No DNS record per club; "creating a club's address" = saving its `slug`. For automatic wildcard SSL you'll likely delegate `pbtable.com` DNS to the host (re-create the IONOS MX email records there first).

---

## 9. Adjacent future work (not the focus, but on the radar)

- **GDPR controls in the app:** per-club visibility (public / unlisted+noindex / login-only); a "junior" flag that hides under-13s from public boards by default; one-click remove/anonymise a player. (Clubs are data controllers; PBTable is processor — a DPA + privacy notice should be in place.)
- **Stripe Customer Portal** button so admins self-serve card changes / cancellations.
- **Tidy-ups:** product display names on receipts ("PBTable Founder — Annual"); delete the old restricted "Standard Monthly" coupon.
