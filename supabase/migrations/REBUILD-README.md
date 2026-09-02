# Clean migration rebuild — warehouse vs whole-app

**Status:** work in progress (generated autonomously overnight 2026-09-02). **Review before use.**

## Why
The active `supabase/migrations/` folder holds **806** incremental `.sql` files. This
rebuild produces a **clean, consolidated schema baseline**, split into two domains, so the
schema can be read/rebuilt from one place instead of replaying 806 diffs.

Two new folders (organizational — the Supabase CLI only auto-applies the flat, timestamp-named
`.sql` files at the top level of `migrations/`, so these subfolders are **not** auto-applied):

- **`warehouse/`** — the inventory / purchase / sales / warehouse / custody / consumption /
  tools / damaged-stock / approvals schema. Generated **from the live (staging) database
  catalog**, which currently holds exactly this domain (verified: 0 module tables present).
  Authoritative for what is actually deployed.
- **`whole-app/`** — the full app (warehouse **plus** the field-service modules: team-leader +
  TL invoices, orders, contracts, quotations, contact-centre, calendar, QC, employees, chat,
  promotions…). `schema.sql` was extracted from a real backup —
  `db_cluster-23-08-2026@10-59-22.backup.gz`, a plain-SQL `pg_dumpall` dated 2026-08-23 — so it
  reflects the actual current tables/columns (186 public tables = 114 warehouse + ~72 module).
  Public schema only; roles/ownership/session cruft stripped, RLS + grants kept. See its README.

## Source & method
- Warehouse files are reconstructed from the live catalog using Postgres' own DDL emitters
  (`pg_get_functiondef`, `pg_get_triggerdef`, `pg_get_indexdef`, `pg_get_viewdef`,
  `pg_get_constraintdef`) plus `pg_policies` / `information_schema` for tables, enums, RLS.
- Live schema size: 114 tables, 389 functions, 377 policies, 141 triggers, 64 enums, 13 views.

## File layout (per folder)
```
00_extensions.sql   01_enums.sql   02_tables.sql   03_indexes.sql
04_functions.sql    05_triggers.sql   06_rls_policies.sql   07_views.sql
```

## ⚠️ VERIFICATION REQUIRED
This baseline is **generated, not yet test-applied** (Docker was unavailable, so
`supabase db dump` / a fresh-DB apply could not run here). Before trusting it:
1. `supabase start` (or a scratch Postgres) and apply the `warehouse/` files in numeric order.
2. Diff the result against the live schema.
3. Fix any ordering / missing-grant / extension gaps, then repeat for `whole-app/`.

Nothing here modifies the existing 806 migrations, and nothing was applied to any database.
