# Category-Level Division Assignment with Cascade — Design Spec

**Date:** 2026-08-24
**Branch:** `deploy/warehouse-shipping`
**Author:** brainstormed with the operator (Mohamed Ismail)
**Status:** Draft for review → then implementation plan

---

## 1. Problem

Today an item's "which divisions is this available to / shared with" is set **per item**
(`inventory_item_divisions`, a checkbox grid in the item dialog). Two pain points:

1. **No category-level assignment.** To put 600 spare-parts into a division you edit 600 items.
   The operator wants to assign divisions **on a category** and have every sub-category + item
   **follow** it.
2. **The stock-derived shortcut is transient.** The read path treats "item has stock in a
   container that belongs to division X" as "item is in X" — but that vanishes when stock hits
   zero. So a division only "sticks" if it was *explicitly* assigned. Kitchen has a container but
   0 items, because nothing was ever explicitly assigned to it.

Current prod reality (new-prod `optishfnnctrhffpoywg`): 951 active items, **900 in a single
division**, **Kitchen empty**, spread Trading 594 · Maintenance 244 · MEP 93 · Pest Control &
Cleaning 71 · Kitchen 0.

## 2. Goal

Let the operator assign one or more **divisions** to an **inventory category**. Sub-categories and
items **inherit** those divisions live (change the category, everything below updates). Same for
**Tools & Assets** (tools live in the same `inventory_categories` tree). Persistent, multi-valued,
non-destructive, with each division keeping its own separate stock pool (unchanged).

### Locked decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Assignment granularity | **Division** (the operator's "containers" = the 5 divisions). Not shelf/sub-container. |
| Cascade model | **Live inheritance** — read-time, no materialization; descendants always reflect the current category assignment. |
| Overrides | **Additive only** — no subtraction. An item/sub-category can *add* divisions but cannot drop one inherited from an ancestor. |
| Auto-stick on stock | **Any inbound stock sticks the item.** When a stock layer lands in a division's container (receival, transfer-receive, return-to-stock, positive adjustment), the item gets a **permanent** item-level assignment to that division. Additive — **never auto-removed** when stock later leaves. Implemented as one trigger on `fifo_cost_layers`. |
| Tools serialized units | Category division = the units' **default home**. An **explicit, confirmed "move all units"** action applies it to descendant units (via the audited transfer logic). Individual units stay **independently transferable** and are **not** clobbered on later category saves. **0 units in prod today.** |
| Existing data | **Non-destructive** — the 1,002 existing `inventory_item_divisions` rows stay as explicit extras. No backfill required. |

### Division name note

**RSH is a company, not a division** — it *owns* the Pest Control & Cleaning division (hence the
slug `RSH-Pest & Cleaning`, code `RPC`). **No rename**: the division stays "Pest Control & Cleaning".
The five divisions map 1:1 to `company_divisions`.

---

## 3. Current architecture (verified against live DB + code)

### Data
- **`inventory_item_divisions`** `(item_id, division_id, category_id, created_by, created_at)`.
  `category_id` is a denormalized copy of the item's own category (1002/1002 match), populated on
  import and by the write RPC. RLS: authenticated SELECT/INSERT/UPDATE/DELETE.
