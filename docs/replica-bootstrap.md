# Replica bootstrap — rebuild a database from `supabase/migrations-staging/`

This folder is a **hardened squash**: three files that recreate the whole database
from empty, instead of a 190-step incremental replay where any one step can trip.

```
supabase/migrations-staging/
  20260804000000_extensions.sql       # extensions — must run FIRST
  20260805000000_staging_baseline.sql # full public schema (schema-only, from live)
  20260805000001_staging_seed.sql     # reference + org data (from live)
  _archive/                           # the old baseline + every superseded increment
```

Replay order is **extensions → baseline → seed**, then a short list of **out-of-band**
project settings that live in the Supabase dashboard, not in any `.sql`. Skip those
and the schema is perfect but the app is broken (the division switcher/financials
were dark for exactly this reason — see step 3).

Last regenerated: **2026-08-12**, from project `optishfnnctrhffpoywg` at migration
ledger `20260820001300` (schema-identical to staging; new-prod was the reachable
source — see “Regenerating” for cutting from staging directly).

---

## 1. Create the target

A **Supabase project** is the intended target (the schema references Supabase-managed
roles `authenticated`/`anon`/`service_role`/`supabase_auth_admin` and the `auth`,
`storage`, `vault` schemas — all present on any Supabase project, absent on a bare
Postgres). Grab its **direct** connection string (Project Settings → Database):

```
postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres
```

## 2. Apply the schema (fails loudly, all-or-nothing)

```bash
PSQL="/c/Program Files/PostgreSQL/18/bin/psql"   # any psql ≥ 15
URL="postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres"

PGCLIENTENCODING=UTF8 "$PSQL" "$URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations-staging/20260804000000_extensions.sql \
  -f supabase/migrations-staging/20260805000000_staging_baseline.sql \
  -f supabase/migrations-staging/20260805000001_staging_seed.sql
```

`ON_ERROR_STOP=1` aborts on the first error. On a normal Supabase project the
extensions are already enabled, so that file is a no-op; the baseline creates
102 tables / 305 functions / 61 types / 346 policies; the seed loads reference +
org rows in FK-safe order.

> Note: the baseline runs with an **empty `search_path`**, so extensions MUST exist
> first (step‑order matters). It was dumped with pg_dump 18 and the PG18-only
> `\restrict`/`\unrestrict` psql guards were stripped, so it also replays under
> non-psql runners.

## 3. Out-of-band project config — NOT in any migration ⚠️

A SQL replay cannot set these. Do them in the new project or the app breaks in
ways that look like bugs:

- [ ] **Enable the JWT-claims Auth hook.** Auth → Hooks → **Custom Access Token** →
      `public.custom_access_token_hook`, enable. *Without it, `user_type` /
      `division_ids` never reach the token → the division switcher is hidden and
      Financial Overview is “Restricted”, even for an Owner.* (See
      `reference_new_prod_db` memory — this is the #1 gotcha.)
- [ ] **Vault secrets.** Re-create any secret the storage-cleanup triggers read
      (the schema has the `pg_net`-based cleanup infra; the secret VALUE is not in
      the dump). Storage deletes fail silently until it exists.
- [ ] **Edge functions.** Deploy them (`supabase functions deploy …`) — e.g. the
      Wati webhook. `verify_jwt` settings live in `config.toml`.
- [ ] **Auth settings.** Site URL, redirect URLs, SMTP, JWT expiry, email
      templates — set in the dashboard or via `supabase config push` to the target.
- [ ] **Storage buckets.** Rows are seeded, but confirm public/private + any bucket
      policies match.
- [ ] **`config.toml`.** `supabase link --project-ref <ref>` then
      `supabase config push` to apply auth/api/storage config (review the diff — a
      full push overwrites all of the target’s config).

## 4. First-run validation

```sql
-- object counts should match the baseline
select 'tables' t, count(*) from pg_tables where schemaname='public'
union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'policies', count(*) from pg_policies where schemaname='public';
-- reference data landed
select 'roles', count(*) from custom_roles union all select 'countries', count(*) from country_codes;
```

Then log in as a seeded Owner and confirm the token carries the claims (decode the
JWT, or check the division switcher appears + financials are not “Restricted”). If
they’re missing, revisit step 3’s hook toggle.

---

## Regenerating the squash (keep it current)

Re-cut whenever the schema has drifted enough that a fresh replica should start
closer to “now”. Source from **staging** when its DB host is reachable and Docker
is available; otherwise any project at the same migration ledger works (new-prod
was used on 2026-08-12 because staging’s direct host was timing out and
`supabase db dump` needs Docker).

**Schema baseline** — either tool:
```bash
# A) official (needs Docker):
supabase db dump --linked -s public -f 20260805000000_staging_baseline.sql
# B) local pg_dump (needs direct DB access, no Docker):
pg_dump "$URL" --schema-only --schema=public --no-owner --quote-all-identifiers \
  -f 20260805000000_staging_baseline.sql
```
Then **strip the PG18 psql guards** (portability):
`node -e "const fs=require('fs');const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,'utf8').split(/\r?\n/).filter(l=>!/^\\\\(un)?restrict\b/.test(l)).join('\n'))" 20260805000000_staging_baseline.sql`

**Seed** (reference + org tables, FK-safe order handled by pg_dump):
```bash
pg_dump "$URL" --data-only --column-inserts --no-owner \
  --table=public.currencies --table=public.country_codes --table=public.companies \
  --table=public.company_divisions --table=public.custom_roles --table=public.payment_methods \
  --table=public.reason_list_categories --table=public.reason_lists --table=storage.buckets \
  -f 20260805000001_staging_seed.sql
```

Then move any migrations that are now folded into the new baseline into `_archive/`.
Keep the extensions file (or re-derive it from `select extname, extnamespace::regnamespace
from pg_extension`).

## Going forward — the mirror rule still holds

New migrations continue to be written to **both** `supabase/migrations/` and
`supabase/migrations-staging/` (per AGENTS.md). In this folder they land *after*
the baseline as fresh increments; re-squash periodically to collapse them back in.

## What this does NOT clone

Schema + reference/org data only. **Transactional data** (inventory, orders, FIFO
layers, payments, …) is not here — for a full data clone use Supabase’s backup/
restore or `pg_dump --data-only` of the business tables into the fresh schema.
