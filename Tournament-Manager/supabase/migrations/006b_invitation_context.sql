-- A partner clicking an invite link is usually signed out and may not even have an
-- account. The token is unguessable and they already hold it, so resolving just enough
-- context to show "X invited you to Y — sign in to accept" leaks nothing new, and it
-- means the link lands on the right tournament instead of a chooser.
create or replace function public.invitation_context(p_token text)
returns table (
  tournament_id uuid, tournament_slug text, tournament_name text,
  start_date date, venue text, event_name text, invited_by_name text,
  invited_email text, still_open boolean)
language sql security definer set search_path = '' as $$
  select t.id, t.slug, t.name, t.start_date, t.venue, ev.name,
         split_part(inviter.full_name, ' ', 1),   -- first name only
         i.invited_email,
         i.status = 'pending'
  from public.entry_invitations i
  join public.entries en on en.id = i.entry_id
  join public.events ev on ev.id = en.event_id
  join public.tournaments t on t.id = ev.tournament_id
  join public.player_accounts inviter on inviter.user_id = i.invited_by
  where i.token = p_token;
$$;