- **`inventory_categories`** — hierarchical via `parent_id`; `type` enum
  (`products | spare-parts | consumables | tools`); `default_sub_container_id` (a soft, indirect
  division link via the container's division). **No division column, no category-division table.**
- **`company_divisions`** — 5 rows (Kitchen, Maintenance, MEP, Pest Control & Cleaning, Trading).
- **`warehouse_sub_containers`** — the "containers"; each has one `division_id`.
- **`tool_asset_units`** `(item_id, division_id, current_custody_location_id, assigned_to, …)` —
  serialized units; **0 rows in prod today**. `tool_unit_assignments` tracks team custody.

### RPCs (the entire blast radius for item→division)
- **Read:** `rpc_item_divisions_by_stock(p_type text)` → per item, `division_ids` =
  **(a) explicit `inventory_item_divisions` ∪ (b) divisions where the item holds stock**
  (`fifo_cost_layers.remaining_qty > 0` → `warehouse_sub_containers.division_id`). *Only reader.*
- **Write:** `rpc_set_item_divisions(p_item_id, p_division_ids[])` — SECDEF, gate
  `_user_can_write_catalog` (= `inventory.catalog.create | edit | manage`), replace-set.
- **Precedent to mirror:** `rpc_cascade_category_tracking_mode(p_category_id, p_mode)` — SECDEF,
  `WITH RECURSIVE subtree` over `parent_id` (depth>0 skips root), skips "locked" rows that hold
  stock/units, returns `jsonb {changed[], locked[]}`.
- **Unit move (audited):** `rpc_transfer_tool_unit(p_unit_id, p_to_division_id, p_notes)` — SECDEF,
  gate `inventory.catalog.manage`; sets `division_id`, and if the division actually changed:
  releases open `tool_unit_assignments` (reason `moved`) + clears `current_custody_location_id`.
- **Stock landing:** every inbound-stock path inserts into **`fifo_cost_layers`**
  `(brand_variant_id, sub_container_id, remaining_qty, …)` — receivals (`create_inventory_receival`),
  transfer-receives (`receive_transfer`), returns, positive adjustments. Existing `AFTER INSERT`
  triggers on that table: `trg_create_tool_units_on_receival`, `trg_fifo_stock_summary`,
  `trg_warehouse_stats` (all independent of the new one). `inventory_item_divisions.created_by` and
  `.category_id` are **nullable** (verified) — a trigger-driven insert with nulls is safe.

### Frontend
- Hooks: `useItemDivisions(itemId)` (read, key `['item-divisions', itemId]`),
  `useSetItemDivisions()` (write; invalidates `['item-divisions',id]`,
  `['cascade-accessible','assignment']`, `['item-divisions-by-stock']`),
  `useItemDivisionsByStock(type)` (read, drives tree pruning), `useDivisions()`
  (`company_divisions`: id, slug, name, short_name), `useCreateInventoryCategory` /
  `useUpdateInventoryCategory` / `useCascadeCategoryTrackingMode` (`src/hooks/useInventory.ts`).
- Dialogs: **`ItemEditDialog.tsx`** — "Assigned divisions" checkbox grid (lines ~452-508); state
  `assignedDivisionIds`; seed ~95-106; persist ~260-269. **`CategoryEditDialog.tsx`** — shared by
  inventory **and** tools; `payload` at ~186-195; edit-then-cascade pattern at ~197-224.
- Consumers: `ItemsListView.tsx` (products/spare-parts/consumables) + `ToolsAssetsView.tsx` (tools)
  render recursive `CategoryRow` / `ToolCategoryRow` trees. Division context = tree pruning by the
  nav division filter; **no per-row division chips today.**

---

## 4. Proposed design

### 4.1 New table

```sql
create table public.inventory_category_divisions (
  category_id uuid not null references public.inventory_categories(id) on delete cascade,
  division_id uuid not null references public.company_divisions(id)   on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.user_data(id),
  primary key (category_id, division_id)
);
alter table public.inventory_category_divisions enable row level security;

-- Reads: any authenticated user (catalog is global). Dialog reads may hit the table directly.
create policy icd_select on public.inventory_category_divisions
  for select to authenticated using (true);
-- Writes: NO direct-write policy → INSERT/UPDATE/DELETE only via the SECDEF RPCs below.
-- (Deliberately stricter than the legacy inventory_item_divisions table, which allows direct CRUD.)
```

### 4.2 Read model — live additive inheritance (modify the one reader)

Rewrite `rpc_item_divisions_by_stock(p_type)` to add branch **(c)**: divisions inherited from the
item's category **and all its ancestors**. Illustrative body (final SQL verified against the live
function def before shipping, per the migration self-check rule):

```sql
create or replace function public.rpc_item_divisions_by_stock(p_type text)
returns table(item_id uuid, category_id uuid, division_ids uuid[])
language sql stable security definer set search_path to 'public'
as $$
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
        -- (a) explicit item-level assignment
        select idv.division_id as d
        from public.inventory_item_divisions idv where idv.item_id = ii.id
        union
        -- (b) divisions where the item currently holds stock (unchanged)
        select sc.division_id
        from public.inventory_item_brand_variants bv
        join public.fifo_cost_layers fcl on fcl.brand_variant_id = bv.id and fcl.remaining_qty > 0
        join public.warehouse_sub_containers sc on sc.id = fcl.sub_container_id and sc.division_id is not null
        where bv.item_id = ii.id
        union
        -- (c) NEW: inherited from the item's category chain (self + ancestors)
        select icd.division_id
        from cat_anc ca
        join public.inventory_category_divisions icd on icd.category_id = ca.anc_id
        where ca.cat_id = ii.category_id
      ) u where d is not null
    ), '{}'::uuid[]) as division_ids
  from public.inventory_items ii
  join public.inventory_categories ic on ic.id = ii.category_id and ic.type::text = p_type
  where ii.status <> 'archived';
$$;
```

