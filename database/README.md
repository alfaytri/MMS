# MMS Core Database — Inventory + Sales + Purchase

Stripped-down schema for new client deployments that only need the core modules.

## What's included

| Module | Tables | Description |
|--------|--------|-------------|
| Foundation | 19 | companies, divisions, profiles, RBAC, settings, currencies, country codes |
| Customers | 7 | customers, phones, addresses, credit groups |
| Inventory | 7 | categories, items, brand variants, FIFO layers, stock movements, COGS |
| Warehouses | 14 | warehouses, transfers, adjustments, checks, field RPs, allocations |
| Purchase | 14 | suppliers, POs, line items, approvals, receivals, shipments, landed costs |
| Sales | 7 | sale orders, deliveries, returns, approval workflows |
| Finance | 9 | invoices, payments, credit notes, payment plans, allocations |
| Audit | 2 | activity log, notification trail |
| **Total** | **~78** | |

## What's excluded

- Orders & Contracts (orders, visits, quotations, contracts)
- Services (service catalog, components, reminders, instructions)
- Teams & Employees (teams, employees, schedules, vehicles)
- Contact Centre (chat conversations, messages, call journal)
- Promotions & Subscriptions (campaigns, vouchers, packages)
- Quality Control (checklists, inspections, scores)
- QuickBooks sync (qb_accounts, qb_items, qb_division_mappings)

## Files

| File | Purpose |
|------|---------|
| `mms-core-schema.sql` | Full schema: enums, functions, tables, views, RLS (~13K lines) |
| `mms-seed-data.sql` | Seed data for lookup tables: country codes, currencies, payment methods, credit groups |

## Setup for a new client

### 1. Create a new Supabase project

Go to [supabase.com](https://supabase.com) and create a new project. Note the:
- Project URL (`https://<ref>.supabase.co`)
- Anon key
- Service role key
- Database password

### 2. Apply the schema

```bash
# Using psql (recommended)
psql -h db.<ref>.supabase.co -U postgres -d postgres -f mms-core-schema.sql

# Or using pg_dump path on Windows
"C:/Program Files/PostgreSQL/18/bin/psql.exe" \
  -h db.<ref>.supabase.co -U postgres -d postgres \
  -f mms-core-schema.sql
```

### 3. Apply seed data

```bash
psql -h db.<ref>.supabase.co -U postgres -d postgres -f mms-seed-data.sql
```

### 4. Create the first company and admin user

After applying the schema, you need to:
1. Create a company record in the `companies` table
2. Create a division in `company_divisions`
3. Create a Supabase auth user (via Dashboard > Authentication)
4. Create a matching `profiles` record
5. Assign admin role via `user_custom_roles`

### 5. Configure the app

Copy `.env.local` and update:
```
NEXT_PUBLIC_SUPABASE_URL=https://<new-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<new-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<new-service-role-key>
```

### 6. Link the Supabase CLI

```bash
npx supabase link --project-ref <new-ref>
```

## Notes

- The schema includes all 51 enum types (even ones unused by included modules) — they're tiny and harmless
- 121 of 126 needed functions are included. 5 with complex bodies may need manual addition from migration files if their features are used
- The app's navigation will show links to excluded modules (Orders, Contracts, etc.) — hide them via `route-permissions.ts` or nav config for the new client
