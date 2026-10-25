# Stripe setup: twoclear pricing + rebrand

Replaces `STRIPE-NEXORALLY-PRICING-SPEC.md`. New pricing and the rebrand are done together so Stripe
is only touched once.

**Decided 29 Sep 2026:** standard prices for everyone; the founding offer is a **public discount code**
(not separate founding prices). No brand name in product names (the business name already shows on
checkout, receipts and statements); tier names match the website.

**Currency:** GBP. **Tax:** none (not VAT registered), so leave tax behaviour off.
**Annual rule:** annual = 10 x monthly (pay 10 months, get 12). The saving shown on the site = 2 x monthly.

**Two golden rules**
1. A price's amount can't be edited. To change one, create a new price and archive the old.
2. Renaming a product keeps its ID and anything attached to it.

---

## A. Products and prices

Make sure you're in **live** mode (not test mode or a sandbox).

Create these **6 products**, each with one recurring GBP price, **Include tax in price = Yes**, and
the same product tax code on all ("Electronically Delivered Information Services - Business Use"):

| # | Product name | Amount | Billing |
|---|---|---|---|
| 1 | Social Monthly | £12.00 | Monthly |
| 2 | Social Annual | £120.00 | Yearly |
| 3 | Club Monthly | £29.00 | Monthly |
| 4 | Club Annual | £290.00 | Yearly |
| 5 | Club + Membership Monthly | £39.00 | Monthly |
| 6 | Club + Membership Annual | £390.00 | Yearly |

Then archive the 6 old PBTable products (Founder Monthly/Annual, Social Monthly/Annual,
Standard Monthly/Annual). Check by price, not name: the old Social prices are £19 / £190.

**Larger clubs (150+ players):** nothing to create. "From £59/mo" is contact-us; make a one-off
price when a large club signs.

**Old price IDs (retired, reference only, do not reuse):**
Founding £19 `price_1TqJdk1uDFkhZnppXUjtuFW2` · Founding £190 `price_1TlW2s1uDFkhZnppmc05X2hW` ·
Standard £29 `price_1TlW2v1uDFkhZnppHJvcXiSi` · Standard £290 `price_1TlW2o1uDFkhZnpp2kWsWrsD` ·
Social £19 `price_1TqIRt1uDFkhZnppaCgVcvG8` · Social £190 `price_1TqITH1uDFkhZnppXg1gT6wn`

---

## B. Founding offer: two discount codes

A Stripe discount takes the same amount off every bill, so monthly and annual need one each.
Both are **Forever** (every renewal, for as long as they subscribe) and limited to the Club plan,
so a founding club that moves to another plan pays that plan's normal price automatically.

| Coupon | Amount off | Duration | Applies to (specific products) | Promotion code | Max uses |
|---|---|---|---|---|---|
| Founding monthly | £10.00 | Forever | Club Monthly only | `FOUNDING` | 20 |
| Founding annual | £100.00 | Forever | Club Annual only | `FOUNDINGANNUAL` | 20 |

Result: £29 - £10 = **£19/month**, £290 - £100 = **£190/year**, locked in for as long as they stay on Club.
Stripe can't share one limit across two codes, so the pair could reach 40 in theory; keep an eye on
redemptions in the dashboard and deactivate both codes once 20 founding clubs have signed.
Deactivating a code later does NOT remove the discount from clubs already using it.

---

## C. Account settings (what subscribers see)

- [ ] **Public business name:** `twoclear` (Settings > Business details). Keep "Paul Berry t/a Nexlane"
      wherever the legal name is required.
- [ ] **Statement descriptor** (the line on their bank statement): `PBTABLE` > `TWOCLEAR`.
- [ ] **Support email / website:** `hello@twoclear.co.uk` / `https://twoclear.co.uk`.
- [ ] **Branding:** icon = `Marketing\Twoclear Logos\twoclear-brand\favicon\twoclear-favicon-512x512.png`,
      brand colour `#F97316`, accent `#101828`. Restyles Checkout, the Customer Portal, emails, receipts.

---

## D. Plan changes (handled by email to hello@ for now; you make the change in Stripe)

| Change | When | What they pay |
|---|---|---|
| Upgrade, same billing (e.g. Social > Club) | Straight away | The difference for the rest of the current period (Stripe "prorates"). Renewal date unchanged. |
| Downgrade (e.g. Membership > Club) | At the next renewal | Nothing back for the current period (Terms: no pro-rata refunds). Lower price from renewal. |
| Monthly > annual | Straight away | The annual price, less credit for unused days of the month. New yearly renewal date from today. |
| Annual > monthly | At the end of the paid year | Nothing back. Monthly billing starts when the year ends. |

Founding clubs: switching between monthly and annual Club means swapping the founding discount
(monthly <> annual) on the subscription at the same time. Moving off Club drops it automatically.

---

## E. Send back the 6 new price IDs

```
Social Monthly £12              : price_1UL2ru1uDFkhZnppv4rnx9a7
Social Annual £120              : price_1UL2tY1uDFkhZnpphNnMA06u
Club Monthly £29                : price_1UL2uV1uDFkhZnppMXyCE4xy
Club Annual £290                : price_1UL2vI1uDFkhZnppC71P0DcV
Club + Membership Monthly £39   : price_1UL2wA1uDFkhZnppRCjgogHj
Club + Membership Annual £390   : price_1UL2wu1uDFkhZnppqGT9e0lc
```

Then the wiring (done for you):
1. Checkout function `supabase/functions/create-checkout-session/index.ts`: replace the 6 old IDs in
   `ALLOWED` with the 6 new ones. **Deploy this first**, or the site would send IDs it rejects.
2. Webhook `stripe-webhook`: also record the new plan when a subscription changes (today it only
   records status and renewal date).
3. Site `twoclear-site/index.html`: Club shown at £29 with the founding line and code, `PLANS` with the
   6 IDs, `ANNUAL_SAVE.club` = £58, and an FAQ answer on changing plans.
4. Netlify draft, then real test checkouts. Checkout takes only one code at a time, so: test the
   standard flow at £0 with a 100%-off one-time promo; test `FOUNDING` by paying the real £19 and
   refunding it in the dashboard afterwards.
