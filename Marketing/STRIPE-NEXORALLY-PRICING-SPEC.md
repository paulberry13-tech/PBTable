> **SUPERSEDED (28 Sep 2026):** Nexorally was dropped for twoclear. Use `STRIPE-TWOCLEAR-PRICING-SPEC.md`.

# Stripe setup — Nexorally pricing + rebrand

This covers the **new 3-tier pricing** and the **rebrand naming**, done together so you only touch Stripe once.

**Currency:** GBP · **Tax:** No VAT (Paul Berry is not VAT registered) — leave tax behaviour off / "No tax".
**Annual pricing rule:** annual = **10 × monthly** for every product (pay for 10 months, get 12). The "saving" shown on site is the 2 free months (= 2 × monthly). Any future price follows the same rule.
**Two golden rules:**
1. **You cannot edit a price's amount.** Stripe prices are immutable. To "change" a price you create a NEW price and **archive** the old one. Product *names* and *metadata* you can edit in place.
2. **Renaming a product keeps its ID and all existing subscriptions attached.** Safe to do.

---

## A. Products & prices — FRESH BUILD (decided 2026-09-14)

**Decision:** Paul has **no live paying subscribers**, so we're building a clean, fully-Nexorally catalogue and archiving the old six PBTable products. Stripe won't delete used prices — archive only; archived prices just can't be picked by new checkouts. One product per price (Paul's existing convention). Plain names (no em dashes) since they show on receipts.

Create these **8 new products**, each with a single recurring GBP price, **Include tax in price = Yes**, and the **same tax category** on all 8 for consistency (use the "Electronically Delivered Information Services - Business Use" one already in the account — no tax is collected while not VAT registered):

| # | Product name | Amount | Billing |
|---|---|---|---|
| 1 | Nexorally Social Monthly | £12.00 | Monthly |
| 2 | Nexorally Social Annual | £120.00 | Yearly |
| 3 | Nexorally Club Founding Monthly | £19.00 | Monthly |
| 4 | Nexorally Club Founding Annual | £190.00 | Yearly |
| 5 | Nexorally Club Standard Monthly | £29.00 | Monthly |
| 6 | Nexorally Club Standard Annual | £290.00 | Yearly |
| 7 | Nexorally Club + Membership Monthly | £39.00 | Monthly |
| 8 | Nexorally Club + Membership Annual | £390.00 | Yearly |

Then **archive the 6 old PBTable products** (Founder Monthly/Annual, Social Monthly/Annual, Standard Monthly/Annual). The 2 already-archived stay as they are.

**Large club (150+ players):** NOTHING to create. "From £59/mo" is contact-for-bespoke-quote; make a one-off custom price when a large club actually signs.

**Old price IDs (now retired — for reference only, do NOT reuse):**
Founding £19 `price_1TqJdk1uDFkhZnppXUjtuFW2` · Founding £190 `price_1TlW2s1uDFkhZnppmc05X2hW` · Standard £29 `price_1TlW2v1uDFkhZnppHJvcXiSi` · Standard £290 `price_1TlW2o1uDFkhZnpp2kWsWrsD` · Social £19 `price_1TqIRt1uDFkhZnppaCgVcvG8` · Social £190 `price_1TqITH1uDFkhZnppXg1gT6wn`

---

## B. Account settings (customer-facing rebrand)

These are cosmetic but this is what a subscriber actually sees:

- [ ] **Public business name** → `Nexorally` (Settings → Business details). Keep the legal entity as **Paul Berry t/a Nexlane** where the legal name is required.
- [ ] **Statement descriptor** (the line on their card statement) → change from `PBTABLE` to `NEXORALLY` (Settings → Public details). Max 22 chars, letters/numbers only.
- [ ] **Support email / URL** → nexorally.com addresses when ready (fine to leave pbtable/Brevo email for now per the migration plan).
- [ ] **Branding** (Settings → Branding): upload the Nexorally mark, set brand colour to the orange `#f97316` and accent/icon. This restyles Checkout, the Customer Portal, and Stripe-sent emails/receipts.

---

## C. What to send me back

Once created, paste all **8 new price IDs** and I'll wire the site + Edge Function:

```
Social Monthly £12          : price_...
Social Annual £120          : price_...
Club Founding Monthly £19   : price_...
Club Founding Annual £190   : price_...
Club Standard Monthly £29   : price_...
Club Standard Annual £290   : price_...
Membership Monthly £39      : price_...
Membership Annual £390      : price_...
```

Then I will:
1. Rewrite the `PLANS` object in `pbtable-website.html` with all 8 new IDs (Social → £12/£120, add the `membership` tier, fix `ANNUAL_SAVE.social` to `£24`).
2. Add **Club + Membership** to the `#order` plan selector.
3. Replace the old IDs with the 8 new ones in the `ALLOWED` list in `supabase/functions/create-checkout-session/index.ts`.
4. Re-sync `pbtable-site/index.html` and deploy to draft for you to test a live checkout.

---

## Reference — figures shown on the site (source of truth)

| Tier | Monthly | Annual | Annual saving | Founding? |
|---|---|---|---|---|
| Social | £12 | £120 | £24 | no |
| Club | £19 founding / £29 standard | £190 / £290 | £38 / £58 | yes (first 20 clubs) |
| Club + Membership | £39 | £390 | £78 | no |
| Large club (150+) | from £59, bespoke | — | — | contact only |
