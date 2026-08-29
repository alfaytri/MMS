# Consumption Phase 2 — Warranty on Consumed Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-issue a warranty for each custody-consumed (sold) item — same policies as sales, **starting on the consumption date** — and give it a Consumption → Warranties page (records + claims) with its own permissions.

**Architecture:** Relax `warranty_records` to accept a consumption source (nullable sale linkage + `consumption_id`/`consumption_line_id` + a `'consumption'` source_type), add `create_warranty_records_for_consumption(p_consumption_id)` mirroring the delivery hook but with `start_date = consumption.date`, call it inline from `rpc_post_consumption` (custody only). Reuse the warranty records view, claims flow, and UI with a source filter; make the claim RPCs pick the permission by the record's source. New page + permission keys wired in the 3 permission places.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, TanStack Query v5, shadcn/ui + Tailwind, Supabase (Postgres RPCs, psql-applied migrations).

**Spec:** `docs/plans/2026-08-29-consumption-sales-returns-warranty-design.md` (Phase 2 = §5.2; Phase 4 = claim→consumption-return, deferred).

## Global Constraints

- **Verification model (this repo):** No unit-test harness. Verify TS with `npx tsc --noEmit` (`0 errors`); verify RPCs/schema with **rolled-back** psql probes against **staging**; hand UI behavior to the operator. No speculative vitest specs.
- **Migrations:** write each `.sql` to BOTH `supabase/migrations/` AND `supabase/migrations-staging/`; apply with `psql`/psycopg2 to **staging** (`mwvblpgbgxipvrevkeff`, keyword-arg connection via `supabase/.temp/migrate.env` `STAGING_DB_PASSWORD`, host `aws-1-ap-south-1.pooler.supabase.com`, user `postgres.mwvblpgbgxipvrevkeff`) and **new-prod** (`NEW_DB_URL`); record `INSERT INTO supabase_migrations.schema_migrations(version,name)`.
- **Enum add rule:** `ALTER TYPE … ADD VALUE` must **commit before the value is used**. Task 1's enum-add is its OWN migration file, applied in its own statement, BEFORE any migration/RPC that references `'consumption'::warranty_source_type`.
- **RPC edits:** fetch the live body with `pg_get_functiondef` first (baseline is stale), `CREATE OR REPLACE` from THAT, single overload, verify columns/enums exist. For `rpc_post_consumption`, the live body already contains the Phase-1 notes guard (migration `20260830000000`) — preserve it.
- **Column names:** before writing the INSERT in Task 3, confirm the live `warranty_records` and `warranty_policies` columns with `\d` (or `information_schema.columns`) — the snapshot list below is from the map but must match live.
- **Commits:** each task ends in a local commit with BOTH co-author trailers (`Mohamed Ismail <m.Ismail@alfaytri.com>`, `Claude Sonnet 4.6 <noreply@anthropic.com>`). Do NOT push (operator batches).
- **Types:** frontend warranty access already casts `as never` (the `_remaining` view isn't in generated types); no `database.types.ts` regen is required for this phase, but if you regen, re-append the 4 DBTable/DBInsert/DBUpdate/AllTables helper aliases.
- **Custody only:** warranties are created only for `consumer_type='custody'`; internal consumption gets none. Scope enforced inside `create_warranty_records_for_consumption`.
- **After the phase:** update `PROGRESS.md` + `EOD/EOD-<date>.md` + add a `docs/flows-registry.md` entry for "Create Warranty Records at Consumption".

---

### Task 1: Add `'consumption'` to `warranty_source_type` (own migration, applied first)

**Files:**
- Create: `supabase/migrations/20260831000000_warranty_source_type_add_consumption.sql`
- Create: `supabase/migrations-staging/20260831000000_warranty_source_type_add_consumption.sql` (identical)

- [ ] **Step 1: Write the migration**
```sql
-- Consumption warranties: extend the warranty source enum. Must be its own
-- migration so the value is committed before any RPC uses it.
ALTER TYPE public.warranty_source_type ADD VALUE IF NOT EXISTS 'consumption';
```
Copy identically to the staging path.

- [ ] **Step 2: Apply to staging** (its own execute so it commits)
```bash
cd D:/MMS && set -a && source supabase/.temp/migrate.env && set +a && python - <<'PY'
import os,psycopg2
c=psycopg2.connect(host='aws-1-ap-south-1.pooler.supabase.com',port=5432,user='postgres.mwvblpgbgxipvrevkeff',password=os.environ['STAGING_DB_PASSWORD'],dbname='postgres');c.autocommit=True;cur=c.cursor()
cur.execute(open('supabase/migrations/20260831000000_warranty_source_type_add_consumption.sql',encoding='utf-8').read())
cur.execute("insert into supabase_migrations.schema_migrations(version,name) values ('20260831000000','warranty_source_type_add_consumption') on conflict do nothing")
cur.execute("select 'consumption'::public.warranty_source_type"); print('staging enum ok:', cur.fetchone()[0]); c.close()
PY
```
Expected: `staging enum ok: consumption`.

- [ ] **Step 3: Apply to new-prod** — same, connecting with `psycopg2.connect(os.environ['NEW_DB_URL'])`. Expected: `new-prod enum ok: consumption`.

- [ ] **Step 4: Commit**
```bash
cd D:/MMS && git add supabase/migrations/20260831000000_warranty_source_type_add_consumption.sql supabase/migrations-staging/20260831000000_warranty_source_type_add_consumption.sql && git commit -m "$(cat <<'EOF'
feat(warranty): add 'consumption' to warranty_source_type

Own migration so the enum value commits before any RPC uses it. Applied to
staging + new-prod.

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Relax `warranty_records` for a consumption source

**Files:**
- Create: `supabase/migrations/20260831000100_warranty_records_consumption_source.sql` (+ staging mirror)

**Interfaces:**
- Produces: `warranty_records.consumption_id`, `warranty_records.consumption_line_id` (both nullable uuid FKs); nullable `sale_delivery_line_id`/`sale_order_id`/`customer_id`; unique index on `consumption_line_id`; XOR source CHECK — consumed by Task 3's INSERT.

- [ ] **Step 1: Write the migration**
```sql
-- Consumption warranties: warranty_records can now originate from a consumption
-- line instead of a sale delivery line. Relax the sales-only NOT NULLs and add
-- the consumption provenance + integrity guards. Existing sales rows keep
-- sale_delivery_line_id set (XOR still satisfied).
ALTER TABLE public.warranty_records
  ALTER COLUMN sale_delivery_line_id DROP NOT NULL,
  ALTER COLUMN sale_order_id         DROP NOT NULL,
  ALTER COLUMN customer_id           DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS consumption_id      uuid REFERENCES public.consumption_entries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS consumption_line_id uuid REFERENCES public.consumption_lines(id)  ON DELETE CASCADE;

-- Idempotency for the create RPC (one warranty per consumption line). NULLs are
-- distinct in a Postgres unique index, so all sales rows (consumption_line_id NULL)
-- coexist freely.
CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_records_consumption_line
  ON public.warranty_records (consumption_line_id);

-- Exactly one source: a sale delivery line XOR a consumption line.
ALTER TABLE public.warranty_records
  ADD CONSTRAINT warranty_records_source_xor CHECK (
    (sale_delivery_line_id IS NOT NULL AND consumption_line_id IS NULL)
    OR (sale_delivery_line_id IS NULL AND consumption_line_id IS NOT NULL)
  );

NOTIFY pgrst, 'reload schema';
```
Copy to the staging path.

- [ ] **Step 2: Apply to staging + verify existing rows satisfy the CHECK**
```bash
cd D:/MMS && set -a && source supabase/.temp/migrate.env && set +a && python - <<'PY'
import os,psycopg2
c=psycopg2.connect(host='aws-1-ap-south-1.pooler.supabase.com',port=5432,user='postgres.mwvblpgbgxipvrevkeff',password=os.environ['STAGING_DB_PASSWORD'],dbname='postgres');c.autocommit=True;cur=c.cursor()
cur.execute(open('supabase/migrations/20260831000100_warranty_records_consumption_source.sql',encoding='utf-8').read())
cur.execute("insert into supabase_migrations.schema_migrations(version,name) values ('20260831000100','warranty_records_consumption_source') on conflict do nothing")
cur.execute("select count(*) from warranty_records where not ((sale_delivery_line_id is not null and consumption_line_id is null) or (sale_delivery_line_id is null and consumption_line_id is not null))")
print('rows violating XOR (must be 0):', cur.fetchone()[0]); c.close()
PY
```
Expected: `rows violating XOR (must be 0): 0`. (If the ADD CONSTRAINT succeeded, this is guaranteed; the count is a belt-and-suspenders confirm.)

- [ ] **Step 3: Apply to new-prod** — same via `NEW_DB_URL`.

- [ ] **Step 4: Commit** (message `feat(warranty): allow consumption-sourced warranty_records`; both trailers).

---

### Task 3: `create_warranty_records_for_consumption(p_consumption_id)`

Mirror the delivery hook, but source from consumption lines and start on the consumption date. Custody-only.

**Files:**
- Create: `supabase/migrations/20260831000200_create_warranty_records_for_consumption.sql` (+ staging mirror)
- Reference: current delivery version `create_warranty_records_for_delivery` body — `supabase/migrations/20261002000200_warranty_origin_snapshot.sql:40`.

**Interfaces:**
- Consumes: Task 1 enum, Task 2 columns.
- Produces: `create_warranty_records_for_consumption(p_consumption_id uuid) RETURNS void` — called by Task 4.

- [ ] **Step 1: Confirm live column names**

Run `\d warranty_records` and `\d warranty_policies` (or `information_schema.columns`) on staging; confirm the snapshot columns used below exist with these names: `warranty_number, sale_delivery_line_id, sale_order_id, customer_id, division_id, brand_variant_id, item_name, sku, qty, policy_id, policy_name_snapshot, coverage_type_snapshot, duration_months_snapshot, terms_en_snapshot, terms_ar_snapshot, void_conditions_snapshot, starts_from_snapshot, start_date, end_date, source_type, origin_country_id, origin_name_snapshot, consumption_id, consumption_line_id`; and on `warranty_policies`: `id, name, coverage_type, duration_months, terms_en, terms_ar, void_conditions, starts_from`. Adjust the INSERT if any differ.

- [ ] **Step 2: Write the migration**
```sql
-- Consumption warranties: create one warranty_record per custody-consumed line
-- whose item resolves a warranty policy, starting on the CONSUMPTION date.
-- Mirrors create_warranty_records_for_delivery; custody-only; idempotent.
CREATE OR REPLACE FUNCTION public.create_warranty_records_for_consumption(p_consumption_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_ce      record;
  v_line    record;
  v_item_id uuid;
  v_origin_id int;
  v_origin_name text;
  v_policy  record;
  v_start   date;
  v_num     text;
begin
  select id, date, division_id, consumer_type into v_ce
    from public.consumption_entries where id = p_consumption_id;
  -- Warranty only on custody consumption (the sale case); internal gets none.
  if not found or v_ce.consumer_type <> 'custody' or v_ce.division_id is null then
    return;
  end if;

  for v_line in
    select cl.id, cl.brand_variant_id, cl.item_name, cl.sku, cl.qty
    from public.consumption_lines cl
    where cl.consumption_id = p_consumption_id
      and cl.brand_variant_id is not null
      and cl.qty > 0
  loop
    select bv.item_id, cc.id, cc.name
      into v_item_id, v_origin_id, v_origin_name
      from public.inventory_item_brand_variants bv
      left join public.country_codes cc on cc.id = bv.country_id
      where bv.id = v_line.brand_variant_id;
    if v_item_id is null then continue; end if;

    select wp.* into v_policy
      from public.warranty_policies wp
      where wp.id = public.get_effective_warranty_policy(v_item_id);
    if not found or coalesce(v_policy.duration_months, 0) = 0 then continue; end if;

    v_start := v_ce.date;  -- warranty starts on the consumption date
    v_num   := public.next_warranty_number('consumption', v_ce.division_id);

    insert into public.warranty_records (
      warranty_number, consumption_id, consumption_line_id,
      sale_delivery_line_id, sale_order_id, customer_id,
      division_id, brand_variant_id, item_name, sku, qty,
      policy_id, policy_name_snapshot, coverage_type_snapshot, duration_months_snapshot,
      terms_en_snapshot, terms_ar_snapshot, void_conditions_snapshot, starts_from_snapshot,
      start_date, end_date, source_type, origin_country_id, origin_name_snapshot
    ) values (
      v_num, p_consumption_id, v_line.id,
      null, null, null,
      v_ce.division_id, v_line.brand_variant_id, v_line.item_name, nullif(v_line.sku,''), v_line.qty,
      v_policy.id, v_policy.name, v_policy.coverage_type, v_policy.duration_months,
      v_policy.terms_en, v_policy.terms_ar, v_policy.void_conditions, v_policy.starts_from,
      v_start, (v_start + (v_policy.duration_months || ' months')::interval)::date,
      'consumption', v_origin_id, v_origin_name
    )
    on conflict (consumption_line_id) do nothing;
  end loop;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_warranty_records_for_consumption(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_warranty_records_for_consumption(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
```
Copy to the staging path.

- [ ] **Step 3: Apply to staging + rolled-back probe**

Apply the migration, then in a `BEGIN … ROLLBACK` probe: pick a real posted **custody** consumption whose line item has an effective warranty policy (join `consumption_lines`→variant→`get_effective_warranty_policy`, policy `duration_months>0`); call `select create_warranty_records_for_consumption(<ce_id>)`; assert `warranty_records` gained a row with `source_type='consumption'`, `consumption_line_id=<line>`, `start_date = ce.date`; call it AGAIN and assert no duplicate (ON CONFLICT); then `ROLLBACK`. Also assert an **internal** consumption creates zero. Print PASS/FAIL per assertion.

- [ ] **Step 4: Apply to new-prod** (via `NEW_DB_URL`).

- [ ] **Step 5: Commit** (`feat(warranty): create_warranty_records_for_consumption (start=consumption date)`; both trailers).

---

### Task 4: Wire the hook into `rpc_post_consumption`

**Files:**
- Create: `supabase/migrations/20260831000300_rpc_post_consumption_warranty_hook.sql` (+ staging mirror)

- [ ] **Step 1: Fetch the CURRENT `rpc_post_consumption` body** (it now includes the Phase-1 notes guard):
```bash
cd D:/MMS && set -a && source supabase/.temp/migrate.env && set +a && python - <<'PY'
import os,psycopg2
c=psycopg2.connect(host='aws-1-ap-south-1.pooler.supabase.com',port=5432,user='postgres.mwvblpgbgxipvrevkeff',password=os.environ['STAGING_DB_PASSWORD'],dbname='postgres');c.set_session(readonly=True,autocommit=True);cur=c.cursor()
cur.execute("select pg_get_functiondef('rpc_post_consumption(uuid,uuid,text,uuid,text,text[],jsonb,uuid,uuid,text)'::regprocedure)")
open('C:/Users/IT/AppData/Local/Temp/claude/D--MMS/a217770b-7ef2-484b-816f-be65b3aefc77/scratchpad/rpc_post_consumption_live2.sql','w',encoding='utf-8').write(cur.fetchone()[0]); print('saved'); c.close()
PY
```
Read the saved file. Confirm the Phase-1 notes guard is present (don't lose it).

- [ ] **Step 2: Write the migration** — reproduce the fetched body verbatim, and add, immediately **before** the final `return v_consumption_id;` (after the `recalc_average_cost` loop):
```sql
  -- Consumption warranties: issue warranty records for custody-sold items
  -- (custody-only + policy checks live inside the function).
  perform public.create_warranty_records_for_consumption(v_consumption_id);
```
End with `NOTIFY pgrst, 'reload schema';`. Copy to the staging path.

- [ ] **Step 3: Apply to staging + probe** — apply; then in a rolled-back probe, post a real custody consumption via `rpc_post_consumption` (using a source you're assigned to, or run as a role that passes the access guard — if the psql session can't pass the signed-in guard, instead assert the hook by calling `create_warranty_records_for_consumption` on the just-created id inside the same tx before rollback). Assert a `warranty_records` row appears for the custody line, none for internal. ROLLBACK.

- [ ] **Step 4: Apply to new-prod.**

- [ ] **Step 5: Commit** (`feat(consumption): issue warranties on custody consumption (rpc hook)`; both trailers).

---

### Task 5: Consumption → Warranties page + hook source filters

**Files:**
- Modify: `src/hooks/useWarrantyRecords.ts` (add optional `source` filter), `src/hooks/useWarrantyClaims.ts` (add optional `warrantyType` filter to `useWarrantyClaims`).
- Create: `src/app/(dashboard)/consumption/warranties/page.tsx` (mirror `src/app/(dashboard)/sales/warranties/page.tsx`).

**Interfaces:**
- Consumes: `warranty_records_remaining` view (now carries `source_type='consumption'` rows), the claims hooks/dialogs.
- Produces: the page at `/consumption/warranties`.

- [ ] **Step 1: Add a source filter to `useWarrantyRecords`**

Read `useWarrantyRecords.ts`. Add an optional `source?: 'sale' | 'consumption'` to its args and, when set, `.eq('source_type', source)` on the `warranty_records_remaining` query. Default (unset) = unchanged (all).

- [ ] **Step 2: Add a type filter to `useWarrantyClaims`**

Read `useWarrantyClaims.ts`. Add an optional `warrantyType?: 'sale' | 'consumption'` to `useWarrantyClaims` and, when set, filter `warranty_claims.warranty_type`. Default = unchanged.

- [ ] **Step 3: Create the page (mirror sales warranties)**

Copy the structure of `sales/warranties/page.tsx` into `consumption/warranties/page.tsx`: Records + Claims tabs, `WarrantyRecordDetailDialog`, `FileWarrantyClaimDialog`, `WarrantyClaimDetailDialog`. Pass `source="consumption"` to `useWarrantyRecords` and `warrantyType="consumption"` to `useWarrantyClaims`. Gate the file-claim action with `useHasPermission('consumption.warranty_claims.manage')` (not the sales key). Set `refetchOnWindowFocus: true` on the reads (consistent with Phase 1). Title "Consumption Warranties".

- [ ] **Step 4: Typecheck**

Run: `cd D:/MMS && npx tsc --noEmit 2>&1 | grep -E "useWarrantyRecords|useWarrantyClaims|consumption/warranties" ; echo "total: $(npx tsc --noEmit 2>&1 | grep -cE 'error TS')"`
Expected: no matches; total `0`.

- [ ] **Step 5: Commit** (`feat(consumption): Consumption > Warranties page + source-filtered warranty hooks`; both trailers).

- [ ] **Step 6: Operator smoke (hand off, after Task 7 wires nav/route)** — posting a custody consumption of a policy-bearing item creates a warranty visible on the new page; internal creates none.

---

### Task 6: Make the warranty-claim RPCs source-aware for permissions

So a consumption warranty claim can be filed/assessed/voided under `consumption.warranty_claims.manage` (sales claims still require `sales.warranty_claims.manage`).

**Files:**
- Create: `supabase/migrations/20260831000400_warranty_claim_rpcs_source_aware_perm.sql` (+ staging mirror)
- Reference (fetch live): `rpc_file_warranty_claim(uuid,text,integer)` (`supabase/migrations/20261002000700…:66`), `rpc_assess_warranty_claim` (`…20261002000400…:61`), `rpc_void_warranty_claim` (`…20261002000400…:82`).

- [ ] **Step 1: Fetch the three live bodies** via `pg_get_functiondef` (save to scratchpad; confirm exact signatures with `select oid::regprocedure from pg_proc where proname in ('rpc_file_warranty_claim','rpc_assess_warranty_claim','rpc_void_warranty_claim')`).

- [ ] **Step 2: Write the migration** — reproduce each body verbatim; replace the hard-coded permission check (`_user_has_permission(v_profile,'sales.warranty_claims.manage')`) with a source-aware check. For `rpc_file_warranty_claim` the record is looked up from `p_warranty_record_id`; for assess/void from the claim's `warranty_record_id`. Pattern:
```sql
  -- source-aware permission: consumption claims use the consumption key
  if (select wr.source_type from public.warranty_records wr where wr.id = v_record_id) = 'consumption' then
    if not public._user_has_permission(v_profile, 'consumption.warranty_claims.manage') then
      raise exception 'You do not have permission to manage consumption warranty claims.' using errcode='42501';
    end if;
  else
    if not public._user_has_permission(v_profile, 'sales.warranty_claims.manage') then
      raise exception 'You do not have permission to manage warranty claims.' using errcode='42501';
    end if;
  end if;
```
(Use the body's existing profile variable name; `v_record_id` = the record id in scope. Keep `warranty_claims.warranty_type` stamping = the record's `source_type` when filing, so the claims list filter works.) Keep the existing `REVOKE/GRANT`. End with `NOTIFY pgrst, 'reload schema';`. Copy to the staging path.

- [ ] **Step 3: Apply to staging + probe** — apply; rolled-back probe: confirm each RPC still raises for a caller lacking the relevant permission and that a `warranty_type='consumption'` is stamped when filing on a consumption record. (Permission checks resolve `auth.uid()`; if the psql session has none, assert the branch is reached by checking the raised message text on a consumption vs sale record.)

- [ ] **Step 4: Apply to new-prod. Step 5: Commit** (`feat(warranty): claim RPCs pick permission by record source (sale|consumption)`; both trailers).

---

### Task 7: Permissions + nav + route for the new page

**Files:**
- Modify: `src/components/master-data/PermissionTree.tsx` (add keys to the consumption `TreeNode`), `src/components/layout/nav-config.ts` (Operations group), `src/lib/route-permissions.ts`.

- [ ] **Step 1: Catalog** — in `NAV_TREE`, under the consumption node (`ops-consumption`), add `consumption.warranties.view` and `consumption.warranty_claims.manage` with labels/descriptions (keep the existing keys).
- [ ] **Step 2: Nav** — add a `NavItem { label: 'Consumption Warranties', href: '/consumption/warranties', icon: ShieldCheck, permission: 'consumption.warranties.view' }` to the Operations group in `NAV_ITEMS`.
- [ ] **Step 3: Route gate** — add `{ pathPrefix: '/consumption/warranties', permission: 'consumption.warranties.view' }` to `ROUTE_PERMISSIONS`, placed BEFORE the generic `/consumption` entry (most-specific first).
- [ ] **Step 4: Typecheck** — `cd D:/MMS && npx tsc --noEmit 2>&1 | grep -cE 'error TS'` → `0`.
- [ ] **Step 5: Commit** (`feat(consumption): permissions + nav + route for Consumption Warranties`; both trailers).
- [ ] **Step 6: Operator smoke** — grant `consumption.warranties.view` to a role; the nav item + page appear; direct URL blocked without the key.

---

### Task 8: Phase docs + flow registry

**Files:**
- Modify: `PROGRESS.md`, `EOD/EOD-<date>.md`, `docs/flows-registry.md`.

- [ ] **Step 1: flows-registry** — add "Create Warranty Records at Consumption" (Trigger: `rpc_post_consumption` → `create_warranty_records_for_consumption`; start = consumption date; custody-only; related [[Create Warranty Records at Delivery]]).
- [ ] **Step 2: PROGRESS.md** — In Progress entry summarizing Phase 2 (schema, create RPC + hook, page, source-aware claim perms, permissions), commits, "committed, not pushed."
- [ ] **Step 3: EOD** — append the completed work in plain language.
- [ ] **Step 4: Commit** (`docs: update PROGRESS.md + flows-registry — consumption warranty (Phase 2)`; both trailers; EOD is gitignored).

---

## Self-Review

- **Spec coverage (§5.2):** enum add (Task 1 ✓), warranty_records relax + provenance + XOR + unique (Task 2 ✓), `create_warranty_records_for_consumption` start=consumption date, custody-only, idempotent (Task 3 ✓), inline hook in `rpc_post_consumption` (Task 4 ✓), page reusing records+claims with source filter (Task 5 ✓), permissions (Task 7 ✓). Extra needed for a usable page: source-aware claim permission (Task 6) so consumption claims can be filed under the consumption key. Cert PDF explicitly deferred (spec §9). Claim→consumption-return deferred to Phase 4.
- **Placeholder scan:** the create RPC body is concrete (Task 3); the existing-RPC edits are fetch-verbatim-then-adjust with the exact snippet to insert (Tasks 4, 6); no TBD/TODO.
- **Type/name consistency:** `source` (records) / `warrantyType` (claims) filter names introduced in Task 5 and used only there; `create_warranty_records_for_consumption(uuid)` defined Task 3, called Task 4; enum value `'consumption'` added Task 1 before use in Tasks 3/4/6.
- **Enum-safety:** Task 1 is isolated + applied before any use (global constraint honored).

## Later phases

- **Phase 3a** — sales return COGS-reversal fix (money-path). **Phase 3b** — consumption returns. **Phase 4** — warranty claim → consumption return (needs 3b).
