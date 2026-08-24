# Category-Level Division Assignment with Cascade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators assign divisions to an inventory category and have sub-categories + items inherit them live (additive), plus auto-stick an item to a division whenever stock lands there, plus an opt-in bulk re-home of tool units.

**Architecture:** One new table (`inventory_category_divisions`); the single read RPC (`rpc_item_divisions_by_stock`) gains a recursive walk up `parent_id` so inheritance is read-time (no materialization); a trigger on `fifo_cost_layers` makes stock-presence a permanent assignment; new SECDEF RPCs write category divisions and (opt-in) re-home tool units; two dialogs render inherited divisions as checked+locked.

**Tech Stack:** Postgres (Supabase), Next.js 15 App Router, TanStack Query v5, TypeScript, vitest.

**Spec:** `docs/specs/2026-08-24-category-division-cascade-design.md`

## Global Constraints

- **Commit trailer (verbatim, every commit):**
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
  ```
- **Migrations:** create each `.sql` in **BOTH** `supabase/migrations/` AND `supabase/migrations-staging/` (same commit). Timestamps `20261005000000`…`20261005000400` (they sort after the latest applied, `20261004000200`).
- **DB target:** build + verify on **staging** (`mwvblpgbgxipvrevkeff`) first. **Do NOT use `npx supabase db push`** — the CLI is linked to the *paused dev* project and staging's migration history is drifted (latest recorded `20261003000000`; the `20261004xxx` trio was applied by raw psql). Apply migrations by **`psql -f`** instead (the project's current deploy-window practice). New-prod (`optishfnnctrhffpoywg`, live app) is applied in Task 12 at ship time — **ask before deploy** (each push to `deploy/warehouse-shipping` is a Vercel prod build). **The auto-stick trigger must NOT reach new-prod until ship**, or the live app auto-assigns divisions before the UI exists.
- **Staging connection (verified working):** load env then define a helper — reuse in every DB step:
  ```bash
  set -a && . supabase/.temp/migrate.env && set +a; export PGCLIENTENCODING=UTF8
  PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"
  SPG() { PGPASSWORD="$STAGING_DB_PASSWORD" "$PSQL" -h db.mwvblpgbgxipvrevkeff.supabase.co -p 5432 -U postgres -d postgres "$@"; }
  # apply:  SPG -f supabase/migrations/<file>.sql        verify: SPG -c "<sql>"
  ```
  (New-prod in Task 12 uses `"$PSQL" "$NEW_DB_URL" -f <file>`.)
- **All functional DB verifies use `BEGIN … ROLLBACK` and dynamic row selection** — safe to run against any environment, no hardcoded IDs, no data left behind.
- **SECDEF RPCs:** end every new function with `revoke all on function … from public, anon;` + `grant execute on function … to authenticated;`
- **After type regen (Task 6):** re-append the 4 helper aliases (CLI wipes them) — exact text in that task.
- **Per-task ritual (AGENTS.md):** update `PROGRESS.md` (start + completion) and `EOD/EOD-2026-08-24.md` per task; the flows-registry entry ships in the code commit (Task 11). Never push without asking.
- **Frontend gate:** `npx tsc --noEmit` must pass before each frontend commit. UI behaviour is smoke-tested by the operator (do not fabricate component tests).

---

## Task 0: Prerequisite — confirm staging connection

**Files:** none (environment setup).

- [ ] **Step 1: Confirm the staging psql connection works**

```bash
set -a && . supabase/.temp/migrate.env && set +a; export PGCLIENTENCODING=UTF8
PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"
SPG() { PGPASSWORD="$STAGING_DB_PASSWORD" "$PSQL" -h db.mwvblpgbgxipvrevkeff.supabase.co -p 5432 -U postgres -d postgres "$@"; }
SPG -t -A -c "select 'STAGING OK', current_database();"
```
Expected: `STAGING OK|postgres`. (Confirmed working 2026-08-24: staging has 978 items, 3 item_divisions.) Do **not** `npx supabase db push` (see Global Constraints).

---

## Task 1: New table `inventory_category_divisions`

**Files:**
- Create: `supabase/migrations/20261005000000_category_divisions_table.sql`
- Create: `supabase/migrations-staging/20261005000000_category_divisions_table.sql` (identical)

**Interfaces:**
- Produces: table `public.inventory_category_divisions (category_id uuid, division_id uuid, created_at timestamptz, created_by uuid, PK(category_id,division_id))`; RLS on; SELECT for authenticated; writes RPC-only.

- [ ] **Step 1: Write the failing verify**

```bash
set -a && . supabase/.temp/migrate.env && set +a
SPG -c "select count(*) from public.inventory_category_divisions;"
```
Expected: FAIL — `relation "public.inventory_category_divisions" does not exist`.

- [ ] **Step 2: Create the migration (both folders)**

```sql
-- 20261005000000_category_divisions_table.sql
create table if not exists public.inventory_category_divisions (
  category_id uuid not null references public.inventory_categories(id) on delete cascade,
  division_id uuid not null references public.company_divisions(id)   on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.user_data(id),
  primary key (category_id, division_id)
);
create index if not exists idx_icd_division on public.inventory_category_divisions(division_id);

