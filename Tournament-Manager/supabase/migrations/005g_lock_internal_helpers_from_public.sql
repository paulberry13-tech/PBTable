-- Postgres grants EXECUTE to PUBLIC by default, so revoking from anon/authenticated
-- alone changes nothing. Revoke from PUBLIC, then grant back only where needed.
revoke execute on function public.eligibility_problem(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.ensure_player(uuid, uuid)       from public, anon, authenticated;
revoke execute on function public.account_rating(uuid, text)      from public, anon, authenticated;
revoke execute on function public.recalc_entry_status(uuid)       from public, anon, authenticated;
revoke execute on function public.age_for_tournament(date, date)  from public, anon, authenticated;
