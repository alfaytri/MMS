# whole-app — clean schema baseline (warehouse + field-service modules)

**Status: regenerated 2026-09-02 byte-exact from the LIVE whole-app database, AFTER its warehouse
domain was repaired to match current staging. UNVERIFIED (not test-applied — no Docker). Read before use.**

## What this is
A consolidated, readable baseline for the **full application** — the warehouse domain
**plus** the field-service modules (contracts, orders, quotations, TL invoices, QC, employees,
chat, promotions, services, subscriptions, teams, vehicles, vouchers…). It replaces having to
read 800+ incremental migrations to understand the schema.

Split into numbered files, applied in order (same layout as `../warehouse/`):

| # | file | contents | count |
|---|------|----------|-------|
| 00 | `00_extensions.sql` | `CREATE EXTENSION` (non-`plpgsql`) | 5 |
| 01 | `01_enums.sql` | `CREATE TYPE … AS ENUM` | 74 |
| 02 | `02_tables.sql` | sequences (15) → `CREATE TABLE` with inline PK/UNIQUE/CHECK (187) → sequence ownership → foreign keys (467) | 187 tables |
| 03 | `03_indexes.sql` | non-constraint-backed indexes (`pg_get_indexdef`) | 380 |
| 04 | `04_functions.sql` | all functions (`pg_get_functiondef`); starts with `SET check_function_bodies = false;` | 423 |
| 05 | `05_triggers.sql` | user triggers (`pg_get_triggerdef`) | 141 |
| 06 | `06_rls_policies.sql` | `ENABLE ROW LEVEL SECURITY` (113) + `CREATE POLICY` (378) | 378 policies |
| 07 | `07_views.sql` | `CREATE OR REPLACE VIEW` (`pg_get_viewdef`) | 18 |

## Source & method
- **Source:** the **live whole-app database** `wkmvjxxmzstsvahuiwsz` (public schema), read on
  **2026-09-02** via `supabase db query` using Postgres' own DDL emitters (`pg_get_functiondef`,
  `pg_get_triggerdef`, `pg_get_indexdef`, `pg_get_viewdef`, `pg_get_constraintdef`) plus
  `pg_catalog` / `pg_policies` for tables, enums and RLS.
- Byte-exact from the catalog for functions/triggers/indexes/views/policies. `CREATE TABLE`s are
  *constructed* from `pg_attribute`/`pg_constraint` (no `pg_get_tabledef` exists), but every column
  type comes from `format_type()` and every default/constraint from `pg_get_expr`/
  `pg_get_constraintdef` — so they read like `pg_dump` output.

## Currency — warehouse repaired to match staging (2026-09-02)
Earlier this baseline was one warehouse table + a batch of warehouse logic behind staging. On
2026-09-02 the whole-app DB's **warehouse domain was reconciled to current staging** (added
`inventory_category_divisions`, 11 columns, 83 functions, 6 triggers, 135 indexes, constraints,
policies, a view) while **keeping every field-service module object**. This baseline is generated
from that repaired DB, so:

- **Warehouse portion now equals current staging** — 114/114 warehouse tables, 0 function/trigger/
  index/policy/constraint drift (verified by re-diff). `../warehouse/` and the warehouse subset of
  this file are in sync.
- **Naming is current** — `user_data` (not `profiles`), all renames applied.
- **187 public tables = 114 warehouse + 73 module.**

The repair SQL that was applied to the DB is kept for the record at
`_repairs/2026-09-02-warehouse-sync-to-current.sql`.

## Apply order & safety
Apply `00 → 07` in numeric order. Safe as generated: no table default/CHECK references a user
function (so tables-before-functions is fine); `04` sets `check_function_bodies = false` first;
FKs are added at the end of `02`.

## ⚠️ Not test-applied
Reconstructed cleanly and count-validated (every object count matches the live catalog exactly),
but not yet run against a fresh database (no Docker / `supabase start` in the generating session).
To fully verify: `supabase start`, apply `00 → 07`, resolve any ordering/extension/grant gaps, and
diff against `wkmvjxxmzstsvahuiwsz`. Grants and non-`public` objects are out of scope.