alter table public.inventory_category_divisions enable row level security;

-- Reads: any authenticated user (the catalog is global).
drop policy if exists icd_select on public.inventory_category_divisions;
create policy icd_select on public.inventory_category_divisions
  for select to authenticated using (true);
-- No INSERT/UPDATE/DELETE policy on purpose → direct writes are denied;
-- all writes go through the SECURITY DEFINER RPCs (Task 4).

grant select on public.inventory_category_divisions to authenticated;
```

- [ ] **Step 3: Apply to staging**

```bash
SPG -f supabase/migrations/20261005000000_category_divisions_table.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` / `ALTER TABLE` / `CREATE POLICY` / `GRANT` with no error.

- [ ] **Step 4: Run the verify (now passes) + confirm RLS on**

```bash
SPG -c "select count(*) from public.inventory_category_divisions;"
SPG -c "select relrowsecurity from pg_class where oid='public.inventory_category_divisions'::regclass;"
```
Expected: `0`, then `t`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261005000000_category_divisions_table.sql supabase/migrations-staging/20261005000000_category_divisions_table.sql
git commit -m "$(cat <<'EOF'
feat(db): add inventory_category_divisions table (RPC-only writes)

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Auto-stick trigger on `fifo_cost_layers`

**Files:**
- Create: `supabase/migrations/20261005000100_autostick_item_division.sql` (+ staging mirror)

**Interfaces:**
- Consumes: `inventory_category_divisions` need not exist for this (writes to `inventory_item_divisions`).
- Produces: `_autostick_item_division()` trigger fn + `trg_autostick_item_division` AFTER INSERT trigger.

- [ ] **Step 1: Write the failing verify (dynamic, rolled back)**

```bash
SPG -c "$(cat <<'SQL'
BEGIN;
DO $$
declare v_bv uuid; v_item uuid; v_sc uuid; v_div uuid;
begin
  select bv.id, ii.id into v_bv, v_item
    from inventory_item_brand_variants bv
    join inventory_items ii on ii.id=bv.item_id
    join inventory_categories c on c.id=ii.category_id
   where c.type='spare-parts' limit 1;
  select sc.id, sc.division_id into v_sc, v_div
    from warehouse_sub_containers sc
   where sc.division_id is not null
     and not exists (select 1 from inventory_item_divisions d
                      where d.item_id=v_item and d.division_id=sc.division_id)
   limit 1;
  insert into fifo_cost_layers (brand_variant_id, date, qty, unit_cost, total_unit_cost, remaining_qty, sub_container_id)
    values (v_bv, current_date, 1, 0, 0, 1, v_sc);
  if not exists (select 1 from inventory_item_divisions where item_id=v_item and division_id=v_div)
    then raise exception 'AUTOSTICK FAILED'; end if;
  raise notice 'AUTOSTICK PASSED item=% div=%', v_item, v_div;
end $$;
ROLLBACK;
SQL
)"
```
Expected: FAIL — `AUTOSTICK FAILED` (trigger not created yet, so no row appears).

- [ ] **Step 2: Create the migration (both folders)**

```sql
-- 20261005000100_autostick_item_division.sql
create or replace function public._autostick_item_division()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_item uuid; v_div uuid;
begin
  if new.remaining_qty is null or new.remaining_qty <= 0 then return new; end if;
  select sc.division_id into v_div
    from public.warehouse_sub_containers sc where sc.id = new.sub_container_id;
  if v_div is null then return new; end if;
  select bv.item_id into v_item
    from public.inventory_item_brand_variants bv where bv.id = new.brand_variant_id;
  if v_item is null then return new; end if;
  insert into public.inventory_item_divisions (item_id, division_id, category_id)
  select v_item, v_div, (select category_id from public.inventory_items where id = v_item)
  on conflict (item_id, division_id) do nothing;   -- additive; never removes
  return new;
end;
$function$;

drop trigger if exists trg_autostick_item_division on public.fifo_cost_layers;
create trigger trg_autostick_item_division
  after insert on public.fifo_cost_layers
  for each row execute function public._autostick_item_division();
