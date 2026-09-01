# warehouse — clean schema baseline

**Status: generated 2026-09-02. UNVERIFIED — test-apply before use (see below).**

A consolidated, readable reconstruction of the **deployed warehouse schema** — the
inventory / purchase / sales / warehouse / custody / consumption / tools / damaged-stock /
approvals domain. It replaces having to read 800+ incremental migrations to understand the
schema.

## Source
Reconstructed from the **live (staging) database** `public` catalog on 2026-09-02, using
Postgres' own DDL emitters (`pg_get_functiondef`, `pg_get_triggerdef`, `pg_get_indexdef`,
`pg_get_viewdef`, `pg_get_constraintdef`) plus `pg_policies` / `pg_catalog` for tables, enums,
and RLS. The live DB currently holds exactly this domain (0 field-service module tables), so it
is authoritative for what is actually deployed.

Live schema size: **114 tables · 389 functions · 377 policies · 141 triggers · 64 enums · 13 views**.

## Files (apply in this numeric order)
| # | file | contents |
|---|------|----------|
| 00 | `00_extensions.sql` | `CREATE EXTENSION` for every non-`plpgsql` extension |
| 01 | `01_enums.sql` | `CREATE TYPE … AS ENUM` (64) |
| 02 | `02_tables.sql` | `CREATE TABLE` with columns + PK/UNIQUE/CHECK; **foreign keys added at the end** as `ALTER TABLE … ADD CONSTRAINT` so table order doesn't matter |
| 03 | `03_indexes.sql` | non-PK/‑unique indexes (`pg_get_indexdef`) |
| 04 | `04_functions.sql` | all functions (`pg_get_functiondef`) — 389 |
| 05 | `05_triggers.sql` | all user triggers (`pg_get_triggerdef`) |
| 06 | `06_rls_policies.sql` | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + every `CREATE POLICY` |
| 07 | `07_views.sql` | `CREATE OR REPLACE VIEW` (13) |

## ⚠️ Verify before trusting
This was reconstructed from the catalog (Docker/`supabase db dump` wasn't available in the
session that generated it), so it is **not yet test-applied**. To validate:
1. `supabase start` (or a scratch Postgres).
2. Apply `00 → 07` in order on an empty DB.
3. Diff the result against the live schema; fix any ordering / grant / extension gaps.

Known things to check: object **grants** (GRANT/REVOKE) and any non-`public` schema objects are
not included; the functions/triggers/policies are byte-exact from the catalog, but the
`CREATE TABLE`s and policies were *constructed* (not `pg_dump`), so give those the closest look.

Nothing here was applied to any database, and the existing top-level migrations are untouched.
