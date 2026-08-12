-- These two take an arbitrary account id, so exposing them over /rest/v1/rpc would let a
-- caller probe someone else's rating ("your rating 4.20 is above...") or create player
-- rows on their behalf. They are internal helpers for the player RPCs, which always pass
-- auth.uid() themselves. The remaining SECURITY DEFINER advisor warnings are accepted:
-- those functions ARE the player API and each one authenticates the caller internally.
revoke execute on function public.eligibility_problem(uuid, uuid) from anon, authenticated;
revoke execute on function public.ensure_player(uuid, uuid)       from anon, authenticated;
revoke execute on function public.account_rating(uuid, text)      from anon, authenticated;
revoke execute on function public.recalc_entry_status(uuid)       from anon, authenticated;
