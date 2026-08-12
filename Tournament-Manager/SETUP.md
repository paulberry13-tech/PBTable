# Setup — do this once, in order, before any DDL

These steps need your Supabase account, so they're yours (Paul's) to do. Each numbered step
ends with a check; don't move on until the check passes. Same drill as
`InterCounty-League/SETUP.md` — the gotchas each cost real time on PBTable.

## 1. Create the Supabase project

- In the [Supabase dashboard](https://supabase.com/dashboard), create a **new project** in the
  `paulberry13-tech` org (new ref — not a branch of PBTable's or the league's). Suggested
  name: `tournament-manager`.
- Free-tier heads-up: the cap is **2 active projects per org**. If PBTable and the league
  both occupy slots, pause one or the dashboard will refuse the third.
- Note the **project ref** (the 20-char id in the project URL).

## 2. Point this folder's MCP at it

- Edit [.mcp.json](.mcp.json) in this folder: replace `REPLACE_WITH_TOURNAMENTS_PROJECT_REF`
  with the ref.
- The server is deliberately named `supabase-tournaments` — distinct from PBTable's
  `supabase`/`supabase-prod` and the league's `supabase-league` — so a glance at any tool
  call shows which database it will hit.
- **Declaring it is only half the job:** in `~/.claude.json`, find this project's entry
  (`...\Documents\PBTable\Tournament-Manager`) and add `"supabase-tournaments"` to
  `enabledMcpjsonServers`. Then **fully restart** the Claude app, and complete the one-time
  interactive approval + `/mcp` OAuth in a `claude` terminal session.

**Check:** run `claude mcp list` — `supabase-tournaments` must report `✔ Connected`, and any
other servers you use must *still* report `✔ Connected` (authorising via `/mcp` has silently
disabled others before).

## 3. Confirm the connection before any DDL

Ask Claude to run a trivial read (e.g. `select current_database()`) via
`supabase-tournaments` and confirm the result matches the new project. Only then apply
migrations.

## 4. Apply the migrations, in order

`supabase/migrations/001_core.sql` → `002_entries.sql` → `003_competition.sql` →
`004_views.sql`.

**Check — column-level, not the ledger** (dashboard-run SQL never registers in
`list_migrations`, so the ledger under-reports):

```sql
select table_name, count(*) as columns
from information_schema.columns
where table_schema = 'public'
group by table_name
order by table_name;
```

Expect these tables: `tournaments, tournament_admins, tournament_settings, players,
player_ratings, events, entries, entry_players, pools, pool_entries, matches, games` —
plus views `player_current_ratings, match_results, pool_standings, schedule_clashes`.

## 5. Bootstrap the first admin

RLS means no one can self-appoint. Create your auth user first (Authentication → Add user,
or sign in once via the admin page), then in the dashboard SQL editor (service role):

```sql
insert into tournament_admins (user_id, email)
values ('<your auth.users id>', '<your email>');
```

## 6. Smoke-test the rules

Claude runs these as self-rolling-back `DO` blocks (ending in `raise exception 'TEST -> %'`)
so zero rows are left behind. What must hold:

- a female player entered in a mens event → **rejected**
- a third player on a doubles entry, or a second on a singles entry → **rejected**
- two males (or two females) on a mixed pair → **rejected**
- the same player entered twice in one event → **rejected**
- an entry placed in two pools of the same event → **rejected**
- scoring a game while a player is not checked in (setting on) → **rejected**;
  same write with `checkin_required_for_scoring = false` → **accepted**
- setting a match's `winner_entry_id` → the winner appears in the
  `winner_advances_to` match's side; re-pointing a side of an already-scored match →
  **rejected**
- `pool_standings` ranks by matches won → games won → points difference