```

- [ ] **Step 3: Apply to staging**

```bash
SPG -f supabase/migrations/20261005000100_autostick_item_division.sql
```
Expected: `CREATE FUNCTION` / `CREATE TRIGGER` with no error.

- [ ] **Step 4: Run the verify (now passes)**

Re-run the Step 1 block. Expected: `NOTICE: AUTOSTICK PASSED …`, then `ROLLBACK` (no data kept).

- [ ] **Step 5: Commit** (both files; trailer as above; message `feat(db): auto-stick item→division on stock landing (fifo_cost_layers trigger)`).

---

## Task 3: Read RPC — add live category inheritance

**Files:**
- Create: `supabase/migrations/20261005000200_item_divisions_by_stock_inherit.sql` (+ staging mirror)

**Interfaces:**
- Consumes: `inventory_category_divisions` (Task 1).
- Produces: `rpc_item_divisions_by_stock(p_type text)` now unions inherited-from-ancestor-category divisions. Same signature/return as before.

- [ ] **Step 1: Write the failing verify (dynamic, rolled back)**

```bash
SPG -c "$(cat <<'SQL'
BEGIN;
DO $$
declare v_cat uuid; v_type text; v_item uuid; v_div uuid; v_ids uuid[];
begin
  -- a category that has at least one item, and that item currently lacks some division
  select ii.category_id, c.type::text, ii.id into v_cat, v_type, v_item
    from inventory_items ii join inventory_categories c on c.id=ii.category_id
   where ii.status<>'archived' limit 1;
  select d.id into v_div from company_divisions d
   where not exists (select 1 from inventory_item_divisions x where x.item_id=v_item and x.division_id=d.id)
   limit 1;
  insert into inventory_category_divisions (category_id, division_id) values (v_cat, v_div)
    on conflict do nothing;
  select division_ids into v_ids from rpc_item_divisions_by_stock(v_type) where item_id=v_item;
  if not (v_div = any(v_ids)) then raise exception 'INHERIT FAILED (div % not in %)', v_div, v_ids; end if;
  raise notice 'INHERIT PASSED';
end $$;
ROLLBACK;
SQL
)"
```
Expected: FAIL — `INHERIT FAILED` (RPC does not yet read `inventory_category_divisions`).

- [ ] **Step 2: Create the migration (both folders)** — full `CREATE OR REPLACE`, based on the live body plus branch (c):

```sql
-- 20261005000200_item_divisions_by_stock_inherit.sql
create or replace function public.rpc_item_divisions_by_stock(p_type text)
returns table(item_id uuid, category_id uuid, division_ids uuid[])
language sql stable security definer set search_path to 'public' as $function$
  with recursive cat_anc(cat_id, anc_id) as (
    select id, id from public.inventory_categories
    union all
    select ca.cat_id, c.parent_id
    from cat_anc ca
    join public.inventory_categories c on c.id = ca.anc_id
    where c.parent_id is not null
  )
  select ii.id, ii.category_id,
    coalesce((
      select array_agg(distinct d) from (
        select idv.division_id as d
          from public.inventory_item_divisions idv where idv.item_id = ii.id
        union
        select sc.division_id
          from public.inventory_item_brand_variants bv
          join public.fifo_cost_layers fcl on fcl.brand_variant_id = bv.id and fcl.remaining_qty > 0
          join public.warehouse_sub_containers sc on sc.id = fcl.sub_container_id and sc.division_id is not null
         where bv.item_id = ii.id
        union
        select icd.division_id
          from cat_anc ca
          join public.inventory_category_divisions icd on icd.category_id = ca.anc_id
         where ca.cat_id = ii.category_id
      ) u where d is not null
    ), '{}'::uuid[]) as division_ids
  from public.inventory_items ii
  join public.inventory_categories ic on ic.id = ii.category_id and ic.type::text = p_type
  where ii.status <> 'archived';
$function$;
```

- [ ] **Step 3: Apply to staging**

```bash
SPG -f supabase/migrations/20261005000200_item_divisions_by_stock_inherit.sql
```
Expected: `CREATE FUNCTION` with no error.

- [ ] **Step 4: Run the verify (now passes)** — re-run Step 1. Expected: `NOTICE: INHERIT PASSED`.

- [ ] **Step 5: Commit** (message `feat(db): rpc_item_divisions_by_stock inherits category-chain divisions`).

---

## Task 4: Category-division RPCs (write + dialog reads)

**Files:**
- Create: `supabase/migrations/20261005000300_category_division_rpcs.sql` (+ staging mirror)

**Interfaces:**
- Produces:
  - `rpc_set_category_divisions(p_category_id uuid, p_division_ids uuid[]) returns void`
  - `rpc_category_divisions(p_category_id uuid) returns jsonb` → `{ "own": uuid[], "inherited": uuid[] }` (inherited = strict ancestors)
  - `rpc_item_effective_divisions(p_item_id uuid) returns jsonb` → `{ "explicit": uuid[], "inherited": uuid[] }` (inherited = item's whole category chain incl. own category)

- [ ] **Step 1: Write the failing verify (dynamic, rolled back)**

```bash
SPG -c "$(cat <<'SQL'
BEGIN;
DO $$
declare v_cat uuid; v_div uuid; j jsonb;
begin
  select id into v_cat from inventory_categories limit 1;
  select id into v_div from company_divisions limit 1;
  perform rpc_set_category_divisions(v_cat, array[v_div]);
  j := rpc_category_divisions(v_cat);
  if not (j->'own' ? v_div::text) then raise exception 'SET/READ FAILED %', j; end if;
  raise notice 'CATRPC PASSED %', j;
end $$;
ROLLBACK;
SQL
)"
```
Expected: FAIL — `function rpc_set_category_divisions(uuid, uuid[]) does not exist`.

- [ ] **Step 2: Create the migration (both folders)**

```sql
-- 20261005000300_category_division_rpcs.sql

