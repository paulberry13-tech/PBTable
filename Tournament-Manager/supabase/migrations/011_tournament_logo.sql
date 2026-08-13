-- Per-tournament branding (Score7-inspired). Optional logo, stored as a client-resized
-- data URL (max ~256px) directly on the tournaments row — no storage bucket needed, so it
-- travels with the row and needs no extra infra. Shown on the public, entry and display
-- surfaces and the admin overview. Nullable + backward-compatible: existing tournaments and
-- all read/write RLS are unaffected (public already reads tournaments; admins already update
-- the row via is_tournament_admin()).
alter table public.tournaments add column if not exists logo_url text;
comment on column public.tournaments.logo_url is 'Optional per-tournament logo, stored as a client-resized data URL (max ~256px). Shown on public, entry and display surfaces.';
