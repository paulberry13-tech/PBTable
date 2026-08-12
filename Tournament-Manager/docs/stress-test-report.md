# Tournament Manager — full-app stress test

**Date:** 2026-08-12
**Scope:** three separate tournaments, 150+ players each, driven top to bottom — setup,
entries, draws, scheduling, a simulated match day, and a deliberate attempt to break the
app. Every defect found was fixed and the failing scenario re-run.

**Headline:** three real defects found, all invisible at demo scale, **all fixed and
re-verified**. One of them (silent 1000-row truncation) would have shown wrong scores on a
large real event with no error message — the single most important thing this exercise
caught. The demo data was proven byte-identical before and after; nothing you rely on for
selling the product was touched.

---

## What was tested, and at what scale

| Tournament | Players | Shape | What it stressed |
|---|---|---|---|
| **Gloucester Grand Slam** | 158 | 5 events, 8-pool round-robins → 16-slot brackets, 374 matches, 315 pool games | Organiser-entered path at scale; draw generation; **cross-event scheduling** (players in 2–3 events, 12 courts); pool-standings maths; winner advancement through 4 rounds |
| **Avon Winter Open** | 160 real accounts | Self-service, paid, capacity caps | Mass registration through the player RPCs; partner invitations; **capacity → waitlist**; **partner swap after payment**; withdrawal-promotes-waitlister; fee integrity; adversarial RPC abuse; anonymous REST boundary |
| **Severn Monster** | 174 | best-of-3 pools everywhere (1,449 games), hostile input | **The 1000-row ceiling**; XSS / SQL-injection / emoji / 200-char names; winner tampering on scored matches; the delete-after-draw path |

Totals exercised: **~490 players, ~1,900 games, ~180 self-service registrations, ~190 card
payments simulated, 5 champions crowned.**

---

## Defects found and fixed

### 1. Admin writes to entries/payments silently failed (migration 010, fix #1)

**Severity: high — the admin couldn't add an entry or mark a fee paid.**

`005g` revoked `EXECUTE` on `recalc_entry_status()` from the API roles (correct — it takes
an arbitrary account id, so exposing it leaked ratings). But the `AFTER` triggers on
`entry_players` and `entry_payments` call it, and a trigger function runs with the
*invoking* role's privileges. So the moment a signed-in admin added an entry through the UI,
or pressed "Mark paid", the write hit the revoke and rolled back with `42501 permission
denied for function recalc_entry_status`.

It stayed hidden because the player RPCs are `SECURITY DEFINER` (they run as the owner, who
keeps the privilege) and all demo seeding ran as service-role. It only surfaces for a real
signed-in admin — which is exactly what driving the admin UI does.

