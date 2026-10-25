-- ============================================================================
-- PBTable — terms acceptance tracking
-- ============================================================================
-- PURPOSE: record which version of the Terms of Service + DPA bundle a club
--          accepted, and when, so we can prove what each club agreed to.
--
-- APPLY FROM: the PRODUCTION session (Desktop\PBTable-Production).
-- DO NOT apply from the drafting/website session — handed over for review.
--
-- Target: existing public.subscriptions table (natural home — acceptance
-- happens at subscription checkout; the accepting person is already captured
-- in subscriptions.contact_name / contact_email).
--
-- One tickbox covers BOTH the Terms of Service and the DPA, so a single
-- bundled version string (e.g. '1.0') is enough.
-- ============================================================================

alter table public.subscriptions
  add column if not exists terms_version     text,
  add column if not exists terms_accepted_at timestamptz;

comment on column public.subscriptions.terms_version is
  'Version of the PBTable Terms of Service + DPA bundle the club accepted (e.g. ''1.0'').';
comment on column public.subscriptions.terms_accepted_at is
  'UTC timestamp the club accepted the terms via the checkout tickbox.';

-- Optional backfill for the retrospective clubs (Task 4) once they have
-- click-/reply-accepted — set the real dates before running:
--
--   update public.subscriptions
--     set terms_version = '1.0', terms_accepted_at = timestamptz '<DATE THEY ACCEPTED>'
--   where club_id = '<swindon club_id>';
--
--   update public.subscriptions
--     set terms_version = '1.0', terms_accepted_at = timestamptz '<DATE THEY ACCEPTED>'
--   where club_id = '<melksham club_id>';