-- Write (replace-set), gated like item divisions.
create or replace function public.rpc_set_category_divisions(p_category_id uuid, p_division_ids uuid[])
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public._user_can_write_catalog(public._current_user_data_id()) then
    raise exception 'not authorized';
  end if;
  delete from public.inventory_category_divisions
   where category_id = p_category_id
     and not (division_id = any(coalesce(p_division_ids, '{}'::uuid[])));
  insert into public.inventory_category_divisions (category_id, division_id, created_by)
  select p_category_id, d, public._current_user_data_id()
  from unnest(coalesce(p_division_ids, '{}'::uuid[])) as d
  on conflict (category_id, division_id) do nothing;
end;
$function$;
revoke all on function public.rpc_set_category_divisions(uuid, uuid[]) from public, anon;
grant execute on function public.rpc_set_category_divisions(uuid, uuid[]) to authenticated;

-- Category dialog read: own (editable) + inherited from STRICT ancestors (locked).
create or replace function public.rpc_category_divisions(p_category_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with recursive anc(id) as (
    select parent_id from public.inventory_categories where id = p_category_id and parent_id is not null
    union all
    select c.parent_id from public.inventory_categories c join anc a on c.id = a.id where c.parent_id is not null
  )
  select jsonb_build_object(
    'own', coalesce((select array_agg(division_id)
                       from public.inventory_category_divisions where category_id = p_category_id), '{}'::uuid[]),
    'inherited', coalesce((select array_agg(distinct icd.division_id)
                             from anc join public.inventory_category_divisions icd on icd.category_id = anc.id), '{}'::uuid[])
  );
$function$;
revoke all on function public.rpc_category_divisions(uuid) from public, anon;
grant execute on function public.rpc_category_divisions(uuid) to authenticated;

-- Item dialog read: explicit (editable) + inherited from the item's category chain incl. own category (locked).
create or replace function public.rpc_item_effective_divisions(p_item_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with recursive anc(id) as (
    select category_id from public.inventory_items where id = p_item_id and category_id is not null
    union all
    select c.parent_id from public.inventory_categories c join anc a on c.id = a.id where c.parent_id is not null
  )
  select jsonb_build_object(
    'explicit', coalesce((select array_agg(division_id)
                            from public.inventory_item_divisions where item_id = p_item_id), '{}'::uuid[]),
    'inherited', coalesce((select array_agg(distinct icd.division_id)
                             from anc join public.inventory_category_divisions icd on icd.category_id = anc.id), '{}'::uuid[])
  );
$function$;
revoke all on function public.rpc_item_effective_divisions(uuid) from public, anon;
grant execute on function public.rpc_item_effective_divisions(uuid) to authenticated;
```

- [ ] **Step 3: Apply to staging**

```bash
SPG -f supabase/migrations/20261005000300_category_division_rpcs.sql
```
Expected: three `CREATE FUNCTION` + `REVOKE`/`GRANT` pairs, no error.

- [ ] **Step 4: Run the verify (now passes)** — re-run Step 1 (`CATRPC PASSED`). Then confirm the unauthorized path raises (optional): the gate is `_user_can_write_catalog`.

- [ ] **Step 5: Commit** (message `feat(db): category-division set/read RPCs (own+inherited, item effective)`).

---

## Task 5: Tools — opt-in bulk unit re-home RPC

**Files:**
- Create: `supabase/migrations/20261005000400_cascade_category_units_division.sql` (+ staging mirror)

**Interfaces:**
- Produces: `rpc_cascade_category_units_division(p_category_id uuid, p_division_id uuid) returns jsonb` → `{ "moved": int, "skipped": text[] }`. Moves every serialized unit under the category subtree whose division differs, using `rpc_transfer_tool_unit` semantics.

- [ ] **Step 1: Write the failing verify (dynamic, rolled back)**

```bash
SPG -c "$(cat <<'SQL'
BEGIN;
DO $$
declare v_cat uuid; v_div uuid; j jsonb;
begin
  select id into v_cat from inventory_categories where type='tools' limit 1;
  select id into v_div from company_divisions limit 1;
  j := rpc_cascade_category_units_division(v_cat, v_div);   -- 0 units today → moved:0
  if (j->>'moved') is null then raise exception 'UNITS RPC FAILED %', j; end if;
  raise notice 'UNITS RPC PASSED %', j;
end $$;
ROLLBACK;
SQL
)"
```
Expected: FAIL — `function rpc_cascade_category_units_division(uuid, uuid) does not exist`.

- [ ] **Step 2: Create the migration (both folders)**

```sql
-- 20261005000400_cascade_category_units_division.sql
create or replace function public.rpc_cascade_category_units_division(p_category_id uuid, p_division_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_moved int := 0; v_skipped text[] := array[]::text[]; r record;
begin
  if not public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage') then
    raise exception 'not authorized';
  end if;
  if p_division_id is null then raise exception 'target division required'; end if;

  for r in
    with recursive subtree as (
      select id from public.inventory_categories where id = p_category_id
      union all
      select c.id from public.inventory_categories c join subtree s on c.parent_id = s.id
    )
    select tau.id as unit_id
      from public.tool_asset_units tau
      join public.inventory_items ii on ii.id = tau.item_id
     where ii.category_id in (select id from subtree)
       and tau.division_id is distinct from p_division_id
  loop
    -- mirror rpc_transfer_tool_unit: division moves, open team assignment released, custody cleared
    update public.tool_asset_units set division_id = p_division_id where id = r.unit_id;
    update public.tool_unit_assignments set released_at = now(), release_reason = 'moved'
      where unit_id = r.unit_id and released_at is null;
    update public.tool_asset_units set current_custody_location_id = null where id = r.unit_id;
    v_moved := v_moved + 1;
  end loop;

  return jsonb_build_object('moved', v_moved, 'skipped', to_jsonb(v_skipped));
end;
$function$;
revoke all on function public.rpc_cascade_category_units_division(uuid, uuid) from public, anon;
grant execute on function public.rpc_cascade_category_units_division(uuid, uuid) to authenticated;
```

- [ ] **Step 3: Apply to staging**

```bash
SPG -f supabase/migrations/20261005000400_cascade_category_units_division.sql
```
Expected: `CREATE FUNCTION` + `REVOKE`/`GRANT`, no error.

- [ ] **Step 4: Run the verify (now passes)** — re-run Step 1 (`UNITS RPC PASSED {"moved":0,...}`).

- [ ] **Step 5: Commit** (message `feat(db): opt-in bulk re-home of tool units to a category division`).

---

## Task 6: Regenerate `database.types.ts` + re-append helpers

**Files:**
- Modify: `src/types/database.types.ts`

- [ ] **Step 1: Regenerate types from staging**

`--linked` points at the paused dev project, so target staging explicitly with a URL-encoded password:
```bash
set -a && . supabase/.temp/migrate.env && set +a
STAGING_URL="postgresql://postgres:$(python -c "import os,urllib.parse;print(urllib.parse.quote(os.environ['STAGING_DB_PASSWORD'],safe=''))")@db.mwvblpgbgxipvrevkeff.supabase.co:5432/postgres"
npx supabase gen types typescript --db-url "$STAGING_URL" > src/types/database.types.ts
```

- [ ] **Step 2: Re-append the 4 helper aliases (CLI wipes them)**

Append to the end of `src/types/database.types.ts`:
```ts

// Helper type aliases for cleaner RLS/query type bindings
export type DBTable<T extends keyof Database['public']['Tables'] = keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type DBInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type DBUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type AllTables = keyof Database['public']['Tables']
```

- [ ] **Step 3: Confirm the new symbols exist + types compile**

```bash
grep -n "inventory_category_divisions\|rpc_set_category_divisions\|rpc_item_effective_divisions\|rpc_cascade_category_units_division" src/types/database.types.ts | head
npx tsc --noEmit
```
Expected: greps hit; `tsc` exits 0.

- [ ] **Step 4: Commit** (message `chore(types): regen database.types for category-division RPCs + tables`).

---

## Task 7: Pure helper — compute division rows (locked/editable)

**Files:**
- Create: `src/lib/inventory/divisionRows.ts`
- Test: `src/lib/inventory/divisionRows.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DivisionRowInput { editableIds: string[]; lockedIds: string[] }
  export interface DivisionRow { id: string; checked: boolean; locked: boolean }
  export function computeDivisionRows(divisionIds: string[], input: DivisionRowInput): DivisionRow[]
  export function editableSelection(rows: DivisionRow[]): string[]
  ```
  `checked` = id in editableIds ∪ lockedIds. `locked` (→ disabled) = id in lockedIds. `editableSelection` returns the currently-checked, non-locked ids (what gets sent to the set RPC).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/inventory/divisionRows.test.ts
import { describe, it, expect } from 'vitest'
import { computeDivisionRows, editableSelection } from './divisionRows'

const D = ['a', 'b', 'c', 'd']

describe('computeDivisionRows', () => {
  it('locks inherited, keeps explicit editable, unchecks the rest', () => {
    const rows = computeDivisionRows(D, { editableIds: ['b'], lockedIds: ['a'] })
    expect(rows).toEqual([
      { id: 'a', checked: true, locked: true },
      { id: 'b', checked: true, locked: false },
      { id: 'c', checked: false, locked: false },
      { id: 'd', checked: false, locked: false },
    ])
  })

  it('locked wins when an id is both inherited and explicit', () => {
    const rows = computeDivisionRows(D, { editableIds: ['a'], lockedIds: ['a'] })
    expect(rows.find(r => r.id === 'a')).toEqual({ id: 'a', checked: true, locked: true })
  })
})

describe('editableSelection', () => {
  it('returns only checked, non-locked ids', () => {
    const rows = computeDivisionRows(D, { editableIds: ['b'], lockedIds: ['a'] })
    expect(editableSelection(rows)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/inventory/divisionRows.test.ts`
Expected: FAIL — cannot find module `./divisionRows`.

- [ ] **Step 3: Implement the helper**

```ts
// src/lib/inventory/divisionRows.ts
export interface DivisionRowInput {
  editableIds: string[]
  lockedIds: string[]
}
export interface DivisionRow {
  id: string
  checked: boolean
  locked: boolean
}

/** Build render rows for a division checkbox grid. `locked` rows are inherited
 *  (checked + disabled); editable rows reflect this node's own assignment. */
export function computeDivisionRows(divisionIds: string[], input: DivisionRowInput): DivisionRow[] {
  const locked = new Set(input.lockedIds)
  const editable = new Set(input.editableIds)
  return divisionIds.map((id) => ({
    id,
    checked: locked.has(id) || editable.has(id),
    locked: locked.has(id),
  }))
}

/** The ids to persist (checked and not inherited-locked). */
export function editableSelection(rows: DivisionRow[]): string[] {
  return rows.filter((r) => r.checked && !r.locked).map((r) => r.id)
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run src/lib/inventory/divisionRows.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit** (message `feat(inventory): pure helper for inherited/editable division rows`).

---

## Task 8: Hooks — category divisions + item effective divisions

**Files:**
- Create: `src/hooks/useCategoryDivisions.ts`
- Modify: `src/hooks/useItemDivisions.ts` (add `useItemEffectiveDivisions`)

**Interfaces:**
- Consumes: RPCs from Tasks 4–5.
- Produces:
  - `useCategoryDivisions(categoryId: string | null)` → `{ own: string[]; inherited: string[] }`
  - `useSetCategoryDivisions()` → mutation `{ categoryId, divisionIds }`
  - `useCascadeCategoryUnitsDivision()` → mutation `{ categoryId, divisionId }` → `{ moved: number; skipped: string[] }`
  - `useItemEffectiveDivisions(itemId: string | null)` → `{ explicit: string[]; inherited: string[] }`

- [ ] **Step 1: Create `src/hooks/useCategoryDivisions.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useCategoryDivisions(categoryId: string | null) {
  return useQuery({
    queryKey: ['category-divisions', categoryId],
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'rpc_category_divisions' as never,
        { p_category_id: categoryId } as never,
      )
      if (error) throw error
      const j = (data ?? {}) as { own?: string[]; inherited?: string[] }
      return { own: j.own ?? [], inherited: j.inherited ?? [] }
    },
  })
}

