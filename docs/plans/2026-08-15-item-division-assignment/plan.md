# Item → Division Assignment (rip out "Sharing") — Implementation Plan

> **For agentic workers:** Execute task-by-task. Each task ends with an independently verifiable deliverable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `inventory_items.shared_with_division_ids` (which does double duty as *share-consume grant* + *division membership*) with an explicit `inventory_item_divisions` join table; make consumption **owned-only** and movement **transfer-only**; then layer a **per-division category overlay** (Option B).

**Architecture:** One join table `(item_id, division_id, category_id)`. Buy-side pickers gate on *assignment*; consume/sell pickers gate on *owning stock in the active division*. Category is resolved per active division as `assignment.category_id ?? item.category_id`. Staged cutover — the old column stays live until every reader is repointed, then dropped last.

**Tech Stack:** Next.js 15 + TypeScript, TanStack Query v5, Supabase Postgres (RLS + SECURITY DEFINER RPCs), cmdk pickers.

## Global Constraints

- **Migrations:** author in `supabase/migrations/YYYYMMDDHHMMSS_*.sql`, apply with `npx supabase db push` to **staging** (`mwvblpgbgxipvrevkeff`) only during this window, and **mirror the identical file** into `supabase/migrations-staging/`. Apply to **new-prod** (`optishfnnctrhffpoywg`) only at ship time via `db query --db-url "$NEW_DB_URL"`.
- **Verify every write path** with a rolled-back `DO $$ … $$` probe before claiming done; fetch live function bodies with `pg_get_functiondef` before any `CREATE OR REPLACE`.
- **`tsc --noEmit` + `eslint` clean** after every code task. Never `next build` unless asked.
- **Do not drop the column** until a repo-wide grep for `shared_with_division_ids` returns only `database.types.ts` (regenerated last).
- **Commits:** one logical change each; HEREDOC message with both trailers:
  ```
  Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Commit only after the operator confirms the golden-path smoke works** (per project commit policy).
- After `supabase gen types`, re-append the four `DBTable/DBInsert/DBUpdate/AllTables` helper aliases (CLI wipes them).
- **Flow registry:** register/adjust affected flows in `docs/flows-registry.md` in the same commit as the code.

## File Structure

**New:**
- `supabase/migrations/20260825000000_inventory_item_divisions.sql` — table + RLS + indexes + backfill (+ mirror).
- `supabase/migrations/20260825000100_rewrite_rpc_item_divisions_by_stock.sql` — repoint RPC (+ mirror).
- `supabase/migrations/20260825000200_rpc_set_item_divisions.sql` — assignment replace-set RPC (+ mirror).
- `supabase/migrations/20260825000300_drop_shared_with_division_ids.sql` — drop column (+ mirror). **Phase 1 last.**
- `src/hooks/useItemDivisions.ts` — read an item's assignments; expose the replace-set mutation.
- `src/lib/inventory/resolveItemCategory.ts` — **Phase 2** shared category-resolution helper.

**Modified (Phase 1):** `useCascadeAccessibleItems.ts`, `useItemDivisionMembership.ts`, `DeliveryFormDialog.tsx`, `useInventoryImport.ts`, `ItemEditDialog.tsx`, `database.types.ts`. **Delete:** `useDeliveryLineItemShares.ts`.

**Modified (Phase 2):** the picker/tree consumers + consumption/spend report grouping + `ItemEditDialog.tsx` (per-division category picker).

---

# PHASE 1 — Rip out sharing → explicit assignment

## Task 1.1 — Create `inventory_item_divisions` + backfill

**Files:** Create `supabase/migrations/20260825000000_inventory_item_divisions.sql` (+ mirror to `supabase/migrations-staging/`).

**Interfaces — Produces:** table `public.inventory_item_divisions(item_id, division_id, category_id, created_at, created_by)`, PK `(item_id, division_id)`.

- [ ] **Step 1 — Write the migration**

```sql
-- 20260825000000_inventory_item_divisions.sql
create table if not exists public.inventory_item_divisions (
  item_id     uuid not null references public.inventory_items(id)      on delete cascade,
  division_id uuid not null references public.company_divisions(id)    on delete cascade,
  category_id uuid          references public.inventory_categories(id) on delete set null,
  created_at  timestamptz not null default now(),
  created_by  uuid          references public.user_data(id),
  primary key (item_id, division_id)
);

