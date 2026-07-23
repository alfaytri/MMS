# Staging Migrations (Inventory Build)

This folder holds the migrations that build the **inventory / purchase / sales** staging environment.
It is a slimmed mirror of `supabase/migrations/` — modules the staging deploy doesn't ship are stripped out.

## Structure

```
migrations-staging/
├── 00_README.md
├── 20260724100000_staging_baseline.sql   ← full schema in one file
├── 20260724100001_staging_seed.sql       ← demo data (company, divisions, etc.)
└── _archive/                             ← previous per-file migrations (history)
```

* **`20260724100000_staging_baseline.sql`** — the entire staging schema as one squashed SQL file. Built by concatenating all migrations from the previous file-by-file layout (state as of the 2026-07-13 staging reset) plus a filtered delta of dev migrations up to 2026-07-24.
* **`20260724100001_staging_seed.sql`** — idempotent seed. Adds a demo company + divisions, re-affirms payment methods and reason-list categories. Country codes, currencies, and system roles come pre-seeded inside the baseline.
* **`_archive/`** — the previous per-migration files, kept for git history and easier diffing against `../migrations/`. They are **not** applied by `supabase db reset` because the CLI only reads `*.sql` files at the top level.

## Excluded modules
- Services / Orders (field service)
- Contracts
- Subscriptions
- Chat / Contact Centre (WATI, Whapi)
- Teams / Employees / Vehicles
- Promotions / Vouchers
- QC (Quality Control)
- QuickBooks sync
- Standalone RFQs
- Reminders, Traccar, Tool Assets, Media Downloads

## How to apply (fresh reset)

```bash
# 1. Link to staging
npx supabase link --project-ref mwvblpgbgxipvrevkeff

# 2. Point the CLI at THIS folder and reset
#    (temporarily swap folders — see note below)
mv supabase/migrations supabase/migrations.dev
mv supabase/migrations-staging supabase/migrations
npx supabase db reset --linked --yes
mv supabase/migrations supabase/migrations-staging
mv supabase/migrations.dev supabase/migrations

# 3. Relink to dev
npx supabase link --project-ref wkmvjxxmzstsvahuiwsz
```

> **Note:** the Supabase CLI has no `--migrations-dir` flag, so the folder swap is the standard workaround.

## First user

After the reset:
1. Supabase Dashboard → Authentication → **Add User**
2. Use the email in `.env.local` `ADMIN_BOOTSTRAP_EMAIL`
3. The `bootstrap_first_user_trg` trigger creates the profile and assigns the Admin role automatically.

## Rebuild procedure

When dev migrations move ahead of staging and you want to rebuild the baseline:

1. Copy the current `migrations-staging/*.sql` files (from `_archive/` or a prior tag) into a scratch dir.
2. Diff against `../migrations/` to find new dev migrations.
3. Filter out anything under an excluded module.
4. Concatenate everything (existing + delta) into a new `<timestamp>_staging_baseline.sql`.
5. Update `20260724100001_staging_seed.sql` if new seed targets landed.
6. Archive the old baseline into `_archive/` and update this README's "Last rebuilt" line.

## Last rebuilt
2026-07-24 — baseline squashed from 190 per-file migrations + 6 post-2026-07-13 dev delta migrations (excluded chat/orders/teams/calendar/employees migrations).
