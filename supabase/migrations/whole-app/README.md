# whole-app — clean schema baseline (warehouse + field-service modules)

**Status: regenerated 2026-09-02 byte-exact from the LIVE whole-app database. UNVERIFIED (not test-applied — no Docker in the generating session). Read before use.**

## What this is
A consolidated, readable baseline for the **full application** — the warehouse domain
**plus** the field-service modules (contracts, orders, quotations, TL invoices, QC,
employees, chat, promotions, services, subscriptions, teams, vehicles, vouchers…). It replaces
having to read 800+ incremental migrations to understand the schema.

Split into numbered files, applied in order (same layout as `../warehouse/`):

| # | file | contents | count |
|---|------|----------|-------|
| 00 | `00_extensions.sql` | `CREATE EXTENSION` (non-`plpgsql`) | 5 |
| 01 | `01_enums.sql` | `CREATE TYPE … AS ENUM` | 74 |
| 02 | `02_tables.sql` | sequences (15) → `CREATE TABLE` with inline PK/UNIQUE/CHECK (186) → sequence ownership → foreign keys (460) | 186 tables |
| 03 | `03_indexes.sql` | non-constraint-backed indexes (`pg_get_indexdef`) | 245 |
| 04 | `04_functions.sql` | all functions (`pg_get_functiondef`); starts with `SET check_function_bodies = false;` | 400 |
| 05 | `05_triggers.sql` | user triggers (`pg_get_triggerdef`) | 135 |
| 06 | `06_rls_policies.sql` | `ENABLE ROW LEVEL SECURITY` (112) + `CREATE POLICY` (369) | 369 policies |
| 07 | `07_views.sql` | `CREATE OR REPLACE VIEW` (`pg_get_viewdef`) | 18 |

Also: 123 CHECK constraints (inline in 02), 6 generated columns, 0 identity columns.

## Source & method (this is the important change)
- **Source:** the **live current whole-app database** `wkmvjxxmzstsvahuiwsz` (public schema),
  read on **2026-09-02** via `supabase db query` using Postgres' own DDL emitters
  (`pg_get_functiondef`, `pg_get_triggerdef`, `pg_get_indexdef`, `pg_get_viewdef`,
  `pg_get_constraintdef`) plus `pg_catalog` / `pg_policies` for tables, enums and RLS.
- This **supersedes** the previous `schema.sql`, which was extracted from the older Aug-23
  `db_cluster` backup. The backup is no longer needed — the live DB is authoritative and current.
- Functions/triggers/indexes/views/policies are **byte-exact** from the catalog. The
  `CREATE TABLE`s are *constructed* from `pg_attribute`/`pg_constraint` (there is no
  `pg_get_tabledef`), so they get the closest review — but every column type comes from
  `format_type()` and every default/constraint from `pg_get_expr`/`pg_get_constraintdef`,
  i.e. Postgres' own renderers, so they read like `pg_dump` output.

## Currency — verified on the live DB
- **Naming is current.** `user_data` exists; `profiles` is **gone** (checked directly on the
  live DB, not inferred). All prior renames (`so_invoices`, `so_po_returns`, `order_quotations`,
  `company_divisions`, `inventory_item_brand_variants`, `customer_credit_docs`, …) are applied.
- **Table set matches the Aug-23 backup exactly** — 0 tables added or dropped between Aug-23 and
  now. So the module layer has been stable; this regeneration mainly refreshes object *bodies*
  (functions/policies/views) to their current definitions.
- **Warehouse portion is 1 table behind staging.** This live whole-app DB has 113 of the 114
  warehouse tables — it lacks `inventory_category_divisions`, which was added to staging after
  this DB last synced. Treat `../warehouse/` as the source of truth for the warehouse domain
  (114 tables, pulled live from staging); this file is the source of truth for the **73 module
  tables** and for a self-contained full-app baseline.

186 public tables = 113 warehouse + 73 module.

## Apply order & safety
Apply `00 → 07` in numeric order. This is safe as generated:
- No table default or CHECK constraint references a user-defined function (verified: 0 of each),
  so **tables (02) before functions (04) is fine**.
- `04` sets `check_function_bodies = false` first, so SQL-language functions that reference
  views or other functions won't fail on creation-order.
- FKs are added at the end of `02`, so table order within the file doesn't matter.

## ⚠️ Not test-applied
Reconstructed cleanly and count-validated (every object count matches the live catalog exactly),
but **not yet run against a fresh database** (Docker / `supabase start` wasn't available in the
generating session). To fully verify: `supabase start` (or a scratch Postgres), apply `00 → 07`,
resolve any ordering/extension/grant gaps, and diff the result against `wkmvjxxmzstsvahuiwsz`.
Grants (`GRANT`/`REVOKE`) and non-`public` objects are intentionally out of scope.