export function useSetCategoryDivisions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, divisionIds }: { categoryId: string; divisionIds: string[] }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc(
        'rpc_set_category_divisions' as never,
        { p_category_id: categoryId, p_division_ids: divisionIds } as never,
      )
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['category-divisions', vars.categoryId] })
      qc.invalidateQueries({ queryKey: ['item-divisions-by-stock'] })
      qc.invalidateQueries({ queryKey: ['cascade-accessible', 'assignment'] })
    },
  })
}

export function useCascadeCategoryUnitsDivision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, divisionId }: { categoryId: string; divisionId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'rpc_cascade_category_units_division' as never,
        { p_category_id: categoryId, p_division_id: divisionId } as never,
      )
      if (error) throw error
      const j = (data ?? {}) as { moved?: number; skipped?: string[] }
      return { moved: j.moved ?? 0, skipped: j.skipped ?? [] }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-divisions-by-stock'] })
    },
  })
}
```

- [ ] **Step 2: Add `useItemEffectiveDivisions` to `src/hooks/useItemDivisions.ts`**

Append after the existing `useSetItemDivisions` (keep existing exports untouched):
```ts
/** Explicit item-level divisions (editable) + inherited from the item's category
 *  chain (locked). Seeds the Item dialog's division grid. */
export function useItemEffectiveDivisions(itemId: string | null) {
  return useQuery({
    queryKey: ['item-effective-divisions', itemId],
    enabled: !!itemId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'rpc_item_effective_divisions' as never,
        { p_item_id: itemId } as never,
      )
      if (error) throw error
      const j = (data ?? {}) as { explicit?: string[]; inherited?: string[] }
      return { explicit: j.explicit ?? [], inherited: j.inherited ?? [] }
    },
  })
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Commit** (message `feat(hooks): category-division + item-effective-division hooks`).

