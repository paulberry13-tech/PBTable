# twoclear.co.uk home page rebuild (24 Oct 2026)

Built after the design critique (score 15/32). Source of truth is now
`Documents\PBTable\twoclear-site\` (the card-trial version + speed fixes + this rebuild).
The copy before the rebuild is in the session scratchpad `mkt/twoclear-site.before-rebuild`.

## What changed

- **Hero:** headline is the claim ("Your club night, without the spreadsheet, the WhatsApp rota or
  the cash tin."), one primary button to the trial, "See a live club" secondary, trust line
  ("Nothing charged for 30 days · No player app · Cancel any time"), and a proof line:
  *Live at Swindon Pickleball Club and Pickleball Gloucestershire · 364 players on the boards ·
  484 games rated* (counts read from the public API on 24 Oct; update by hand now and then).
- **Proof section** directly under the hero: Bryan Saunders' full quote, named, "Chairman,
  Swindon Pickleball Club". Pull-quote on the left, full text and initials on the right.
- **One sign-up path.** `#trial` and `#order` are the same section (the Stripe trial form).
  Every button, the closing banner, the nav and the footer point at it. "Order now" is gone.
- **Page cut from 16 sections to 12:** removed the anonymous testimonial, the bookings band,
  the "Every plan includes" strip (duplicated at pricing) and two FAQ items; the "Four fewer jobs"
  section now comes before the screenshot showcase.
- **One setup promise everywhere:** "we set your club up within one working day". All "20 minutes",
  "one sitting", "same evening" wording removed, including the meta description and structured data.
- **Consistent button labels:** "Start free trial" / "Start your (30-day) free trial" only.
- **RDR defined at first use** (pillars card, graded column, FAQ) in plain words; no "Elo".
- **FAQ:** first question is now "Why do you ask for a card on a free trial?"; "What do my players
  have to do?" replaces two DUPR-account questions; 9 questions; structured-data FAQ regenerated from
  the page so Google sees the same text.
- **Pricing:** "Up to 150 players" on all three cards; founding offer in plain words; no second path.
- **Forms:** labels bound to inputs, required fields marked, consent box required.
- **Phone:** a sticky "Start your free trial" bar appears after the hero and hides while the form
  or footer is on screen.
- **Accessibility:** DUPR table has real header cells; plan labels pass contrast.
- **No eyebrows, no em dashes in visible copy, old hero CSS removed (page 98KB -> 93KB).**

Lighthouse (phone): performance 81, accessibility 95, best practices 100, CLS 0.
(SEO shows 69 on previews only because Netlify adds `noindex` to preview deploys.)

## Before this goes live (in this order)

1. **Deploy the two edge functions** from `Documents\PBTable\supabase\functions\`, pasting each
   `index.ts` into the Supabase dashboard editor (project kxvtqsmjlhlajkoyejwk):
   - `create-checkout-session`: now `trial_period_days: 30`, `payment_method_collection: "always"`,
     old PBTable price IDs removed, return URL `...#trial`. The Terms check is unchanged.
   - `stripe-webhook`: `checkout.session.completed` reads the status from the subscription
     (`trialing`) instead of hard-coding `active`; `customer.subscription.updated` also records a
     plan change (`price_id`); trial-ending email reworded for twoclear (still a no-op without
     `RESEND_API_KEY`).
   Until both are deployed, the page says "nothing charged for 30 days" but checkout would charge
   on day 1. **Do not publish the page first.**
2. **Stripe settings** (dashboard): Settings -> Billing -> Subscriptions and emails ->
   turn on "Send emails about upcoming trial ending" (7 days). Settings -> Billing -> Retries:
   keep the default smart retries. Customer portal: allow cancellation.
3. **Terms of Service:** check `terms.html` says the trial takes a card and the first charge is on
   day 30. If the wording changes, bump `TERMS_VERSION` in `index.html` (currently '1.0').
4. **Test with a real card:** start a trial on the live page with FOUNDING, confirm Stripe shows
   `trialing` with the trial end 30 days out and £0 charged, then cancel it from the billing portal.
5. **Publish:** `netlify deploy --prod --dir twoclear-site --site 474fbff3-5498-41c3-aa19-6b03fd8f4287`
   (or ask Claude to publish the preview deploy).

## Still to do on the SEO list

- Club sites: "Powered by twoclear" becomes a link; proper titles/descriptions per club.
- `noindex` on demo.twoclear.co.uk.
- Sitemap `lastmod` dates; breadcrumbs on the pages that lack them.
- Content plan (buyer-intent pages, comparison pages, free tools, guides).
- Directory listings (Capterra, G2, GetApp); a Swindon case study.
- Change of Address in Search Console (pbtable.com -> twoclear.co.uk) once Google re-fetches.

## 25 Oct 2026: memberships added to the marketing site (local only, not published)

- New page `twoclear-site/memberships.html`: hero with a "New" tag, three groups
  (members / admins and treasurers / safety and data protection), six FAQs with FAQ structured data,
  mock-up cards with made-up names (no demo screenshots: the demo member screens carry Paul's own details).
- Home: Memberships in the menu and footer; the Club + Membership card describes what's built, carries the
  tag and links to the page; "A club that runs itself" mentions memberships.
- features.html: section 6 "Memberships, without the paper forms" with the tag, plus the description tag.
- Every page's menu now has Memberships; every "Order Now" / "Start your club" button goes to the trial.
- sitemap.xml: memberships.html added; home and features dated 25 Oct.
- Builder: scratchpad `mem/build_memberships.py`. Backup of the folder before: scratchpad `mem/twoclear-site.before-memberships`.
- Paul confirmed 25 Oct: memberships is live and available now, so the tag is "New" (not "Coming December 2026"); plan = Club + Membership at £39/£390 as live.
- Noticed, not changed: features.html still says ratings are "built on the proven Elo rating system", which the
  memberships brief's rules would forbid; Paul to decide.

## 25 Oct 2026: contact page (local only)

- New `twoclear-site/contact.html`: the home page's "Talk to a human" section on a page of its own (same Netlify
  form, name "contact", so submissions land in the same place), breadcrumb, a short "What people usually ask" strip,
  ContactPage + breadcrumb structured data. Title/description set for search.