create index if not exists idx_iid_division on public.inventory_item_divisions(division_id);
create index if not exists idx_iid_category on public.inventory_item_divisions(category_id) where category_id is not null;

alter table public.inventory_item_divisions enable row level security;

create policy iid_select on public.inventory_item_divisions
  for select using (true);
create policy iid_ins on public.inventory_item_divisions
  for insert with check (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));
create policy iid_upd on public.inventory_item_divisions
  for update using (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));
create policy iid_del on public.inventory_item_divisions
  for delete using (_user_has_permission(_current_user_data_id(), 'inventory.catalog.manage'));

-- Backfill: every existing share becomes an assignment, filed under the item's
-- current canonical category (so display is byte-identical until an overlay is set).
insert into public.inventory_item_divisions (item_id, division_id, category_id)
select ii.id, d.division_id, ii.category_id
from public.inventory_items ii
cross join lateral unnest(ii.shared_with_division_ids) as d(division_id)
where ii.shared_with_division_ids is not null
on conflict (item_id, division_id) do nothing;
```

- [ ] **Step 2 — Apply + mirror**: `npx supabase db push`; copy the file into `supabase/migrations-staging/`.
- [ ] **Step 3 — Verify counts tie back**

```sql
-- Rows in new table must equal total elements across all shared arrays.
select
  (select count(*) from public.inventory_item_divisions) as assignments,
  (select coalesce(sum(cardinality(shared_with_division_ids)),0)
     from public.inventory_items where shared_with_division_ids is not null) as share_elems;
```
Expected: `assignments = share_elems` (or ≥ if arrays had dupes; investigate any gap).

- [ ] **Step 4 — Verify RLS write is permission-gated** (rolled-back probe with a non-manager JWT should raise; a manager JWT should insert). Roll back.
- [ ] **Step 5 — Commit** (migration + mirror only).

## Task 1.2 — Repoint `rpc_item_divisions_by_stock` to the new table

**Files:** Create `supabase/migrations/20260825000100_rewrite_rpc_item_divisions_by_stock.sql` (+ mirror). This transparently fixes `useItemDivisionsByStock.ts` (it only calls the RPC — no TS change).

- [ ] **Step 1 — Confirm the live body first**: `select pg_get_functiondef('public.rpc_item_divisions_by_stock'::regproc);` (baseline captured in design §—; re-confirm it hasn't drifted).
- [ ] **Step 2 — Write the migration** (only branch (a) changes; the stock union (b) is untouched):

```sql
CREATE OR REPLACE FUNCTION public.rpc_item_divisions_by_stock(p_type text)
 RETURNS TABLE(item_id uuid, category_id uuid, division_ids uuid[])
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select ii.id, ii.category_id,
         coalesce(
           ( select array_agg(distinct d)
             from (
               -- (a) explicit division assignment (was shared_with_division_ids)
               select idv.division_id as d
               from public.inventory_item_divisions idv
               where idv.item_id = ii.id
               union
               -- (b) divisions where the item currently holds stock (unchanged)
               select sc.division_id
               from public.inventory_item_brand_variants bv
               join public.fifo_cost_layers fcl
                 on fcl.brand_variant_id = bv.id and fcl.remaining_qty > 0
               join public.warehouse_sub_containers sc
                 on sc.id = fcl.sub_container_id and sc.division_id is not null
               where bv.item_id = ii.id
             ) u
             where d is not null
           ),
           '{}'::uuid[]
         ) as division_ids
  from public.inventory_items ii
  join public.inventory_categories ic
    on ic.id = ii.category_id and ic.type::text = p_type
  where ii.status <> 'archived';