`cat_anc` yields `(category, each-of-its-ancestors-including-itself)`. Because it's read-time,
assigning a division on a top category instantly flows to every descendant item — no writes, no
drift. **Additive** falls out naturally: the union only *adds* divisions; there is no way to
subtract an inherited one.

### 4.3 New RPCs

**(1) Write category divisions** — pure, mirrors `rpc_set_item_divisions`:

```sql
create or replace function public.rpc_set_category_divisions(p_category_id uuid, p_division_ids uuid[])
returns void language plpgsql security definer set search_path to 'public' as $$
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
$$;
revoke all on function public.rpc_set_category_divisions(uuid, uuid[]) from public, anon;
grant execute on function public.rpc_set_category_divisions(uuid, uuid[]) to authenticated;
```

No catalog cascade needed (reads are live). Tools-unit movement is a **separate, explicit** RPC (3).

**(2) Read own + inherited (for the dialogs)** — `rpc_category_divisions(p_category_id)` returns
`jsonb {own: uuid[], inherited: uuid[]}` (inherited = strict ancestors only, so the dialog can show
inherited as checked+locked and own as editable). A sibling `rpc_item_effective_divisions(p_item_id)`
returns `{explicit: uuid[], inherited: uuid[]}` for `ItemEditDialog` (inherited = the item's whole
category chain incl. its own category). Both SECDEF, `revoke public/anon`, `grant authenticated`.

**(3) Tools — overwrite descendant units** — `rpc_cascade_category_units_division(p_category_id, p_division_id)`
returns `jsonb {moved: int, skipped: text[]}`. Recursive descendant walk (mirror
`rpc_cascade_category_tracking_mode`); for every serialized unit under the subtree whose
`division_id is distinct from p_division_id`, apply the **exact** `rpc_transfer_tool_unit` logic
(set `division_id`; release open `tool_unit_assignments` with reason `moved`; clear
`current_custody_location_id`). Gate `inventory.catalog.manage` (same as the transfer RPC).
This is an **explicit, opt-in** bulk action — it does **not** fire automatically on category save,
so a unit the operator later transferred elsewhere is preserved unless they re-run it. Called by the
frontend **only** for `type='tools'`, after the operator picks the physical-home division and
confirms. Today it moves 0 rows.

### 4.4 Frontend

**New hooks** (`src/hooks/useCategoryDivisions.ts`):
- `useCategoryDivisions(categoryId)` → `{ own, inherited }` from `rpc_category_divisions`.
- `useSetCategoryDivisions()` → calls `rpc_set_category_divisions`; on success invalidates
  `['category-divisions', id]`, `['item-divisions-by-stock']` (refreshes tree pruning), and the
  categories tree keys.
- `useCascadeCategoryUnitsDivision()` → calls `rpc_cascade_category_units_division`; returns
  `{ moved, skipped }`.
- Extend item read: `useItemEffectiveDivisions(itemId)` → `{ explicit, inherited }`.

**`CategoryEditDialog.tsx`** — add an "Assigned divisions" section mirroring `ItemEditDialog`
lines 452-508:
- Checkbox grid over `useDivisions()`. **Own** divisions = editable; **inherited** (from
  `useCategoryDivisions().inherited`) = checked + `disabled`, with a "· inherited from *Parent*"
  hint (additive → cannot uncheck).
- On create/update success, call `useSetCategoryDivisions({ categoryId, divisionIds: own })`.
- **Tools only:** the category-division save itself does **not** move units. It offers a separate,
  explicit **"Move all units to home division"** button. When >1 division is assigned, a compact
  **"Physical home for units"** single-select chooses the target; with exactly 1 it's implicit. On
  click: confirm ("This will move N units to X"), then `useCascadeCategoryUnitsDivision`, toast
  `{moved, skipped}` (mirror the tracking-mode toast ~206-221). Units transferred elsewhere later
  are untouched unless the operator clicks it again. Reserve height for the row (Security §5).

**`ItemEditDialog.tsx`** — switch the grid seed to `useItemEffectiveDivisions`: inherited-from-
category divisions render checked + `disabled` ("· from category"); explicit item-level ones stay
editable. Submit path unchanged (`useSetItemDivisions` writes only the explicit set).

### 4.5 Auto-stick item→division on stock landing (trigger)