- Every menu's Contact link and every footer "Contact us" now go to contact.html (the home page gained a Contact menu
  link; its on-page contact section stays as the fallback for the trial form's "Prefer to talk first?").
- sitemap.xml: contact.html added. Builder: scratchpad `mem/build_contact.py`.

## 25 Oct 2026: released. Trial sign-up is the contact form; no card, no Stripe checkout

Paul's decision 25 Oct: drop the card-up-front checkout. "Start your free trial" everywhere now goes to the contact
form (home #contact, or contact.html from other pages). Clubs send a message; Paul sets them up within one working
day; payment is arranged at the end of the 30 days by hand.
- index.html: the plan picker / Stripe form section and all its scripts are gone (no js.stripe.com on the page at all).
  Contact section heading is "Start your free trial". FAQ 1 is "Is there a free trial?" (no card). Pricing buttons
  and footnote, banner and sticky bar all point at #contact. Structured FAQ regenerated.
- contact.html: "Tell us about your club", trial wording, its own buttons point at its form.
- Every other page: index.html#trial -> contact.html; "cancel before and pay nothing" -> "no card needed";
  getting-started step 1 rewritten.
- The supabase/functions edits (create-checkout-session trial, stripe-webhook status) are therefore NOT needed and
  were never deployed; the deployed functions are unchanged. Leave them unless checkout comes back.
- CHECK: Netlify Forms notifications for form "contact" go to an address Paul reads; trial requests arrive there.
- memberships.html condensed to one row per audience (4,186px desktop). Builder: mem/condense_memberships.py.

## 25 Oct 2026 (later): hero refresh, published
- Paul's generated image (bench, paddles, ball in a sports hall) replaces hero-court.jpg: hero-bench.jpg + 1600/800 WebP; overlay lightened (.5/.55/.82); image positioned at 62%.
- Headline: "Pickleball club software: built with pickleball clubs, for pickleball clubs"; the club-night line moved into the sub-heading; trust line "Free for 30 days · No card needed"; the proof line (clubs + counts) replaced by four linked feature chips.

## 25 Oct 2026 (evening): real demo screens on features.html (local only, not published)
- The four "Screenshot coming" placeholders are replaced with real screens from demo.twoclear.co.uk:
  demo-court-lineups (session planner), demo-term-setup (graded sessions with REPEAT nights), demo-wallet (member
  wallet in a phone frame, new `.phone` CSS), demo-calendar (combined calendar with a both-on-one-night day).
  PNG + WebP with width/height; the unused `.placeholder` CSS is removed. No placeholders remain on any page.
- Clean-up on the captures: "Sign in as admin" painted out, the venue address and "Playing as Paul" cropped off.
  Only the demo club's made-up names appear.
- Scripts: scratchpad mem/demo_capture.cjs, recap_narrow.cjs, crop_features.py, place_screens.py.
  Backup before: mem/twoclear-site.before-screens. Preview image: Marketing/features-real-screens-preview.png.
- Not changed: the styled mock-up cards on bookings, graded-sessions, social-sessions and memberships. They show
  admin states the demo can't show without signing in (create-session forms, waitlist promotion, score entry), and
  memberships must not use demo member screens (they carry Paul's own details).

## 25 Oct 2026 (late): Stripe subscription checkout restored on the home page (local only, not published)
Paul: the Stripe integration must stay. The trial stays no-card via the contact form; paying is by Stripe.
- New section "Subscribe to twoclear" (`#order`, section id `subscribe`) between Pricing and the FAQ: plan picker
  (Social / Club / Club + Membership), monthly/annual switch with save badge, summary with "Total today", founding hint
  (FOUNDING / FOUNDINGANNUAL, Club only), name/email/club, Terms + DPA tick (TERMS_VERSION '1.0' sent to the function),
  Stripe embedded checkout (promotion codes on), success panel on return (`?checkout=complete`), Stripe.js loaded only near the form.
- Wording is pay-today because the DEPLOYED create-checkout-session charges on the day (no trial). Do not deploy the repo's
  trial edits to that function unless the site wording changes with it.
- Each pricing card: "Ready to pay? Subscribe now" under the trial button (picks the plan); pricing footnote and FAQ 1 link to it.
- Tested on localhost 25 Oct: all plan/annual combinations, validation, Terms refusal, function 200 + Stripe form shows
  "Subscribe to Club Monthly £29.00 per month" with Add code; success panel; no JS errors; no sideways scroll on phone.
  The test created one unused live Checkout Session (test@ address), which expires by itself.
- Builder: scratchpad mem/restore_checkout.py; backup before: mem/twoclear-site.before-checkout.

## 25 Oct 2026: PUBLISHED (deploy 6ade60df3991deba7abe48d8)
- Live: the real demo screens on features.html, the restored Stripe "Subscribe to twoclear" section, and the
  Subscribe links on the pricing cards. Free trial unchanged: no card, contact form only (36 trial buttons, all to the form).
- apple-preview.html (old design experiment, noindex, unlinked) deleted from the site at Paul's request; now 404.
  A copy is in scratchpad mem/removed/.
- Checked live: pages and images 200, checkout section + Stripe.js load, plan/annual totals right, success panel shows,
  no "Screenshot coming" left, no script errors.