$function$;
```

- [ ] **Step 3 — Apply + mirror.**
- [ ] **Step 4 — Verify**: single overload (`select count(*) from pg_proc where proname='rpc_item_divisions_by_stock'` = 1); `prosecdef = true`; call it for a type and confirm an assigned zero-stock item still returns its division. Compare output to the pre-rewrite result for one item (must match, since backfill mirrors the arrays).
- [ ] **Step 5 — Commit.**

## Task 1.3 — Repoint the buy/consume picker (`useCascadeAccessibleItems`)

**Files:** Modify `src/hooks/useCascadeAccessibleItems.ts`.

**Behavior:** buy-side (`requireStock=false`) = **assigned to the active division** (from the new table); consume-side (`requireStock=true`) = **owns stock in the active division** (drop the `shared ∩ has_stock` branch entirely). The `shared_with_division_ids` select is removed.

- [ ] **Step 1 — Replace the shares read with an assignment read.** In the items query, drop `shared_with_division_ids` from the `.select`. Add a query keyed on `effectiveDivisionId`:

```ts
// Item IDs assigned to the active division (buy-side membership).
const assignmentQuery = useQuery({
  queryKey: ['cascade-accessible', 'assignment', type, effectiveDivisionId],
  enabled: effectiveEnabled && !requireStock && !!effectiveDivisionId,
  staleTime: 5 * 60 * 1000,
  queryFn: async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('inventory_item_divisions')
      .select('item_id')
      .eq('division_id', effectiveDivisionId as string)
      .limit(20000)
    if (error) throw error
    return new Set((data ?? []).map((r) => r.item_id as string))
  },
})
```

- [ ] **Step 2 — Rebuild the returned set** in the `useMemo`:
  - `requireStock === false` (buy): `accessibleItemIds = assignmentQuery.data ?? null`; `ownedItemIds = new Set()`.
  - `requireStock === true` (consume): keep the stock query; `accessibleItemIds = ownedByActive`; `ownedItemIds = ownedByActive`. Remove `sharedToActive` and the `owned ∪ shared∩has_stock` union.
- [ ] **Step 3 — Update `isLoading`** to reflect the assignment query on the buy side.
- [ ] **Step 4 — `tsc` + `eslint` clean.**
- [ ] **Step 5 — Commit.**

## Task 1.4 — Repoint `useItemDivisionMembership`

**Files:** Modify `src/hooks/useItemDivisionMembership.ts`; update chip labels at its call sites (`grep -rn useItemDivisionMembership src/`).

- [ ] **Step 1** — Replace the `shared_with_division_ids` select with a read of `inventory_item_divisions` (all rows for the type's items, or grouped `item_id → division_id[]`). Collapse the `sharedWithMeIds` / `sharedByMeIds` split into a single `assignedDivisionsByItem: Map<string,string[]>`.
- [ ] **Step 2** — Update callers to render an **"Assigned"** chip (drop "Shared from …" / "Owner" share language). Keep the stock-owner indication if a caller needs it (derive from the existing stock hooks, not from shares).
- [ ] **Step 3** — `tsc` + `eslint` clean. **Commit.**

## Task 1.5 — Remove cross-division delivery widening

**Files:** Modify `src/components/sales/DeliveryFormDialog.tsx`; **delete** `src/hooks/useDeliveryLineItemShares.ts`.

- [ ] **Step 1** — Remove the import + these lines ([DeliveryFormDialog.tsx:56-57](../../../src/components/sales/DeliveryFormDialog.tsx#L56)):
  ```ts
  const { allShared } = useDeliveryLineItemShares(lineVariantIds)
  const crossDivisionAllowed = soDivisionId !== null && allShared(soDivisionId)
  ```
- [ ] **Step 2** — Simplify `eligibleSubs` to own-division only (keep the legacy `soDivisionId === null` → all-active fallback):
  ```ts
  const eligibleSubs = useMemo(() => {
    const active = allSubs.filter((sc) => sc.is_active)
    if (soDivisionId === null) return active
    return active.filter((sc) => sc.division_id === soDivisionId)
  }, [allSubs, soDivisionId])
  ```
  Remove `lineVariantIds` if now unused.
- [ ] **Step 3** — Delete `useDeliveryLineItemShares.ts`; confirm no other importer (`grep`).
- [ ] **Step 4** — `tsc` + `eslint` clean. **Commit.**

## Task 1.6 — Assignment write path (`rpc_set_item_divisions` + `useItemDivisions`)

**Files:** Create `supabase/migrations/20260825000200_rpc_set_item_divisions.sql` (+ mirror); create `src/hooks/useItemDivisions.ts`.

- [ ] **Step 1 — Migration:** atomic replace-set (preserves `category_id` for divisions that stay):

```sql
CREATE OR REPLACE FUNCTION public.rpc_set_item_divisions(p_item_id uuid, p_division_ids uuid[])
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not _user_has_permission(_current_user_data_id(), 'inventory.catalog.manage') then
    raise exception 'not authorized';
  end if;
  delete from public.inventory_item_divisions
   where item_id = p_item_id
     and not (division_id = any(coalesce(p_division_ids, '{}'::uuid[])));
  insert into public.inventory_item_divisions (item_id, division_id, category_id, created_by)
  select p_item_id, d, (select category_id from public.inventory_items where id = p_item_id), _current_user_data_id()
  from unnest(coalesce(p_division_ids, '{}'::uuid[])) as d
  on conflict (item_id, division_id) do nothing;  -- keep existing category overlay
