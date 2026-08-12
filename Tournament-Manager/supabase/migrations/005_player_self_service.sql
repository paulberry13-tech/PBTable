-- 005_player_self_service.sql — Tournament Manager
-- Phase 2, brought forward: player-facing signup, entry, partner handling and payment.
--
-- Design decisions worth knowing before reading:
--   * A PLAYER ACCOUNT is cross-tournament (one profile, many tournaments) — like
--     Pickleball Brackets. `players` stays tournament-scoped and gains `account_id`;
--     organiser-typed players simply have a null account_id, so nothing existing breaks.
--   * Every player-side WRITE goes through a SECURITY DEFINER rpc, never through open
--     RLS insert policies. Registration touches four tables atomically and has real
--     eligibility rules; an rpc is the only way to keep that honest.
--   * FEES ARE PER PLAYER, not per entry. That is what makes partner changes survivable:
--     the entry row persists, `entry_players` swaps, and each person's payment follows
--     the person. A dropped partner's payment becomes refundable without touching the
--     other player's paid fee.
--   * Eligibility follows the sport: you may PLAY UP but not DOWN (rating ceiling per
--     event), age is computed as of 31 Dec of the tournament year (USA Pickleball
--     convention), pairs may have a combined-rating cap, gender rules already exist.
--   * self_service_entries defaults FALSE — the organiser opts in, and the OFF path is
--     the one the existing demo data exercises.

-- ---------------------------------------------------------------- accounts

