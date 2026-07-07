# MMS Database

## Files

| File | Purpose |
|------|---------|
| `final_schema.sql` | **The one file to run on a fresh Supabase project.** Contains all tables, functions, triggers, RLS policies, grants, and seed data — idempotent (safe to re-run). |
| `RLS.sql` | Profiles-only RLS policies (folded into `final_schema.sql` by the build script) |
| `mms-core-schema.sql` | Legacy: stripped-down schema for core-only deployments (pre-consolidation) |
| `mms-seed-data.sql` | Legacy: seed data (now included in `final_schema.sql`) |

## Applying to a fresh Supabase project

1. Create a new Supabase project. Grab the DB connection string from **Project Settings > Database > Connection string > URI**.

2. Run:
   ```bash
   psql "<connection_string>" -f database/final_schema.sql
   ```

   On Windows with a local psql:
   ```bash
   "C:/Program Files/PostgreSQL/18/bin/psql.exe" \
     -h db.<ref>.supabase.co -U postgres -d postgres \
     -f database/final_schema.sql
   ```

   Expected: no ERROR output. NOTICE lines about "already exists" are fine (schema is idempotent).

3. Create the first admin user:
   - Go to Supabase Dashboard > Authentication > Users > Add user
   - The `fresh_db_bootstrap` trigger auto-creates the company, division, profile, and admin role on first sign-up

4. Configure the app:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ADMIN_BOOTSTRAP_EMAIL=m.ismail@alfaytri.com
   ```

5. Link the Supabase CLI (for future migrations):
   ```bash
   npx supabase link --project-ref <ref>
   ```

## Regenerating final_schema.sql

If migrations change under `supabase/migrations/`, rebuild:

```bash
node scripts/build_final_schema.mjs --build
```

The script reads all 110+ migration files, concatenates them in order, and applies idempotency patches:
- `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS`
- `CREATE TYPE ... AS ENUM` → wrapped in `DO $$ ... EXCEPTION WHEN duplicate_object ...$$`
- `CREATE FUNCTION` → `CREATE OR REPLACE FUNCTION`
- `CREATE TRIGGER` → `CREATE OR REPLACE TRIGGER`
- `CREATE POLICY` → prefixed with `DROP POLICY IF EXISTS`
- `INSERT INTO` → `ON CONFLICT DO NOTHING` (if not already present)
- Missing `GRANT EXECUTE` statements → backfilled for all functions
- Safety net: `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated`

Other script modes:
```bash
node scripts/build_final_schema.mjs           # Inventory: count statements per file
node scripts/build_final_schema.mjs --report  # List functions missing GRANT EXECUTE
```

## What's in the schema

| Module | Description |
|--------|-------------|
| Foundation | Companies, divisions, profiles, RBAC, settings, currencies, country codes |
| Customers | Customers, phones, addresses, credit groups |
| Inventory | Categories, items, brand variants, FIFO layers, stock movements, COGS |
| Warehouses | Warehouses, transfers, adjustments, checks, field RPs, allocations |
| Purchase | Suppliers, POs, line items, approvals, receivals, shipments, landed costs |
| Sales | Sale orders, deliveries, returns, approval workflows |
| Finance | Invoices, payments, credit notes, payment plans, allocations |
| Orders | Orders, visits, quotations, follow-ups |
| Contracts | Contracts, contract services, quotations |
| Services | Service catalog, components, reminders, instructions |
| Teams | Teams, employees, schedules, vehicles |
| Contact Centre | Chat conversations, messages, call journal |
| Audit | Activity log, notification trail |
