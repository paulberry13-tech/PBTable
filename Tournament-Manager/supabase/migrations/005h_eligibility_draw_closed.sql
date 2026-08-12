-- Found by walking the entry page: an event whose draw had already been generated still
-- offered an "Enter" button, and only rejected the player after they had filled in their
-- partner's email. Once the draw exists the event is closed to new entries, so say so in
-- the listing.
create or replace function public.eligibility_problem(p_event uuid, p_account uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  ev public.events; t public.tournaments; a public.player_accounts;
  v_rating numeric; v_age int;
begin
  select * into ev from public.events where id = p_event;
  select * into t from public.tournaments where id = ev.tournament_id;
  select * into a from public.player_accounts where user_id = p_account;
  if a.user_id is null then return 'Complete your player profile first.'; end if;

  if exists (select 1 from public.matches m where m.event_id = p_event) then
    return 'The draw for this event has already been made - entries are closed.';
  end if;

  if ev.category = 'mens'   and a.gender = 'female' then return 'This is a men''s event.'; end if;
  if ev.category = 'womens' and a.gender = 'male'   then return 'This is a women''s event.'; end if;

  v_rating := public.account_rating(p_account, ev.seeding_rating_source);
  if ev.max_rating is not null then
    if v_rating is null then
      return 'This event has a ' || ev.max_rating || ' rating ceiling - add your rating to your profile.';
    end if;
    if v_rating > ev.max_rating then
      return 'Your rating (' || v_rating || ') is above this event''s ' || ev.max_rating
             || ' ceiling. You may play up a band, never down.';
    end if;
  end if;

  v_age := public.age_for_tournament(a.date_of_birth, t.start_date);
  if ev.min_age is not null then
    if v_age is null then return 'This is an age-banded event - add your date of birth to your profile.'; end if;
    if v_age < ev.min_age then
      return 'This event is for players aged ' || ev.min_age || '+ (age as of 31 Dec ' ||
             extract(year from t.start_date)::int || ').';
    end if;
  end if;
  if ev.max_age is not null and v_age is not null and v_age > ev.max_age then
    return 'This event is for players aged ' || ev.max_age || ' and under.';
  end if;

  if exists (
    select 1 from public.entries en
    join public.entry_players ep on ep.entry_id = en.id
    join public.players p on p.id = ep.player_id
    where en.event_id = p_event and p.account_id = p_account and en.status <> 'withdrawn'
  ) then return 'You already have an entry in this event.'; end if;

  return null;
end;
$$;
revoke execute on function public.eligibility_problem(uuid, uuid) from public, anon, authenticated;