create table public.player_accounts (
  user_id       uuid primary key,                    -- = auth.uid()
  full_name     text not null,
  gender        text not null check (gender in ('male','female','other')),
  date_of_birth date,
  email         text not null,
  phone         text,
  dupr_id       text,
  dupr_rating   numeric(4,2) check (dupr_rating >= 0 and dupr_rating <= 8),
  self_rating   numeric(4,2) check (self_rating >= 0 and self_rating <= 8),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index player_accounts_email_key on public.player_accounts (lower(email));

alter table public.players
  add column account_id    uuid references public.player_accounts(user_id) on delete set null,
  add column date_of_birth date;
create index players_account_idx on public.players (account_id);
-- one tournament player row per account per tournament
create unique index players_one_per_tournament
  on public.players (tournament_id, account_id) where account_id is not null;

-- ---------------------------------------------------------------- registration window + fees

alter table public.tournaments
  add column currency              text not null default 'gbp',
  add column registration_opens_at timestamptz,
  add column registration_closes_at timestamptz,
  add column withdrawal_deadline   timestamptz,      -- self-serve withdrawal + refund cutoff
  add column refund_policy         text;

alter table public.tournament_settings
  add column self_service_entries boolean not null default false,
  add column allow_partner_tbc    boolean not null default true;  -- register without a partner

alter table public.events
  add column entry_fee_pence    integer  not null default 0 check (entry_fee_pence >= 0),
  add column max_entries        smallint check (max_entries > 0),   -- null = uncapped
  add column max_rating         numeric(4,2) check (max_rating >= 0 and max_rating <= 8),
  add column min_rating         numeric(4,2) check (min_rating >= 0 and min_rating <= 8),
  add column combined_rating_max numeric(5,2),                      -- pair cap, doubles only
  add column min_age            smallint check (min_age between 0 and 100),
  add column max_age            smallint check (max_age between 0 and 100);

-- 'incomplete' = a doubles entry still waiting on a partner, or fees outstanding.
-- Draw generation must only ever pick up 'entered'.
alter table public.entries drop constraint entries_status_check;
alter table public.entries add constraint entries_status_check
  check (status in ('incomplete','entered','waitlisted','withdrawn'));
alter table public.entries
  add column created_by_account uuid references public.player_accounts(user_id) on delete set null,
  add column withdrawn_at       timestamptz;

-- ---------------------------------------------------------------- partner invitations

create table public.entry_invitations (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null references public.entries(id) on delete cascade,
  invited_by       uuid not null references public.player_accounts(user_id) on delete cascade,
  invited_email    text not null,
  invited_account  uuid references public.player_accounts(user_id) on delete set null,
  token            text not null unique default encode(gen_random_bytes(18), 'hex'),
  status           text not null default 'pending'
                   check (status in ('pending','accepted','declined','cancelled','superseded')),
  created_at       timestamptz not null default now(),
  responded_at     timestamptz
);
create index entry_invitations_entry_idx on public.entry_invitations (entry_id);
create index entry_invitations_email_idx on public.entry_invitations (lower(invited_email))
  where status = 'pending';

-- ---------------------------------------------------------------- payments (per player)

create table public.entry_payments (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null references public.entries(id) on delete cascade,
  player_id     uuid not null references public.players(id) on delete cascade,
  account_id    uuid references public.player_accounts(user_id) on delete set null,
  amount_pence  integer not null check (amount_pence >= 0),
  currency      text not null default 'gbp',
  status        text not null default 'pending'
                check (status in ('pending','paid','waived','refunded','failed')),
  stripe_session_id text,
  stripe_payment_intent text,
  paid_at       timestamptz,
  refunded_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (entry_id, player_id)
);
create index entry_payments_account_idx on public.entry_payments (account_id);
create index entry_payments_session_idx on public.entry_payments (stripe_session_id);

-- ---------------------------------------------------------------- helper functions

-- Age as of 31 Dec of the tournament year (USA Pickleball convention — a player who
-- turns 50 in December plays the 50+ bracket all year).
create or replace function public.age_for_tournament(p_dob date, p_start date)
returns integer
language sql immutable
set search_path = ''
as $$
  select case when p_dob is null then null
    else extract(year from p_start)::int - extract(year from p_dob)::int end;
$$;

-- The rating an event seeds/validates on: the event's chosen source, else DUPR, else self.
create or replace function public.account_rating(p_account uuid, p_source text)
returns numeric
language sql stable
set search_path = ''
as $$
  select case
    when p_source ilike 'self' then coalesce(a.self_rating, a.dupr_rating)
    when p_source ilike 'dupr' then coalesce(a.dupr_rating, a.self_rating)
    else coalesce(a.dupr_rating, a.self_rating)
  end
  from public.player_accounts a where a.user_id = p_account;
$$;

create or replace function public.registration_is_open(p_tournament uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(s.self_service_entries, false)
     and (t.registration_opens_at  is null or now() >= t.registration_opens_at)
     and (t.registration_closes_at is null or now() <= t.registration_closes_at)
  from public.tournaments t
  left join public.tournament_settings s on s.tournament_id = t.id
  where t.id = p_tournament;
$$;

-- ---------------------------------------------------------------- entry readiness

-- An entry is 'entered' only when the roster is full AND every member's fee is settled.
-- Capacity pushes the overflow to 'waitlisted'. Never touches 'withdrawn'.
create or replace function public.recalc_entry_status(p_entry uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_event uuid; v_disc text; v_cap smallint; v_fee int;
  v_needed int; v_have int; v_unpaid int; v_status text; v_entered int;
begin
  select e.status, e.event_id into v_status, v_event from public.entries e where e.id = p_entry;
  if v_status is null or v_status = 'withdrawn' then return; end if;

  select ev.discipline, ev.max_entries, ev.entry_fee_pence
    into v_disc, v_cap, v_fee
    from public.events ev where ev.id = v_event;

  v_needed := case when v_disc = 'singles' then 1 else 2 end;
  select count(*) into v_have from public.entry_players ep where ep.entry_id = p_entry;

  select count(*) into v_unpaid
    from public.entry_players ep
    left join public.entry_payments pay
      on pay.entry_id = ep.entry_id and pay.player_id = ep.player_id
   where ep.entry_id = p_entry
     and v_fee > 0
     and coalesce(pay.status, 'pending') not in ('paid','waived');

  if v_have < v_needed or v_unpaid > 0 then
    if v_status <> 'incomplete' then
      update public.entries set status = 'incomplete' where id = p_entry;
    end if;
    return;
  end if;

  -- ready: keep an organiser's explicit waitlisting, otherwise enter (respecting capacity)
  if v_status = 'incomplete' then
    select count(*) into v_entered
      from public.entries e2
     where e2.event_id = v_event and e2.status = 'entered' and e2.id <> p_entry;
    if v_cap is not null and v_entered >= v_cap then
      update public.entries set status = 'waitlisted' where id = p_entry;
    else
      update public.entries set status = 'entered' where id = p_entry;
    end if;
  end if;
end;
$$;

create or replace function public.entry_players_recalc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.recalc_entry_status(coalesce(new.entry_id, old.entry_id));
  return null;
end;
$$;

create trigger entry_players_status
after insert or delete on public.entry_players
for each row execute function public.entry_players_recalc();

create or replace function public.entry_payments_recalc()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.recalc_entry_status(coalesce(new.entry_id, old.entry_id));
  return null;
end;
$$;

create trigger entry_payments_status
after insert or update or delete on public.entry_payments
for each row execute function public.entry_payments_recalc();

-- ---------------------------------------------------------------- guards

-- Check-in is the organiser's word, never the player's.
create or replace function public.guard_player_self_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_tournament_admin() then return new; end if;
  if new.checked_in is distinct from old.checked_in then
    raise exception 'check-in is set by the organiser on the day, not by players';
  end if;
  if new.tournament_id is distinct from old.tournament_id
     or new.account_id is distinct from old.account_id then
    raise exception 'a player row cannot be moved between tournaments or accounts';
  end if;
  return new;
end;
$$;

create trigger players_self_update_guard
before update on public.players
for each row execute function public.guard_player_self_update();

-- An entry that is already in a generated draw must not lose or swap a player: results
-- and bracket progression hang off it. (Withdrawal is the correct verb after the draw.)
-- The ORGANISER is exempt — a day-of partner substitution is a real thing they must be
-- able to do; it is only players who are stopped.
create or replace function public.guard_entry_players_after_draw()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_entry uuid; v_event uuid; v_drawn int;
begin
  if public.is_tournament_admin() then return coalesce(new, old); end if;
  v_entry := coalesce(new.entry_id, old.entry_id);
  select e.event_id into v_event from public.entries e where e.id = v_entry;
  select count(*) into v_drawn from public.matches m where m.event_id = v_event;
  if v_drawn > 0 then
    raise exception 'the draw for this event has been generated — withdraw the entry instead of changing its players';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger entry_players_draw_guard
before insert or delete on public.entry_players
for each row execute function public.guard_entry_players_after_draw();

-- ---------------------------------------------------------------- player-side RPCs

create or replace function public.upsert_my_profile(
  p_full_name text, p_gender text, p_email text,
  p_date_of_birth date default null, p_phone text default null,
  p_dupr_id text default null, p_dupr_rating numeric default null,
  p_self_rating numeric default null)
returns public.player_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.player_accounts;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into public.player_accounts as a
    (user_id, full_name, gender, email, date_of_birth, phone, dupr_id, dupr_rating, self_rating)
  values (auth.uid(), trim(p_full_name), p_gender, lower(trim(p_email)),
          p_date_of_birth, p_phone, p_dupr_id, p_dupr_rating, p_self_rating)
  on conflict (user_id) do update set
    full_name = excluded.full_name, gender = excluded.gender, email = excluded.email,
    date_of_birth = excluded.date_of_birth, phone = excluded.phone,
    dupr_id = excluded.dupr_id, dupr_rating = excluded.dupr_rating,
    self_rating = excluded.self_rating, updated_at = now()
  returning * into v_row;

  -- keep tournament player rows in step with the profile
  update public.players p
     set name = v_row.full_name, gender = v_row.gender,
         email = v_row.email, date_of_birth = v_row.date_of_birth
   where p.account_id = v_row.user_id;

  return v_row;
end;
$$;

-- Find a partner by email WITHOUT exposing the account table (no enumeration of
-- profiles, no ratings leak — just enough to confirm "yes, that's them").
create or replace function public.find_partner(p_email text)
returns table (user_id uuid, full_name text, gender text)
language sql
security definer
set search_path = ''
as $$
  select a.user_id, a.full_name, a.gender
  from public.player_accounts a
  where lower(a.email) = lower(trim(p_email))
    and auth.uid() is not null
    and a.user_id <> auth.uid();
$$;

-- Ensure the signed-in account has a player row in this tournament.
create or replace function public.ensure_player(p_tournament uuid, p_account uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_a public.player_accounts;
begin
  select * into v_a from public.player_accounts where user_id = p_account;
  if v_a.user_id is null then raise exception 'no player profile for that account'; end if;

  select id into v_id from public.players
   where tournament_id = p_tournament and account_id = p_account;
  if v_id is not null then return v_id; end if;

  insert into public.players (tournament_id, name, gender, email, account_id, date_of_birth)
  values (p_tournament, v_a.full_name, v_a.gender, v_a.email, p_account, v_a.date_of_birth)
  returning id into v_id;
  return v_id;
end;
$$;

-- Eligibility: returns null when fine, else the human-readable reason.
create or replace function public.eligibility_problem(p_event uuid, p_account uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ev public.events; t public.tournaments; a public.player_accounts;
  v_rating numeric; v_age int;
begin
  select * into ev from public.events where id = p_event;
  select * into t from public.tournaments where id = ev.tournament_id;
  select * into a from public.player_accounts where user_id = p_account;
  if a.user_id is null then return 'Complete your player profile first.'; end if;

  if ev.category = 'mens'   and a.gender = 'female' then
    return 'This is a men''s event.'; end if;
  if ev.category = 'womens' and a.gender = 'male' then
    return 'This is a women''s event.'; end if;

  v_rating := public.account_rating(p_account, ev.seeding_rating_source);
  if ev.max_rating is not null then
    if v_rating is null then
      return 'This event has a ' || ev.max_rating || ' rating ceiling — add your rating to your profile.';
    end if;
    if v_rating > ev.max_rating then
      return 'Your rating (' || v_rating || ') is above this event''s ' || ev.max_rating
             || ' ceiling. You may play up a band, never down.';
    end if;
  end if;

  v_age := public.age_for_tournament(a.date_of_birth, t.start_date);
  if ev.min_age is not null then
    if v_age is null then return 'This is an age-banded event — add your date of birth to your profile.'; end if;
    if v_age < ev.min_age then
      return 'This event is for players aged ' || ev.min_age || '+ (age as of 31 Dec ' ||
             extract(year from t.start_date)::int || ').'; end if;
  end if;
  if ev.max_age is not null and v_age is not null and v_age > ev.max_age then
    return 'This event is for players aged ' || ev.max_age || ' and under.';
  end if;

  if exists (
    select 1 from public.entries en
    join public.entry_players ep on ep.entry_id = en.id
    join public.players p on p.id = ep.player_id
    where en.event_id = p_event and p.account_id = p_account and en.status <> 'withdrawn'
  ) then
    return 'You already have an entry in this event.';
  end if;

  return null;
end;
$$;

-- Register the signed-in player for an event, optionally naming a partner by email.
-- Creates: player row(s) → entry → entry_players → invitation → fee rows.
create or replace function public.register_for_event(p_event uuid, p_partner_email text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ev public.events; t_id uuid; v_fee int; v_curr text;
  my_player uuid; v_entry uuid; v_problem text;
  partner_acct uuid; partner_gender text; partner_player uuid;
  my_rating numeric; partner_rating numeric;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into ev from public.events where id = p_event;
  if ev.id is null then raise exception 'unknown event'; end if;
  t_id := ev.tournament_id;

  if not public.registration_is_open(t_id) then
    raise exception 'online entry is not open for this tournament';
  end if;

  v_problem := public.eligibility_problem(p_event, me);
  if v_problem is not null then raise exception '%', v_problem; end if;

  if ev.discipline = 'singles' and p_partner_email is not null then
    raise exception 'singles events do not take a partner';
  end if;

  -- partner checks before anything is written
  if p_partner_email is not null then
    select user_id, gender into partner_acct, partner_gender
      from public.player_accounts where lower(email) = lower(trim(p_partner_email));
    if partner_acct is not null then
      if partner_acct = me then raise exception 'you cannot partner yourself'; end if;
      v_problem := public.eligibility_problem(p_event, partner_acct);
      if v_problem is not null then
        raise exception 'Your partner cannot enter this event: %', v_problem; end if;
      if ev.category = 'mixed' then
        if partner_gender = (select gender from public.player_accounts where user_id = me) then
          raise exception 'a mixed pair needs one man and one woman';
        end if;
      end if;
      if ev.combined_rating_max is not null then
        my_rating      := public.account_rating(me, ev.seeding_rating_source);
        partner_rating := public.account_rating(partner_acct, ev.seeding_rating_source);
        if my_rating is null or partner_rating is null then
          raise exception 'this event caps combined rating at % — both players need a rating on file', ev.combined_rating_max;
        end if;
        if my_rating + partner_rating > ev.combined_rating_max then
          raise exception 'combined rating %.2f exceeds this event''s cap of %',
            my_rating + partner_rating, ev.combined_rating_max;
        end if;
      end if;
    end if;
  elsif ev.discipline = 'doubles' then
    if not coalesce((select allow_partner_tbc from public.tournament_settings where tournament_id = t_id), true) then
      raise exception 'this tournament requires you to name your partner when you enter';
    end if;
  end if;

  my_player := public.ensure_player(t_id, me);

  insert into public.entries (event_id, status, created_by_account)
    values (p_event, 'incomplete', me) returning id into v_entry;
  insert into public.entry_players (entry_id, player_id) values (v_entry, my_player);

  v_fee  := ev.entry_fee_pence;
  select currency into v_curr from public.tournaments where id = t_id;
  insert into public.entry_payments (entry_id, player_id, account_id, amount_pence, currency, status)
    values (v_entry, my_player, me, v_fee, v_curr,
            case when v_fee = 0 then 'waived' else 'pending' end);

  if p_partner_email is not null then
    insert into public.entry_invitations (entry_id, invited_by, invited_email, invited_account)
      values (v_entry, me, lower(trim(p_partner_email)), partner_acct);
    -- an existing account gets a player row immediately so the organiser can see the pair
    if partner_acct is not null then
      partner_player := public.ensure_player(t_id, partner_acct);
    end if;
  end if;

  perform public.recalc_entry_status(v_entry);
  return v_entry;
end;
$$;

-- Accept or decline a partner invitation (by token from the email link, or by being
-- the invited account).
create or replace function public.respond_to_invitation(p_token text, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv public.entry_invitations; ev public.events; t_id uuid;
  my_email text; my_gender text; other_gender text;
  my_player uuid; v_problem text; v_fee int; v_curr text;
  my_rating numeric; other_rating numeric; other_acct uuid;
begin
  if me is null then raise exception 'sign in first'; end if;
  select * into inv from public.entry_invitations where token = p_token;
  if inv.id is null then raise exception 'that invitation link is not valid'; end if;
  if inv.status <> 'pending' then raise exception 'that invitation has already been %', inv.status; end if;

  select lower(email), gender into my_email, my_gender
    from public.player_accounts where user_id = me;
  if my_email is null then raise exception 'complete your player profile first'; end if;
  if inv.invited_account is not null and inv.invited_account <> me then
    raise exception 'that invitation was sent to someone else';
  end if;
  if inv.invited_account is null and lower(inv.invited_email) <> my_email then
    raise exception 'that invitation was sent to %', inv.invited_email;
  end if;

  if not p_accept then
    update public.entry_invitations
       set status = 'declined', responded_at = now(), invited_account = me
     where id = inv.id;
    return inv.entry_id;
  end if;

  select ev2.* into ev from public.events ev2
    join public.entries en on en.event_id = ev2.id where en.id = inv.entry_id;
  t_id := ev.tournament_id;
  if not public.registration_is_open(t_id) then
    raise exception 'online entry has closed for this tournament';
  end if;

  v_problem := public.eligibility_problem(ev.id, me);
  if v_problem is not null then raise exception '%', v_problem; end if;

  select p.account_id into other_acct
    from public.entry_players ep join public.players p on p.id = ep.player_id
   where ep.entry_id = inv.entry_id limit 1;
  select gender into other_gender from public.player_accounts where user_id = other_acct;
  if ev.category = 'mixed' and other_gender = my_gender then
    raise exception 'a mixed pair needs one man and one woman';
  end if;
  if ev.combined_rating_max is not null then
    my_rating    := public.account_rating(me, ev.seeding_rating_source);
    other_rating := public.account_rating(other_acct, ev.seeding_rating_source);
    if my_rating is null or other_rating is null
       or my_rating + other_rating > ev.combined_rating_max then
      raise exception 'this pair exceeds the event''s combined rating cap of %', ev.combined_rating_max;
    end if;
  end if;

  my_player := public.ensure_player(t_id, me);
  insert into public.entry_players (entry_id, player_id) values (inv.entry_id, my_player);

  v_fee := ev.entry_fee_pence;
  select currency into v_curr from public.tournaments where id = t_id;
  insert into public.entry_payments (entry_id, player_id, account_id, amount_pence, currency, status)
    values (inv.entry_id, my_player, me, v_fee, v_curr,
            case when v_fee = 0 then 'waived' else 'pending' end)
    on conflict (entry_id, player_id) do nothing;

  update public.entry_invitations
     set status = 'accepted', responded_at = now(), invited_account = me
   where id = inv.id;

  perform public.recalc_entry_status(inv.entry_id);
  return inv.entry_id;
end;
$$;

-- Swap partners: cancels any pending invite, removes an accepted partner (releasing
-- their fee to refundable) and invites the new one.
create or replace function public.change_partner(p_entry uuid, p_partner_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ev public.events; t_id uuid; v_owner boolean;
  old_player uuid; old_account uuid; new_acct uuid; new_gender text; my_gender text;
begin
  if me is null then raise exception 'sign in first'; end if;
  select ev2.* into ev from public.events ev2
    join public.entries en on en.event_id = ev2.id where en.id = p_entry;
  if ev.id is null then raise exception 'unknown entry'; end if;
  t_id := ev.tournament_id;

  select exists (
    select 1 from public.entry_players ep join public.players p on p.id = ep.player_id
     where ep.entry_id = p_entry and p.account_id = me) into v_owner;
  if not v_owner then raise exception 'that is not your entry'; end if;

  if not public.registration_is_open(t_id) then
    raise exception 'online changes have closed — contact the organiser';
  end if;
  if exists (select 1 from public.matches m where m.event_id = ev.id) then
    raise exception 'the draw has been made — contact the organiser to change a partner';
  end if;

  select user_id, gender into new_acct, new_gender
    from public.player_accounts where lower(email) = lower(trim(p_partner_email));
  if new_acct = me then raise exception 'you cannot partner yourself'; end if;
  select gender into my_gender from public.player_accounts where user_id = me;
  if new_acct is not null then
    if ev.category = 'mixed' and new_gender = my_gender then
      raise exception 'a mixed pair needs one man and one woman'; end if;
    if public.eligibility_problem(ev.id, new_acct) is not null then
      raise exception 'Your new partner cannot enter this event: %',
        public.eligibility_problem(ev.id, new_acct); end if;
  end if;

  update public.entry_invitations set status = 'superseded', responded_at = now()
   where entry_id = p_entry and status = 'pending';

  select ep.player_id, p.account_id into old_player, old_account
    from public.entry_players ep join public.players p on p.id = ep.player_id
   where ep.entry_id = p_entry and p.account_id is distinct from me
   limit 1;
  if old_player is not null then
    delete from public.entry_players where entry_id = p_entry and player_id = old_player;
    update public.entry_payments
       set status = case when status = 'paid' then 'refunded' else 'failed' end,
           refunded_at = case when status = 'paid' then now() else null end
     where entry_id = p_entry and player_id = old_player;
  end if;

  insert into public.entry_invitations (entry_id, invited_by, invited_email, invited_account)
    values (p_entry, me, lower(trim(p_partner_email)), new_acct);
  if new_acct is not null then perform public.ensure_player(t_id, new_acct); end if;

  perform public.recalc_entry_status(p_entry);
  return p_entry;
end;
$$;

-- Withdraw my entry (the whole entry). Refundable before the deadline.
create or replace function public.withdraw_my_entry(p_entry uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t_id uuid; v_deadline timestamptz; v_owner boolean; v_refund boolean;
begin
  if me is null then raise exception 'sign in first'; end if;
  select exists (
    select 1 from public.entry_players ep join public.players p on p.id = ep.player_id
     where ep.entry_id = p_entry and p.account_id = me) into v_owner;
  if not v_owner then raise exception 'that is not your entry'; end if;

  select ev.tournament_id, t.withdrawal_deadline into t_id, v_deadline
    from public.entries en join public.events ev on ev.id = en.event_id
    join public.tournaments t on t.id = ev.tournament_id
   where en.id = p_entry;

  v_refund := v_deadline is null or now() <= v_deadline;

  update public.entries set status = 'withdrawn', withdrawn_at = now() where id = p_entry;
  update public.entry_invitations set status = 'cancelled', responded_at = now()
   where entry_id = p_entry and status = 'pending';
  if v_refund then
    update public.entry_payments set status = 'refunded', refunded_at = now()
     where entry_id = p_entry and status = 'paid';
  end if;

  -- capacity freed: promote the longest-waiting ready waitlister
  update public.entries set status = 'entered'
   where id = (
     select e2.id from public.entries e2
      where e2.event_id = (select event_id from public.entries where id = p_entry)
        and e2.status = 'waitlisted'
      order by e2.created_at limit 1)
   and exists (select 1 from public.events ev2
                where ev2.id = (select event_id from public.entries where id = p_entry)
                  and ev2.max_entries is not null);

  return case when v_refund then 'withdrawn_refunded' else 'withdrawn_no_refund' end;
end;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.player_accounts   enable row level security;
alter table public.entry_invitations enable row level security;
alter table public.entry_payments    enable row level security;

-- accounts: yours only (partner lookup goes through find_partner), admins see all
create policy "own account" on public.player_accounts for select using (user_id = auth.uid());
create policy "admin read"  on public.player_accounts for select using (public.is_tournament_admin());
create policy "own account update" on public.player_accounts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- invitations: the sender, the invited account, and admins. (Token lookup is done by
-- respond_to_invitation, which is SECURITY DEFINER — no need to expose rows by token.)
create policy "mine" on public.entry_invitations for select
  using (invited_by = auth.uid() or invited_account = auth.uid()
         or public.is_tournament_admin());
create policy "admin write" on public.entry_invitations for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());

-- payments: your own, plus admins (an organiser must see who has paid)
create policy "mine" on public.entry_payments for select
  using (account_id = auth.uid() or public.is_tournament_admin());
create policy "admin write" on public.entry_payments for all
  using (public.is_tournament_admin()) with check (public.is_tournament_admin());

-- players may update their own tournament player row (guard trigger blocks check-in)
create policy "own player row" on public.players for update
  using (account_id = auth.uid()) with check (account_id = auth.uid());

-- ---------------------------------------------------------------- views

-- What a signed-in player sees on "my entries" — one row per entry they belong to.
create view public.my_entries
with (security_invoker = on) as
select
  en.id as entry_id, en.status, en.seed, en.withdrawn_at,
  ev.id as event_id, ev.name as event_name, ev.discipline, ev.category,
  ev.band_label, ev.entry_fee_pence,
  t.id as tournament_id, t.name as tournament_name, t.start_date, t.venue,
  t.currency, t.withdrawal_deadline, t.registration_closes_at,
  (select count(*) from public.entry_players ep2 where ep2.entry_id = en.id) as roster,
  case when ev.discipline = 'singles' then 1 else 2 end as roster_needed,
  (select string_agg(p2.name, ' & ' order by p2.name)
     from public.entry_players ep3 join public.players p2 on p2.id = ep3.player_id
    where ep3.entry_id = en.id) as line_up,
  (select i.status from public.entry_invitations i
    where i.entry_id = en.id order by i.created_at desc limit 1) as invite_status,
  (select i.invited_email from public.entry_invitations i
    where i.entry_id = en.id order by i.created_at desc limit 1) as invited_email,
  (select pay.status from public.entry_payments pay
    where pay.entry_id = en.id and pay.account_id = auth.uid()) as my_payment_status,
  exists (select 1 from public.matches m where m.event_id = ev.id) as draw_made
from public.entries en
join public.events ev on ev.id = en.event_id
join public.tournaments t on t.id = ev.tournament_id
where exists (
  select 1 from public.entry_players ep join public.players p on p.id = ep.player_id
   where ep.entry_id = en.id and p.account_id = auth.uid());

-- Public event listing with live entry counts + spaces left.
create view public.event_openings
with (security_invoker = on) as
select ev.id as event_id, ev.tournament_id, ev.name, ev.discipline, ev.category,
       ev.band_label, ev.entry_fee_pence, ev.max_entries,
       ev.max_rating, ev.min_rating, ev.combined_rating_max, ev.min_age, ev.max_age,
       count(en.id) filter (where en.status = 'entered')    as entered,
       count(en.id) filter (where en.status = 'waitlisted') as waitlisted,
       count(en.id) filter (where en.status = 'incomplete') as incomplete,
       case when ev.max_entries is null then null
            else greatest(0, ev.max_entries - count(en.id) filter (where en.status = 'entered'))
       end as spaces_left
from public.events ev
left join public.entries en on en.event_id = ev.id
group by ev.id;
