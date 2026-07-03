# Product

## Register

product

## Users

- **Club members** — recreational pickleball players at a UK club, checking the app on their phone between work and evening sessions. Job: find a session, book it, see where they sit on the leaderboard, climb it.
- **Club admins** — volunteer organisers running sessions, usually at a desk (web) or courtside (phone). Job: create sessions, generate fair court slips fast, enter scores without fuss.

## Product Purpose

PBTable is "Spond, but tailored for pickleball": a closed loop competitors don't join up — book & pay → balanced court slips from RDR ratings → play → scores in → ratings move → leaderboard reshuffles → members book again to climb. This repo is the cross-platform booking-app POC (Expo: web + iOS + Android) used to validate the product with real clubs. Success = a club chair watches the 2-minute demo loop and says "when can we have it".

## Brand Personality

Sporty, sharp, trustworthy. Friendly and lively, never corporate. British spelling throughout. The leaderboard should feel competitive and alive (HOT 🔥 streaks, movement arrows), the booking flow calm and reliable.

**Primary design reference: Timely (gettimely.com)** — warm off-white canvas, blue-charcoal ink, deep indigo brand surfaces, soft lilac/pink pastel chips with deep same-hue text, coral pill CTAs, serif display headlines (Fraunces, standing in for Domaine Display) over a clean sans (Manrope), generous card radii. Monospace rating numbers (JetBrains Mono) keep the scoreboard feel.

## Anti-references

- Corporate SaaS blandness — grey dashboards, hero-metric cards, endless identical card grids.
- Council-leisure-centre software (dated municipal booking systems).
- Gamified-to-death fitness apps: no confetti, no XP bars, no mascots.
- Generic AI-generated app aesthetics: cream backgrounds, gradient text, glassmorphism.

## Design Principles

1. **The loop is the hero** — every screen should pull the eye toward the next step in book → play → rate → climb.
2. **Numbers feel official** — ratings, ranks and scores render in tabular monospace, like league tables; they're the product's currency.
3. **Earned, never phantom** — rated vs unrated is a hard visual distinction; the UI never fakes a rating.
4. **One-thumb bookable** — a member books or cancels in seconds on a phone; admin density lives on wider screens.
5. **Sharp, not shouty** — one coral accent doing real work per screen; navy and whitespace do the rest.

## Accessibility & Inclusion

- Body text ≥ 4.5:1 contrast on its background; badges and small labels checked against their tints.
- Touch targets ≥ 44px on native.
- No information carried by colour alone (arrows + signs accompany movement colours).
- Respect reduced-motion preferences for any added animation.