---

## Task 9: CategoryEditDialog — divisions section + tools unit move

**Files:**
- Modify: `src/components/services/inventory/CategoryEditDialog.tsx`

**Interfaces:**
- Consumes: `useDivisions` (existing), `useCategoryDivisions`, `useSetCategoryDivisions`, `useCascadeCategoryUnitsDivision` (Task 8), `computeDivisionRows` / `editableSelection` (Task 7).

- [ ] **Step 1: Imports + hook wiring**

At the top with the other imports:
```ts
import { useDivisions } from '@/hooks/useDivisions'
import { useCategoryDivisions, useSetCategoryDivisions, useCascadeCategoryUnitsDivision } from '@/hooks/useCategoryDivisions'
import { computeDivisionRows, editableSelection } from '@/lib/inventory/divisionRows'
```
Inside the component (near the other hooks):
```ts
const { data: divisions = [] } = useDivisions()
const { data: catDivs } = useCategoryDivisions(category?.id ?? null)
const setCategoryDivisions = useSetCategoryDivisions()
const cascadeUnits = useCascadeCategoryUnitsDivision()
const [ownDivisionIds, setOwnDivisionIds] = useState<string[]>([])
const [unitHomeId, setUnitHomeId] = useState<string>('')   // tools: chosen physical-home
```

- [ ] **Step 2: Seed own-divisions when the dialog opens / data loads**

