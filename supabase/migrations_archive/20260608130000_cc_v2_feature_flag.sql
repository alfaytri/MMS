-- Add a generic feature_flags text[] to profiles for per-user feature gating.
-- Used by cc-v2 to roll out the new UI behind a contact_centre_v2 flag.
-- Generic so future modules can reuse the same column.

alter table public.profiles
  add column if not exists feature_flags text[] not null default '{}';

create index if not exists profiles_feature_flags_idx
  on public.profiles using gin (feature_flags);
