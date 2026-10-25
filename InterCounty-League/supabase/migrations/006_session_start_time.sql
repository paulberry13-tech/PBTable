-- Inter-County League — 006: optional start time on a session
--
-- `session_date` answers "which day"; this answers "what time". Nullable on purpose —
-- a session can be pencilled in for a date before the venue slot is confirmed, and the
-- public site simply omits the time until one is set.

alter table sessions add column start_time time;
