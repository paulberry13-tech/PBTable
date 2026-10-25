# Handoff → PRODUCTION session: record Terms/DPA acceptance

Everything below touches the **production Supabase** (project `kxvtqsmjlhlajkoyejwk`) and its
Edge Functions. The website session has **not** applied any of it. Apply from the production
session (Desktop\PBTable-Production) in the order shown.

## What the website already does (live now)
- A required tickbox at subscribe checkout (`#order`) and on the free-trial form (`#trial`):
  *"I agree to the Terms of Service and Data Processing Agreement"* — links to `/terms.html` and `/dpa.html`.
- Checkout can't proceed until it's ticked.
- The subscribe flow sends `termsVersion: "1.0"` in the POST to `create-checkout-session`.
- The trial (Netlify) form captures `agreed=yes` and `terms_version=1.0` in the submission.

## Apply in THIS ORDER (order matters)

### 1. Migration — add the columns FIRST
File: `legal/MIGRATION-terms-acceptance.sql`
```sql
alter table public.subscriptions
  add column if not exists terms_version     text,
  add column if not exists terms_accepted_at timestamptz;
```
The webhook (step 3) writes these columns — if they don't exist yet, the checkout upsert will
error. So columns must exist before the new webhook goes live.

### 2. Deploy `create-checkout-session` (Verify JWT OFF)
Change already staged in `supabase/functions/create-checkout-session/index.ts`:
- Reads `termsVersion` from the request body.
- Adds `terms_version` to both `subscription_data.metadata` and the session `metadata`.
Safe to deploy any time (it only adds metadata).

### 3. Deploy `stripe-webhook` (Verify JWT OFF) — AFTER step 1
Change already staged in `supabase/functions/stripe-webhook/index.ts`:
- `checkout.session.completed` and the trialing `customer.subscription.created` upserts now also
  write `terms_version` (from Stripe metadata) and `terms_accepted_at` (now, when a version is present).
- Keyed on `stripe_subscription_id` as before — no duplicate rows.

## Retrospective clubs (Task 4): Swindon & Melksham
Once they've click-/reply-accepted (see the email plan in the website session's report), backfill:
```sql
update public.subscriptions set terms_version = '1.0', terms_accepted_at = timestamptz '<date they accepted>'
  where club_id = '<swindon club_id>';
update public.subscriptions set terms_version = '1.0', terms_accepted_at = timestamptz '<date they accepted>'
  where club_id = '<melksham club_id>';
```

## Interim gap to be aware of
Between the website going live (now) and steps 2–3 being deployed, the tickbox is **enforced**
(nobody can subscribe without accepting) but the version isn't yet **recorded** in the DB. Any
club that subscribes in that window has still legally accepted; just backfill their row with
`terms_version='1.0'` and their signup date. Deploying steps 2–3 promptly keeps this window small.
