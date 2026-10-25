-- Inter-County League — 004: pin search_path on the integrity trigger functions
-- Supabase's security linter flags a role-mutable search_path: a caller could point
-- `public` at their own schema and feed the trigger decoy tables. Fix is the standard
-- one — `set search_path = ''` plus fully-qualified references. Logic is unchanged
-- from 002; only the schema qualification and the SET clause are new.

create or replace function enforce_squad_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  squad_size    int;
  player_county uuid;
  team_county   uuid;
begin
  select count(*) into squad_size
  from public.squad_players
  where session_id = new.session_id and team_id = new.team_id;
  if squad_size >= 8 then
    raise exception 'Squad already has 8 players (max 8 per team per session)';
  end if;

  select county_id into player_county from public.players where id = new.player_id;
  select county_id into team_county   from public.teams   where id = new.team_id;
  if player_county is distinct from team_county then
    raise exception 'Player is registered to a different county from this team';
  end if;

  return new;
end $$;

create or replace function enforce_game_player_rules() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g        public.games%rowtype;
  m        public.meetings%rowtype;
  team     uuid;
  side_n   int;
  p_gender public.gender;
begin
  select * into g from public.games    where id = new.game_id;
  select * into m from public.meetings where id = g.meeting_id;
  team := case when new.side = 'home' then m.home_team_id else m.away_team_id end;

  if not exists (
    select 1 from public.squad_players
    where session_id = m.session_id and team_id = team and player_id = new.player_id
  ) then
    raise exception 'Player is not in this team''s squad for the session';
  end if;

  select count(*) into side_n
  from public.game_players where game_id = new.game_id and side = new.side;
  if side_n >= 2 then
    raise exception 'This side already has 2 players';
  end if;

  select gender into p_gender from public.players where id = new.player_id;
  if g.game_type = 'mens_doubles' and p_gender = 'female' then
    raise exception 'Men''s doubles cannot include a female player';
  elsif g.game_type = 'womens_doubles' and p_gender = 'male' then
    raise exception 'Women''s doubles cannot include a male player';
  elsif g.game_type = 'mixed_doubles' and p_gender in ('male', 'female') then
    if exists (
      select 1 from public.game_players gp
      join public.players p on p.id = gp.player_id
      where gp.game_id = new.game_id and gp.side = new.side and p.gender = p_gender
    ) then
      raise exception 'A mixed doubles pair must include one man and one woman';
    end if;
  end if;

  return new;
end $$;

-- Deliberately NOT changed: `is_league_admin()` stays SECURITY DEFINER and stays
-- executable by anon/authenticated. The linter warns about both, but the function
-- must be definer (the `league_admins` read policy calls it — invoker would recurse),
-- and revoking EXECUTE would break the "admin write" policies, which are evaluated
-- as the calling role. It discloses only whether *the caller themselves* is an admin,
-- which is not a leak.
