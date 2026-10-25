---
target: twoclear.co.uk home page
total_score: 15
max_score: 32
na_heuristics: 7,10
p0_count: 2
p1_count: 2
timestamp: 2026-10-24T10-33-28Z
slug: twoclear-site-index-html
---
**Method:** dual-agent (A: design review · B: detector + browser evidence). Target: twoclear.co.uk home page (speed-fix preview 6adc864b, identical copy/layout to live).

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Trial form has no inline validation |
| 2 | Match with real world | 2 | "RDR" used 6× before defined (FAQ item 3, via "Elo") |
| 3 | User control and freedom | 2 | Demo opens new tab; founding discount is a code typed at Stripe |
| 4 | Consistency and standards | 1 | Six setup-time promises; six labels for the same CTA |
| 5 | Error prevention | 2 | Detector: zero required fields on either form |
| 6 | Recognition over recall | 2 | Code memorised from pricing, typed at Stripe |
| 7 | Flexibility and efficiency | n/a | Landing page |
| 8 | Aesthetic and minimalist | 1 | 16 sections, 12,700px, 15 CTAs, same section recipe throughout |
| 9 | Error recovery | 2 | Order form has error slot; trial form none |
| 10 | Help and documentation | n/a | Landing page |
| **Total** | | **15/32 (47%)** | **Poor** |

## Design specificity
Voice is authored (Tuesday night, cash tin, court 4); structure is template SaaS from features down. Hero "Built with pickleball clubs, for pickleball clubs" under eyebrow "FOR PICKLEBALL CLUBS" = phrase 3×, zero claims. Detector: 7 findings; 3 are dead CSS from the old hero (grid-mesh, orbs, scanline match no DOM); 25 em dashes; btn glow; FAQ max-height transition. Browser evidence: no `required` attributes anywhere; #order inputs have no bound labels; 15 CTA controls, 12 distinct labels, 5 → #trial, 1 → #order, 2 → demo; 1 anonymous testimonial, no image.

## Priority issues
- [P0] Three sign-up paths (#trial / #order / #contact); closing banner + footer "Order now" → paid form; "No free-trial faff" disparages the trial. Fix: one path (#trial), order form off the home page, banner/footer/nav → #trial. Must be written for the card-up-front trial Paul has decided on (live copy says "No card needed" 9×).
- [P0] Hero headline is a tautology; no proof above the fold. Fix: headline = the Tuesday-night claim; one true proof line under the buttons.
- [P1] Proof = one anonymous Swindon quote after pricing + static screenshots captioned "Have a click around" + decorative 5 stars. Fix: named quote + photo under hero; honest caption or real embed; numbers strip.
- [P1] First form at 7,537px desktop / ~11,000px phone, no sticky CTA on phone, 7 fields. Fix: 3-field form in hero or sticky bar; ask the rest on thank-you.
- [P2] Six setup-time promises. Fix: one true figure everywhere.

## Persona red flags
Jordan: RDR/DUPR undefined in first two screens; "click around" image does nothing; discount code with no counter; two identical forms; "a Nexlane product" unexplained. Casey: 17,860px, no sticky CTA, demo new-tab exit, 3 stacked "Start free trial" cards, DUPR table wraps badly at 390px. Riley: text-type member count, empty form submits, annual toggle vs FOUNDINGANNUAL code, "three plans" + £59 fourth, caps stated on Social only.

## Minor
"conf" column unexplained; "HOT streaks"; EVERY PLAN INCLUDES duplicated; bookings explained 3×; footer/banner = ratings product vs hero = club platform; "Jane Secretary" ×3; FAQ #1 redundant; yellow ball behind primary button; three dark sections in a row; 25 em dashes.

## Questions
Why isn't "Four fewer jobs" the headline? What is lost by removing the order form from the home page? Would Sharon recognise her club here? Ratings product or club-night product?