end;
$function$;
revoke all on function public.rpc_set_item_divisions(uuid, uuid[]) from anon;
```

- [ ] **Step 2 — Apply + mirror.** Probe: assign {A,B} then {B,C}; assert final = {B,C} and B's `category_id` survived. Roll back.
- [ ] **Step 3 — Hook** `useItemDivisions(itemId)`: query current assignment `division_id[]` for the item; expose a mutation calling `rpc_set_item_divisions`; invalidate the item + cascade-accessible query keys on success.
- [ ] **Step 4 — `tsc` clean. Commit** (migration + mirror + hook).

## Task 1.7 — Item dialog: "Access & Sharing" → "Assigned divisions"

**Files:** Modify `src/components/services/inventory/ItemEditDialog.tsx`.

- [ ] **Step 1** — Replace the `sharedWith` state + the D.12 "Access & Sharing" block ([ItemEditDialog.tsx:378-465](../../../src/components/services/inventory/ItemEditDialog.tsx#L378)) with an **"Assigned divisions"** section: a checkbox per division, seeded from `useItemDivisions(item?.id)`. Copy: *"Divisions that stock and work with this item. Each keeps its own quantity pool; move stock between divisions with a transfer."* Drop the Owner/Shared/"no stock" language.
- [ ] **Step 2** — Remove `shared_with_division_ids` from the item save payload ([ItemEditDialog.tsx:207](../../../src/components/services/inventory/ItemEditDialog.tsx#L207)). On save (create → after the item id exists; edit → immediately), call the `useItemDivisions` mutation with the checked division ids.
- [ ] **Step 3** — Apply the Dropdown-UUID guard + layout-stability rules (checkbox rows already fixed height; no UUIDs shown — division names only).
- [ ] **Step 4** — `tsc` + `eslint` clean. **Commit.**

## Task 1.8 — Importer writes assignments

**Files:** Modify `src/hooks/useInventoryImport.ts`.

- [ ] **Step 1** — Remove `shared_with_division_ids` from the item insert/upsert payloads ([useInventoryImport.ts:327,357](../../../src/hooks/useInventoryImport.ts#L327)).
- [ ] **Step 2** — After items are inserted (ids known), insert `inventory_item_divisions` rows for each imported item × its `defaultDivisionIds` (`category_id` = the item's category), batched via `execute_values`-style chunked insert / a single `.insert([...])` with `onConflict` ignore.
- [ ] **Step 3** — `tsc` clean; dry-run the importer against a small sheet on staging (rolled back) — assert assignment rows land. **Commit.**

## Task 1.9 — Drop the column (LAST) + regen types

**Files:** Create `supabase/migrations/20260825000300_drop_shared_with_division_ids.sql` (+ mirror); regen `src/types/database.types.ts`.

- [ ] **Step 1 — Gate:** `grep -rn shared_with_division_ids src/` must return **zero** hits outside `database.types.ts`. If any remain, stop and finish that task first.
- [ ] **Step 2 — Migration:** `alter table public.inventory_items drop column shared_with_division_ids;`
- [ ] **Step 3 — Apply + mirror.**
- [ ] **Step 4 — Regen types** (`supabase gen types … > src/types/database.types.ts`) and **re-append the 4 helper aliases**. `tsc` clean.
- [ ] **Step 5 — Commit.**

## Task 1.10 — Phase 1 verification & operator smoke

- [ ] Security checklist (Secrets / RLS / Auth gate / Error handling / Layout stability) recorded in PROGRESS `## 🔒 Security Audit Log` — focus: new table has RLS + policies; `rpc_set_item_divisions` perm-gated + anon revoked.
- [ ] **Operator smoke (needs login):** (a) new item → assign to Maintenance only → shows in Maintenance PO picker, hidden in Trading; (b) transfer stock Maintenance→Trading → Trading can now consume it (owns stock), Maintenance cannot consume what it transferred away; (c) delivery picker shows only the SO division's sub-containers; (d) inventory list division filter still groups correctly; (e) Item dialog shows "Assigned divisions", no "Shared" language.
- [ ] On operator "working": ship to new-prod (apply 4 migrations via `db query --db-url`), push frontend, update PROGRESS + EOD.

