# Handoff: deploy the checkout function with the twoclear prices

From the session doing the twoclear marketing site (29 Sep 2026). Please deploy **one function only**.

## What

`supabase/functions/create-checkout-session/index.ts` (main PBTable repo, working copy):
the `ALLOWED` list gains the 6 new twoclear Stripe prices created today. The 6 old PBTable prices
**stay** until twoclear.co.uk is live, because the current pbtable.com site still sends them.

| Price ID | Plan | Billing | Amount |
|---|---|---|---|
| `price_1UL2ru1uDFkhZnppv4rnx9a7` | social | monthly | £12 |
| `price_1UL2tY1uDFkhZnpphNnMA06u` | social | annual | £120 |
| `price_1UL2uV1uDFkhZnppMXyCE4xy` | club | monthly | £29 |
| `price_1UL2vI1uDFkhZnppC71P0DcV` | club | annual | £290 |
| `price_1UL2wA1uDFkhZnppRCjgogHj` | membership | monthly | £39 |
| `price_1UL2wu1uDFkhZnppqGT9e0lc` | membership | annual | £390 |

Founding clubs pay £19/£190 on Club through Stripe promotion codes `FOUNDING` / `FOUNDINGANNUAL`
(already created; `allow_promotion_codes: true` is already in the function), not separate prices.
`membership` is a new plan value; `subscriptions.plan` is free text, so no schema change.

The working copy **also** carries an earlier, already-staged change: it forwards the Terms version
the club ticked (`termsVersion` → Stripe metadata `terms_version`). That writes nothing to the
database, so it is safe to ship with this.

## Deploy

- Production project `kxvtqsmjlhlajkoyejwk` — run `get_project_url` first.
- Function `create-checkout-session`, **Verify JWT OFF** (public endpoint, protected by the price allow-list).
- **Do NOT deploy `stripe-webhook`.** Its working copy holds the free-trial handlers and Terms-acceptance
  writes, which need the terms migration applied first (`legal/HANDOFF-terms-acceptance-PRODUCTION.md`).

## Verify after deploying

POST to `/functions/v1/create-checkout-session` with `{ priceId, name, email, club, termsVersion: "1.0" }`:
- each of the 6 new price IDs returns a `clientSecret`;
- an old PBTable price (e.g. `price_1TqJdk1uDFkhZnppXUjtuFW2`) still returns a `clientSecret`;
- a made-up ID returns "Invalid plan selected".

(Each successful call opens a live Checkout Session that simply expires unused; nothing is charged.)

## Later, after twoclear.co.uk is live (not now)

1. Remove the 6 old PBTable IDs from `ALLOWED` and redeploy; then Paul archives the 6 old products in Stripe.
2. Webhook: on `customer.subscription.updated`, also write the new `price_id` and `plan`
   (it currently writes only status and renewal date, so plan changes don't reach `subscriptions`).
   Bundle this with the Terms-acceptance webhook deploy.
