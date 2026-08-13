-- ─── Extensions — MUST run before the schema baseline ────────────────────────
--
-- The staging baseline (next file) is a schema-only dump taken with an EMPTY
-- search_path, so every object reference in it is schema-qualified
-- (extensions.gen_random_uuid(), net.http_post(), vault.*, …). Those schemas
-- and functions only exist once their extensions are installed — so the
-- extensions have to exist FIRST, which is what this file guarantees.
--
-- Captured from a live build (project optishfnnctrhffpoywg, schema-identical to
-- staging at ledger 20260820001300, 2026-08-12). On a Supabase target these are
-- normally pre-enabled, so every statement is idempotent and a no-op there; on a
-- bare Postgres they install what the schema needs. Order is irrelevant between
-- them, but all must precede the baseline.

create schema if not exists extensions;

create extension if not exists "pgcrypto"           with schema extensions;  -- gen_random_uuid(), digest(), hmac()
create extension if not exists "uuid-ossp"          with schema extensions;  -- uuid_generate_v4()
create extension if not exists "pg_net"             with schema extensions;  -- net.http_post() — storage-cleanup + webhooks
create extension if not exists "pg_stat_statements" with schema extensions;  -- query statistics
create extension if not exists "supabase_vault";                              -- vault.* secrets (manages its own `vault` schema)

-- pg_cron is referenced by two scheduled-job migrations but is NOT enabled on
-- the current live builds, so it is intentionally left out here. Enable it ONLY
-- if you actually run scheduled jobs (and your plan permits pg_cron):
--   create extension if not exists pg_cron;