---

# PHASE 2 — Per-division category overlay (Option B)

**Prereq:** Phase 1 shipped. The `category_id` column already exists and is backfilled to the canonical category, so Phase 2 only makes readers *use* it.

## Task 2.1 — Category-resolution helper + assignment-category hook

**Files:** Create `src/lib/inventory/resolveItemCategory.ts`; extend `useItemDivisions` / add `useItemDivisionCategories(divisionId)`.

- [ ] `resolveItemCategoryId(itemId, activeDivisionId, overlayMap, canonicalMap): string` = `overlayMap.get(item,div) ?? canonicalMap.get(item)`.
- [ ] Hook fetches `(item_id → category_id)` for the active division from `inventory_item_divisions where division_id = active and category_id is not null`.
- [ ] Unit-test the resolver (vitest): overlay present → overlay; overlay null → canonical; no division → canonical. `tsc` clean. **Commit.**

## Task 2.2 — Pickers & inventory tree use the per-division category

**Files:** `useCascadeAccessibleItems.ts` (`itemCategoryMap`), the inventory-list tree builders, `useItemDivisionsByStock` consumers.

- [ ] Where an item is placed under a category for the **active division**, resolve via 2.1 instead of `item.category_id`. Guard: **Products/Spare-parts/Consumables only**; tools keep canonical (single-type).
- [ ] Verify the 3-Ton scenario: Maintenance sees it under Products, Trading under Spare-parts, same variant/stock. `tsc`+`eslint`. **Commit.**

## Task 2.3 — Item dialog per-division category picker

**Files:** `ItemEditDialog.tsx`; extend `rpc_set_item_divisions` to accept `(division_id, category_id)` pairs.

- [ ] Migration: overload/extend the RPC to take a jsonb/array of `{division_id, category_id}` and upsert `category_id` per row (atomic replace-set, still perm-gated, anon revoked). Probe-verify. Mirror.
- [ ] Dialog: next to each checked division, a category picker (side-by-side per the dropdown rule; human-readable labels; default = item's canonical category). `tsc`+`eslint`. **Commit.**

## Task 2.4 — Consumption / spend reports group by per-division category

**Files:** the consumption/spend report RPC(s) + report UI grouping.

- [ ] Group each division's usage under **its own** category via the overlay (fall back to canonical). Verify a team's report reflects its categorization. Probe + operator smoke. **Commit.**

## Task 2.5 — Phase 2 ship

- [ ] Security checklist row; operator smoke; ship migrations to new-prod + push; PROGRESS + EOD.

---

## Self-Review

- **Spec coverage:** membership replacement (1.1–1.4), consume-only (1.3), transfer-only (1.5, transfers themselves unchanged), importer (1.8), UI (1.7), column drop last (1.9), overlay (2.1–2.4) — all mapped.
- **Ordering safety:** column read by nothing new after 1.3–1.8; dropped only in 1.9 behind a grep gate. RPC repointed (1.2) before UI writes (1.6–1.7). Backfill (1.1) precedes every reader switch.
- **Type consistency:** table/columns named identically across tasks (`inventory_item_divisions`, `category_id`); RPCs `rpc_item_divisions_by_stock` / `rpc_set_item_divisions` used consistently.
- **No placeholders:** every migration + hook change shows real SQL/TS; the two RPC bodies are complete.
- **Open confirmations (design §11):** table name, reuse of `inventory.catalog.manage`, tools-excluded overlay, backfill category = canonical.
