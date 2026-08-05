# Staging Migrations (Inventory Build)

This folder is a **reset-clean snapshot** of the staging Supabase project (`mwvblpgbgxipvrevkeff`). Applying its two files to a fresh Supabase project reproduces the staging schema exactly.

## Structure

```
migrations-staging/
├── 00_README.md
├── 20260805000000_staging_baseline.sql   ← full schema (public + storage policies + auth trigger)
├── 20260805000001_staging_seed.sql       ← reference + demo data + storage buckets
└── _archive/                             ← history: old baselines + 251 pre-2026-08-05 delta files
```

### What the baseline contains

- **99 tables** in `public` (all with RLS enabled)
- **261 functions**, **11 views**, **292 policies** in `public`
- **56 policies** on `storage.objects` (Supabase manages the storage tables/types itself, so this file only ships the policies)
- The `bootstrap_first_user_trg` trigger on `auth.users` and its `public.bootstrap_first_user()` function (auto-assigns Admin role to the first authed user)

### What the seed contains

- **Reference data** (dumped from staging): `country_codes`, `currencies`, `custom_roles`, `payment_methods`, `reason_list_categories`, `reason_lists`
- **Demo data**: `companies` (1 row), `company_divisions` (2 rows)
- **Storage buckets**: 17 buckets (idempotent `ON CONFLICT (id) DO NOTHING` — buckets survive a Supabase reset)

The seed does **not** contain user accounts (`user_data`, `auth.users`, `user_custom_roles`), business data (brands, inventory, sales/PO/receival/bill records), or storage objects — those are set up per-deployment.

## Excluded modules (never enter this folder)

- Services / Orders (field service)
- Contracts
- Subscriptions
- Chat / Contact Centre (WATI, Whapi)
- HR Teams / Employees / Vehicles (NOT the same as inventory "teams_places" virtual warehouses)
- Promotions / Vouchers
- QC (Quality Control)
- QuickBooks sync
- Standalone RFQs
- Reminders, Traccar, Tool Assets, Media Downloads

## How to apply to a fresh project

```bash
# 1. Link to the target project
npx supabase link --project-ref <NEW_PROJECT_REF>

# 2. Swap folders so the CLI reads migrations-staging/
mv supabase/migrations supabase/migrations.dev
mv supabase/migrations-staging supabase/migrations
npx supabase db reset --linked --yes
mv supabase/migrations supabase/migrations-staging
mv supabase/migrations.dev supabase/migrations

# 3. Relink to real staging
npx supabase link --project-ref mwvblpgbgxipvrevkeff
```

> **First-time-on-a-dirty-project caveat:** if the target project already has objects that `db reset` can't fully drop (sequences, extension-owned types, etc.), prepend a **one-off** file `00000000000000_prewipe_public.sql` to `supabase/migrations/` before running reset:
> ```sql
> DROP SCHEMA IF EXISTS public CASCADE;
> CREATE SCHEMA public;
> GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
> GRANT ALL ON SCHEMA public TO postgres;
> ```
> Delete the file after the reset completes so it never enters `migrations-staging/`.

## First user

After the reset:
1. Supabase Dashboard → Authentication → **Add User**
2. Use the email matching `.env.local` `ADMIN_BOOTSTRAP_EMAIL`
3. The `bootstrap_first_user_trg` trigger creates the profile in `public.user_data` and assigns the Admin role automatically.

## Rebuild procedure

When staging DB drifts from these files and you want to refresh them:

1. Ensure the CLI is linked to staging (`mwvblpgbgxipvrevkeff`).
2. Dump the `public` schema:
   ```bash
   pg_dump --host=db.<REF>.supabase.co --port=5432 --username=postgres \
     --schema-only --schema=public --no-owner --no-privileges --no-comments \
     -f staging_schema.sql
   ```
3. Dump storage **policies only** (Supabase manages the storage tables/types themselves — do not include them).
4. Dump data-only for the seed tables listed above.
5. Assemble baseline + seed, strip `\restrict` / `\unrestrict` psql client-side commands from the pg_dump output (pg17+ only), and make bucket inserts idempotent with `ON CONFLICT (id) DO NOTHING`.
6. Archive the previous baseline/seed into `_archive/`.
7. Test by running the "How to apply" steps against a scratch Supabase project — confirm zero errors.
8. Update the "Last rebuilt" line below.

## Last rebuilt

**2026-08-05** — rebuilt from a live `pg_dump` of staging (`mwvblpgbgxipvrevkeff`). The previous 2026-07-24 hand-concatenated baseline had a fatal ordering bug (`UPDATE invoices` ran before `CREATE TABLE invoices`) which prevented a fresh reset. The new baseline uses `pg_dump` output directly, so ordering is guaranteed to match the live DB. All 251 pre-2026-08-05 delta migrations that had been mirrored earlier this day were moved into `_archive/` because their effect is fully captured by the new dump. Verified end-to-end by resetting the scratch project (`kfykuifatnmsdcziaybk`) — both migrations applied with zero errors.

2026-07-24 — baseline squashed from 190 per-file migrations + 6 post-2026-07-13 dev delta migrations (excluded chat/orders/teams/calendar/employees migrations). *Retired — had `UPDATE invoices` ordering bug. Preserved in `_archive/20260724100000_staging_baseline.sql` for history.*