To make "stock in a container ⇒ the item **belongs** to that division" **permanent** (today it's
transient), add one `AFTER INSERT` trigger on `fifo_cost_layers` — this catches *every* inbound
path (receival, transfer-receive, return, positive adjustment) without editing each RPC:

```sql
create or replace function public._autostick_item_division() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_item uuid; v_div uuid;
begin
  if new.remaining_qty <= 0 then return new; end if;
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
$$;
create trigger trg_autostick_item_division
  after insert on public.fifo_cost_layers
  for each row execute function public._autostick_item_division();
```

**Idempotent** (`on conflict do nothing`) → internal layer splits/carves in an already-assigned
division are no-ops. **Never removes** on stock-out (additive). `created_by`/`category_id` left as
the row default (both nullable — verified). Coexists with the four existing layer triggers (fires by
alpha order, independent effect). This is what fulfils the "any inbound stock" decision.

**Out of scope for v1 (YAGNI):** per-row division chips on the category/item tree (nice-to-have
follow-up); rolling existing item-level rows up into categories (non-destructive maintenance script,
later); shelf/sub-container-level assignment; the exceptions/subtraction model.

---

## 5. Rollout

1. Migration `supabase/migrations/<ts>_category_divisions_cascade.sql` — new table + RLS + the 3/4
   RPCs + the read-RPC rewrite. **Mirror the file to `supabase/migrations-staging/`** (same commit).
2. Apply to **staging** (`mwvblpgbgxipvrevkeff`) first; verify. Then to **new-prod**
   (`optishfnnctrhffpoywg`) at ship time (batch-push / ask-before-deploy rule — each deploy push is
   a Vercel prod build).
3. `supabase gen types` → regen `database.types.ts` and **re-append the 4 helper aliases**.
4. Update `docs/flows-registry.md` (new flow: "Assign divisions to category (cascade)") **in the
   code commit**. Update `PROGRESS.md` + EOD + the Security Audit Log.

## 6. Testing

- **DB (verify silently):** `rpc_item_divisions_by_stock` now includes inherited (rolled-back `DO`
  block: assign a category division, confirm a zero-stock descendant item now reports it);
  `rpc_set_category_divisions` rejects unauthorized; `rpc_category_divisions` / effective RPCs return
  correct own/inherited; units cascade moves + reports skipped; **auto-stick trigger** — rolled-back
  `DO` block inserts a `fifo_cost_layers` row into a division's container and confirms an
  `inventory_item_divisions` row appears (and a second insert is a no-op); single overload, no stale
  table refs.
- **Operator smoke:** assign a division on a top category → sub-categories + items appear under that
  division's nav filter; item dialog shows inherited locked + lets you add an extra; receive/transfer
  stock into a division → the item stays assigned there after stock hits zero; tools category →
  "Move all units to home" + confirm (0 units today, so a clean no-op with `moved: 0`).

## 7. Security checklist

1. **Secrets** — none introduced. ✅
2. **RLS** — new table RLS **enabled**; SELECT `to authenticated`; **no direct write policy** →
   writes only through SECDEF RPCs (stricter than legacy `inventory_item_divisions`). ✅
3. **Auth gate** — `rpc_set_category_divisions` → `_user_can_write_catalog`; units cascade →
   `inventory.catalog.manage`; all new SECDEF funcs `revoke public/anon` + `grant authenticated`. The
   auto-stick trigger is SECDEF and has no user gate by design — it fires only inside already-gated
   stock-landing operations (receival/transfer RPCs), so it inherits their authorization. ✅
4. **Error handling** — RPCs `raise` on unauthorized/invalid; frontend surfaces the **raw** DB error
   message (per the surface-raw-errors rule), not a generic string. ✅
5. **Layout stability** — inherited checkboxes are disabled in place (no reflow); the tools
   "physical home" selector + confirm row use reserved `min-h`. ✅

## 8. Risk

Small. One read path changes (`rpc_item_divisions_by_stock`); everything else is additive (new
table, new RPCs, one trigger, two dialog sections). The tools-unit move is the only mutation of
physical records — explicit/opt-in, audited via the existing transfer logic, currently a no-op
(0 units). The auto-stick trigger runs on every `fifo_cost_layers` insert but is idempotent and
coexists with four existing triggers; worst case it writes one extra additive row per new
(item, division) pair. Additive inheritance + additive auto-stick mean the feature can only *widen*
an item's divisions, never silently remove one.
