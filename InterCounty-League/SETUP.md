# Setup — do this once, in order, before any DDL

These steps need your Supabase account, so they're yours (Paul's) to do. Each numbered step ends
with a check; don't move on until the check passes. The gotchas here each cost real time on
PBTable (HANDOFF §8).

## 1. Create the Supabase project

- In the [Supabase dashboard](https://supabase.com/dashboard), create a **new project** (new ref —
  not a branch of PBTable's). Suggested name: `intercounty-league`.
- Note the **project ref** (the 20-char id in the project URL).

## 2. Point this folder's MCP at it

- Edit [.mcp.json](.mcp.json) in this folder: replace `REPLACE_WITH_LEAGUE_PROJECT_REF` with the ref.
- The server is deliberately named `supabase-league` — distinct from PBTable's `supabase` and
  `supabase-prod` — so a glance at any tool call shows which database it will hit.
- **Declaring it is only half the job:** in `~/.claude.json`, find this project's entry
  (`...\Documents\PBTable\InterCounty-League`) and add `"supabase-league"` to
  `enabledMcpjsonServers`. Then **fully restart** the Claude app.

**Check:** run `claude mcp list` — `supabase-league` must report `✔ Connected`, and any other
servers you use must *still* report `✔ Connected` (authorising via `/mcp` has silently disabled
others before).

## 3. Confirm the connection before any DDL

Ask Claude to run a trivial read (e.g. `select current_database()`) via `supabase-league` and
confirm the project ref in the result matches the new project. Only then apply migrations.

## 4. Apply the migrations, in order

`supabase/migrations/001_core.sql` → `002_competition.sql` → `003_standings_and_access.sql`.

**Check — column-level, not the ledger** (dashboard-run SQL never registers in
`list_migrations`, so the ledger under-reports):

```sql
select table_name, count(*) as columns
from information_schema.columns
where table_schema = 'public'
group by table_name
order by table_name;
```

Expect these tables: `counties, teams, players, player_ratings, seasons, divisions,
division_teams, sessions, session_teams, squad_players, meetings, games, game_players,
league_admins` — plus views `player_current_ratings, meeting_results, standings`.

## 5. Bootstrap the first admin

RLS means no one can self-appoint. In the dashboard SQL editor (service role):

```sql
insert into league_admins (user_id)
values ('<your auth.users id>');
```

(Create your auth user first via Authentication → Add user if you haven't signed in yet.)

## 6. Smoke-test the rules

Insert two counties, two teams, a few players, one season/division/session, one meeting, and try to:

- add a 9th squad player (must fail),
- add a player to another county's squad (must fail),
- record a women's doubles game with a male player (must fail),
- record 4 games and select from `standings` (must show 1 league point to the winner).
