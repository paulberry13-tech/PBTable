# PBTable Bookings — proof-of-concept

Cross-platform prototype for a pickleball club booking app: sessions → book & pay →
balanced court slips → scores → RDR ratings → leaderboard, in one closed loop.

**This is a throwaway-quality POC.** No database, no real auth, no real payments —
everything runs on an in-memory mock store so the product and flows can be validated
before any backend work.

## Run it

```bash
npm install

# Web
npm run web            # or: npx expo start --web

# iOS / Android (Expo Go)
npm start              # then scan the QR code with the Expo Go app
```

No custom native code — it runs in stock **Expo Go** on a phone, and in any browser
via React Native Web. One codebase, three platforms.

## Demo script (the centrepiece loop, ~2 minutes)

1. **Switch to Admin** with the toggle in the header.
2. **Admin tab → ＋ Create session** — give it a title, leave it Graded, create it.
   It appears in the sessions list immediately.
3. Open it (**Manage session**) and tap **＋ Add demo players** to book 12 members in
   (stands in for members booking one by one).
4. Tap **Generate balanced court slips** — the differentiator. Fair teams from RDR:
   strong paired with developing so team averages sit within ~0.1 of each other,
   partners rotate between rounds, courts grouped by level.
5. Tap **Enter scores**, type a score per court per round, then
   **Save scores & update RDR** — the ELO-family doubles update runs live and shows
   every player's rating movement.
6. Tap **See the leaderboard reshuffle** — ratings, movement arrows and HOT 🔥
   streaks all just moved.

Also worth showing:

- **Book a session as a Member** — mock payment sheet (any card details, always
  succeeds), instant confirmation.
- **The 24-hour cancellation rule** (My Bookings → Cancel): the seeded data has you
  booked on a full session **tonight** (cancel = no refund unless a waitlister takes
  the seat — and one does, so you're refunded) and a full session **later in the
  week** (cancel = full refund + "X promoted from the waitlist" banner).
- **Rated vs unrated** — the Players directory lists everyone (unrated members
  clearly marked); the Leaderboard shows *rated players only*, never a phantom
  rating.
- **Sport profile** — tap the PBTable logo to flip pickleball ↔ tennis and watch the
  terminology (Session/Fixture, Court slip/Match card, RDR/Club rating) adapt.

## Where the mocked seams are (swap-for-real map)

| Mock | File | Swap for |
| --- | --- | --- |
| Data API | `src/services/data.ts` | Supabase queries/RPCs — the **only** module that knows data is mocked; every function is async and returns copies, so screens already behave as API clients |
| Payments | `src/services/payments.ts` | Stripe (PaymentSheet) |
| Auth + role | `src/services/auth.ts` | Supabase Auth |
| Seed data | `src/mock/seed.ts` | deleted — 40 members, 9 upcoming + 6 completed sessions whose matches are replayed through the real rating engine on load |

Pure domain logic (no I/O, ready to move server-side as-is):

- `src/domain/ratings.ts` — RDR ELO-family doubles update, dynamic K, provisional →
  rated transitions
- `src/domain/slips.ts` — balanced court slip generator
- `src/domain/cancellation.ts` — the single 24-hour policy function
- `src/domain/sportProfile.ts` — pickleball + tennis profiles (terminology,
  players-per-court)

Theme tokens live in `src/theme.ts` (colours are placeholders, centralised to be
trivially tunable).

## Known limitations (deliberate, POC scope)

- Data resets on every reload (in-memory only); web/native/two tabs don't share state.
- "Recurring" creates a single instance with a note.
- Skill-band gating warns but doesn't block (better for demos).
- No push notifications — in-app banners stand in.
- Waitlist promotion simulates the re-charge (no real payment retry flow).
- Single demo club; no multi-tenancy.
