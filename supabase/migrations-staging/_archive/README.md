# Archived migrations — DO NOT REPLAY

The SQL files in this folder were applied to the staging database once. They
are kept for historical reference only.

## Rules

- **Never** copy or move these files into `supabase/migrations/`. The Supabase
  CLI (`npx supabase db push`) would attempt to re-run them, which will fail
  or corrupt state — many of them do things like `INSERT INTO storage.buckets`
  or `CREATE POLICY` that error on second execution.
- **Never** reference these paths from `supabase/config.toml` or any tooling.
- To resurrect logic from one of these files, extract the SQL you need into a
  fresh, timestamped file under `supabase/migrations/`.

## Why this folder exists

Staging drifted from dev during the deploy/warehouse-shipping window, so these
migrations were archived here rather than in the primary migrations folder.
See `AGENTS.md` → *Database Migrations* for the current policy.
