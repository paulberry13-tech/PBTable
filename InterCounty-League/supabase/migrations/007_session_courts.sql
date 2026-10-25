-- Inter-County League — 007: courts available at a session
--
-- Planning aid only — nothing about results depends on it. It exists so the admin
-- can see, while picking teams, whether a session actually fits in a day:
--   a meeting is 4 games but only 2 can run at once (each player plays 2 of the 4),
--   and at most floor(teams/2) meetings run concurrently, so courts beyond
--   2 * floor(teams/2) buy nothing. Duration ≈ games / usable courts × game length.
--
-- Nullable: a session can be booked before the court allocation is known.

alter table sessions add column courts smallint check (courts > 0);