Add an effect (mirror the existing seed effects):
```ts
useEffect(() => {
  if (catDivs) setOwnDivisionIds(catDivs.own)
}, [catDivs])
```

- [ ] **Step 3: Render the "Assigned divisions" section** (place it in the form body, just before `DialogFooter`, mirroring `ItemEditDialog.tsx:452-508`):

```tsx
{(() => {
  const inherited = catDivs?.inherited ?? []
  const rows = computeDivisionRows(divisions.map(d => d.id), { editableIds: ownDivisionIds, lockedIds: inherited })
  const divName = (id: string) => divisions.find(d => d.id === id)?.name ?? '…'
  const effective = Array.from(new Set([...ownDivisionIds, ...inherited]))
  return (
    <div className="rounded-md border border-dashed border-border">
      <div className="px-3 py-2 text-xs font-medium">Assigned divisions</div>
      <div className="px-3 pb-3 pt-1 space-y-2">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Divisions this category (and everything under it) belongs to. Sub-categories and items inherit these. Locked = inherited from a parent category.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {rows.map((row) => (
            <label key={row.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent min-h-9 ${row.locked ? 'opacity-70' : 'hover:border-border hover:bg-muted/30 cursor-pointer'}`}>
              <Checkbox
                checked={row.checked}
                disabled={row.locked || readOnly}
                onCheckedChange={(v) => setOwnDivisionIds((cur) => v ? [...cur, row.id] : cur.filter((id) => id !== row.id))}
              />
              <span className="text-xs flex-1 truncate">
                {divName(row.id)}
                {row.locked && <span className="text-[10px] text-muted-foreground"> · inherited</span>}
              </span>
            </label>
          ))}
        </div>

        {categoryType === 'tools' && effective.length > 0 && (
          <div className="pt-2 border-t space-y-1.5 min-h-16">
            <p className="text-[10px] text-muted-foreground">Physical home for serialized units:</p>
            {effective.length > 1 && (
              <select className="text-xs border rounded px-2 py-1 w-full max-w-xs"
                value={unitHomeId} onChange={(e) => setUnitHomeId(e.target.value)}>
                <option value="">Select…</option>
                {effective.map(id => <option key={id} value={id}>{divName(id)}</option>)}
              </select>
            )}
            <Button type="button" variant="outline" className="min-h-9"
              disabled={readOnly || cascadeUnits.isPending || (effective.length > 1 && !unitHomeId)}
              onClick={async () => {
                if (!category) return
                const home = effective.length === 1 ? effective[0] : unitHomeId
                if (!home) return
                if (!confirm(`Move all units under this category to ${divName(home)}?`)) return
                try {
                  const res = await cascadeUnits.mutateAsync({ categoryId: category.id, divisionId: home })
                  toast.success(`Moved ${res.moved} unit(s) to ${divName(home)}`)
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Unit move failed')
                }
              }}>
              Move all units to home division
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})()}
```

- [ ] **Step 4: Persist own-divisions on create/update success**

In the create branch (`create.mutate(... onSuccess)`) use the returned category id; in the edit branch reuse `category.id`. After the existing `toast.success(...)`/before `closeAfterSubmit`, add:
```ts
await setCategoryDivisions.mutateAsync({ categoryId: <newOrExistingId>, divisionIds: ownDivisionIds })
```
(For create, `<newOrExistingId>` is the created row's `id` from the mutation result; for edit it's `category.id`. Wrap in try/catch and surface the raw error with `toast.error`.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0. (If `confirm` triggers an eslint/no-restricted-globals rule, replace with the project's confirm dialog pattern used elsewhere in this dialog.)

- [ ] **Step 6: Commit** (message `feat(inventory): assign divisions on a category (cascade) + tools unit move`).

---

## Task 10: ItemEditDialog — inherited divisions locked

**Files:**
- Modify: `src/components/services/inventory/ItemEditDialog.tsx`

**Interfaces:**
- Consumes: `useItemEffectiveDivisions` (Task 8), `computeDivisionRows` / `editableSelection` (Task 7). Keeps `useSetItemDivisions` for writes.

- [ ] **Step 1: Swap the seed source to effective divisions**

Add import:
```ts
import { useItemEffectiveDivisions } from '@/hooks/useItemDivisions'
import { computeDivisionRows, editableSelection } from '@/lib/inventory/divisionRows'
```
Replace the existing `useItemDivisions(item?.id)` seed usage with:
```ts
const { data: effDivs } = useItemEffectiveDivisions(item?.id ?? null)
// assignedDivisionIds now holds only the EXPLICIT (editable) set:
useEffect(() => { if (effDivs) setAssignedDivisionIds(effDivs.explicit) }, [effDivs])
```

- [ ] **Step 2: Render inherited as checked+locked in the existing grid**

Replace the `divisions.map(...)` block (lines ~476-499) so each checkbox uses `computeDivisionRows`:
```tsx
{computeDivisionRows(divisions.map(d => d.id), { editableIds: assignedDivisionIds, lockedIds: effDivs?.inherited ?? [] }).map((row) => {
  const div = divisions.find(d => d.id === row.id)!
  return (
    <label key={row.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent min-h-9 ${row.locked ? 'opacity-70' : 'hover:border-border hover:bg-muted/30 cursor-pointer'}`}>
      <Checkbox
        checked={row.checked}
        disabled={row.locked}
        onCheckedChange={(v) => setAssignedDivisionIds((cur) => v ? [...cur, row.id] : cur.filter((id) => id !== row.id))}
      />
      <span className="text-xs flex-1 truncate">
        {div.name}
        {div.short_name && <span className="text-[10px] text-muted-foreground"> · {div.short_name}</span>}
        {row.locked && <span className="text-[10px] text-muted-foreground"> · from category</span>}
      </span>
    </label>
  )
})}
```

- [ ] **Step 3: Ensure submit writes only the explicit set**

The existing persist call (`~260-269`) already sends `assignedDivisionIds`, which now holds only explicit ids — no change needed beyond confirming it does not include inherited ids (it won't, because inherited rows are `disabled` and never added to `assignedDivisionIds`).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Commit** (message `feat(inventory): item dialog shows inherited divisions locked`).

---

## Task 11: Docs — flows registry, PROGRESS, EOD, security log

**Files:**
- Modify: `docs/flows-registry.md`, `PROGRESS.md`, `EOD/EOD-2026-08-24.md`

- [ ] **Step 1: Add the flow to `docs/flows-registry.md`** (use the entry template) — Module: Inventory; Trigger surface: CategoryEditDialog / ItemEditDialog / stock receival+transfer; Primary hooks: `useCategoryDivisions`, `useSetCategoryDivisions`, `useCascadeCategoryUnitsDivision`, `useItemEffectiveDivisions`; RPCs: `rpc_set_category_divisions`, `rpc_category_divisions`, `rpc_item_effective_divisions`, `rpc_cascade_category_units_division`, `rpc_item_divisions_by_stock` (modified); Guards: `_user_can_write_catalog` / `inventory.catalog.manage`; Related: `[[Assign item divisions]]`.

- [ ] **Step 2: Update `PROGRESS.md`** — move the task to Completed with today's date and the files touched; add a `## 🔒 Security Audit Log` row: `| 2026-08-24 | Category division cascade | ✅ Secrets | ✅ RLS | ✅ Auth gate | ✅ Error handling | ✅ Layout stability | RPC-only writes on new table; auto-stick trigger idempotent |`.

- [ ] **Step 3: Update `EOD/EOD-2026-08-24.md`** — append the completed task (one line).

- [ ] **Step 4: Commit** (message `docs: flows-registry + PROGRESS + EOD for category-division cascade`).

---

## Task 12: Deploy to new-prod (ship gate — ASK FIRST)

**Files:** none (deployment).

- [ ] **Step 1: Ask the operator to confirm the deploy** (each is a live-DB + Vercel prod change).

- [ ] **Step 2: Apply the 5 migrations to new-prod via psql** (in order):

```bash
set -a && . supabase/.temp/migrate.env && set +a; export PGCLIENTENCODING=UTF8
PSQL="/c/Program Files/PostgreSQL/18/bin/psql.exe"
for f in 20261005000000_category_divisions_table 20261005000100_autostick_item_division \
         20261005000200_item_divisions_by_stock_inherit 20261005000300_category_division_rpcs \
         20261005000400_cascade_category_units_division; do
  "$PSQL" "$NEW_DB_URL" -f "supabase/migrations/${f}.sql" || { echo "FAILED $f"; break; }
done
```

- [ ] **Step 3: Smoke-verify on new-prod** — run the Task 2/3/4/5 `BEGIN…ROLLBACK` verifies against `$NEW_DB_URL` (all safe/rolled back); confirm PASS notices.

- [ ] **Step 4: Push frontend** — after operator OK, push `deploy/warehouse-shipping` (one push = one Vercel prod build). Confirm the Vercel build goes green.

- [ ] **Step 5: Operator smoke on the live app** — assign a division on a top category → sub-categories + items appear under that division's nav filter; item dialog shows inherited locked + lets you add an extra; receive/transfer stock into a division → item stays after stock hits zero; tools category → "Move all units to home" (0 units → moved:0).

---

## Self-Review

- **Spec coverage:** new table (T1), auto-stick trigger (T2), read-RPC inheritance (T3), set/read RPCs (T4), tools units (T5), types (T6), inherited-locked UI logic (T7) + dialogs (T9, T10), hooks (T8), non-destructive (no backfill task — by design), rollout/security/testing (T11, T12). All spec §4 items mapped.
- **Placeholders:** the only intentional parameter is `$DB` (the target connection, defined in Global Constraints) and `<newOrExistingId>` in T9 Step 4 (explained inline: created row id vs `category.id`). No TBD/TODO code.
- **Type consistency:** hook return shapes (`{own,inherited}`, `{explicit,inherited}`, `{moved,skipped}`) match the RPC `jsonb` outputs in T4/T5; `computeDivisionRows(divisionIds, {editableIds, lockedIds})` signature used identically in T7/T9/T10; `editableSelection` used where the explicit set is persisted.