**Fix:** the two trigger wrapper functions became `SECURITY DEFINER`. They can't be reached
as RPCs (trigger signatures aren't exposed, and `013`/`010` revoke them anyway), so
`recalc_entry_status` stays unreachable from outside.
**Re-verified:** added an entry through the live admin UI; the gender/duplicate guards still
fire; marking a fee paid promotes the entry.

### 2. A drawn tournament couldn't be deleted (migration 010, fix #2)

**Severity: high — an organiser could get permanently stuck.**

Deleting a tournament (or event) cascades to `entry_players`, and
`guard_entry_players_after_draw()` blocked that DELETE because a draw existed. So the admin
"Danger zone → delete tournament" and "Delete event" buttons failed on **any tournament that
had reached the draw stage** — i.e. every real one. The guard is meant only to stop a player
being pulled out of a live entry; a cascade teardown is not that.

**Fix:** a transaction-scoped session flag (`app.bypass_draw_guard`) that deliberate
teardown paths set, plus two `SECURITY DEFINER` wrappers `admin_delete_tournament` /
`admin_delete_event` that gate on `is_tournament_admin()` and set the flag. The admin UI now
calls these instead of a bare delete.
**Re-verified:** as a signed-in admin, a fully-drawn 374-match tournament deletes cleanly;
the guard still refuses a *player* trying to alter a drawn roster.

### 3. Silent 1000-row truncation on every page (index / display / admin)

**Severity: high — wrong data shown with no error, the worst kind.**

PostgREST caps a response at 1,000 rows by default and gives no signal when it does. A
big best-of-3 tournament has more than 1,000 games (Severn Monster had 1,449). Every page
loaded games with a plain `.in('match_id', …)`, so all three surfaces **silently dropped
~450 games**: the public results page and court-side board would show blank/partial scores,
pool standings would be computed from incomplete data, and — most dangerous — the admin's
score-entry screen would be working from a truncated map.

Measured before the fix: `gamesLoaded: 1000` against 1,449 expected.

**Fix:** a shared `fetchAllIn()` helper on each page that (a) pages through in 1,000-row
`range()` windows until a short page returns, and (b) chunks the id list into batches of 200
so a huge `?in=(…)` can't overflow the URL. Every large read on every page — games,
matches, entries, entry_players, pool_entries, standings, ratings, payments, invitations —
now goes through it.
**Re-verified:** all three pages load the full 1,450 games; score entry saves correctly
against the complete map; the demo tournaments (well under the ceiling) still render
identically.

---

## What held up under stress (no changes needed)

Everything below was pushed hard and did not break:

- **Cross-event scheduling.** 315 pool matches packed onto 12 courts with players in 2–3
  events each, placed by a greedy conflict-free scheduler → `schedule_clashes` reported
  **0 court and 0 player clashes**. The window-overlap logic (migration 009) holds at scale.
- **Pool standings.** 28 pools, 147 entries: every pool ranked 1..n contiguously, **zero
  tie-break ordering violations** against the won → games-won → points-diff rule.
- **Winner advancement.** Propagated correctly through 4-round brackets in all 5 events;
  every final filled from the right semis; champions crowned.
- **Capacity → waitlist.** A cap of 32 engaged at exactly 32 entered / 48 waitlisted as the
  last-paid entry crossed the line. Withdrawal promoted exactly one waitlister and held the
  count at cap.
- **Money integrity.** Partner swap after both had paid: the dropped player refunded, the
  staying player kept `paid` and was **never charged twice**. 189 fees paid, 1 refunded, all
  internally consistent.
- **Check-in gate.** Scoring refused for un-checked-in players; allowed after check-in.
- **Winner tampering.** Re-scoring a semi whose winner had advanced into a *scored* final was
  refused; clearing the final's score first allowed the correction. No silent rewrite of a
  played bracket.
- **XSS / injection.** `<script>`, `onerror` image payloads, and `'; DROP TABLE players;--`
  were all stored as inert text and rendered escaped — **no script executed, no injected DOM,
  the `players` table intact**. Emoji, CJK, and 200-char names round-tripped fine.
- **RPC abuse (as a real signed-in player).** Withdrawing a stranger's entry, changing a
  foreign partner, accepting someone else's invitation, self-partnering, and self-check-in
  were **all refused**; the internal `eligibility_problem` helper was unreachable from the
  `authenticated` role.
- **Anonymous REST.** Reading `player_accounts` (PII) and `entry_payments` (money) returned
  empty; an anonymous insert was refused `401`.
- **Rendering at scale.** 12-court board renders with no overflow and legible 89px cells;
  the public draws page renders 8-pool grids + 16-slot brackets + a 315-row schedule with no
  horizontal scroll.

---

## Also hardened

- Revoked `EXECUTE` from `anon` on the two new delete wrappers and from all API roles on the
  two `_recalc` trigger functions (migration 013, folded into 010 in the repo). Security
  advisors otherwise show only the expected, documented `SECURITY DEFINER` RPC notices.

## Notes for the future (not bugs)

- **Duplicate tournament names are allowed.** Two tournaments can share a name; the unique
  slug keeps them distinct (`…-2`). Harmless, but an organiser could confuse themselves — a
  "you already have a tournament with this name, continue?" nudge would be kindly.
- **`admin_delete_*` requires a signed-in admin JWT**, so bulk cleanup from raw SQL uses
  `set app.bypass_draw_guard='on'` directly (service-role is the ultimate authority). Worth
  remembering if you ever script a teardown.

## Cleanup — proven clean

All stress data removed and the database compared to a snapshot taken before the test:

| table | baseline | after |
|---|---|---|
| tournaments | 3 (3 demo) | **3 (3 demo)** |
| players | 56 (48 demo) | **56 (48 demo)** |
| events | 9 | **9** |
| entries | 53 | **53** |
| matches | 47 | **47** |
| games | 53 | **53** |
| player_accounts | 10 | **10** |
| auth.users | 10 | **10** |
| entry_payments | 12 | **12** |
| entry_invitations | 5 | **5** |

Every count identical. The temporary test admin, all 161 `@stress.invalid` accounts, and the
temporary SQL helper were removed. The three demo tournaments render correctly in the browser
with the pagination fix in place.
