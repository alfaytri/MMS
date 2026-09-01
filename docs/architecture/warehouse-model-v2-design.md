# Multi-Division Warehouses + Per-Division Sub-Containers

**Status:** Design approved 2026-07-31
**Source brief:** `docs/next-work-plan.md` § 5
**Related:** `docs/superpowers/specs/2026-07-30-division-switcher-design.md` (Division Switcher — this design builds on the JWT + `is_division_visible()` model)

## Problem

A single physical warehouse may host stock for more than one division. Today `warehouses.division_id` is `NOT NULL` — every warehouse is tied to exactly one division, which forces companies to duplicate warehouses per division or lose division scoping entirely.

## Requirements (from operator)

Verbatim from Mohamed:

> warehouse can able to have multiple division and then inside each warehouse we should be able to create a container for each [division] and upload their data. warehouse RP can see all the division containers. If a user with one division access views a warehouse he should only see his division container.

**Restated:**
1. A warehouse can host stock for multiple divisions simultaneously.
2. Inside each warehouse, there is a per-division **sub-container**. Stock (receivals, transfers, deliveries) lives inside a sub-container.
3. **Access rules:**
   - A user in `warehouse_responsible_persons` for warehouse W sees every sub-container in W regardless of their division access.
   - A user with only one division's access, when viewing W, sees only their division's sub-container in W.
   - **Strict isolation:** if a warehouse contains no sub-container visible to the user, the warehouse itself does not render for that user.

## Model

New hierarchy:

```
Company                          (existing)
  └── Warehouse                  (drops direct division link; belongs to a company)
        ├── Sub-container A      (belongs to Maintenance division)
        ├── Sub-container B      (belongs to Kitchen division)
        └── Sub-container C      (belongs to any other division the warehouse hosts)
```

- Stock (FIFO layers, movements, allocations, adjustments, receival items) lives inside sub-containers. `sub_container_id` is `NOT NULL` on every stock-carrying row after migration.
- A warehouse's company ownership is explicit (`warehouses.company_id NOT NULL`); the old direct `division_id` link is dropped.
- Cross-division stock movement within the same warehouse is expressed as a normal `warehouse_transfers` row where source and destination sub-containers happen to share a warehouse.

## Schema

### New table `public.warehouse_sub_containers`

```sql
CREATE TABLE public.warehouse_sub_containers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  division_id  uuid NOT NULL REFERENCES public.company_divisions(id) ON DELETE RESTRICT,
  name         text NOT NULL,          -- default "<Warehouse Name> — <Division Name>", operator-editable
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.user_data(id) ON DELETE SET NULL,
  UNIQUE (warehouse_id, name)
);

CREATE INDEX idx_wsc_warehouse ON public.warehouse_sub_containers(warehouse_id);
CREATE INDEX idx_wsc_division  ON public.warehouse_sub_containers(division_id);
CREATE INDEX idx_wsc_wh_div    ON public.warehouse_sub_containers(warehouse_id, division_id);
```

Multiple sub-containers per `(warehouse_id, division_id)` are permitted (operator flexibility for physically separated stock within one division), but the auto-provision path creates one per pair.

### Column changes on existing tables

`public.warehouses`:
- ADD `company_id uuid NOT NULL REFERENCES public.companies(id)` (backfilled from `warehouses.division_id → company_divisions.company_id`)
- `division_id` becomes deprecated: nullable during Phase A–D, dropped in Phase E.

`public.fifo_cost_layers`, `public.inventory_stock_movements`, `public.warehouse_stock_allocations`, `public.stock_adjustments`, `public.receival_items`, `public.warehouse_transfer_items`:
- ADD `sub_container_id uuid REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT`
- Nullable during Phase A–B, `NOT NULL` after Phase C backfill.
- Existing `division_id` column stays as a denormalized cache kept in sync by a BEFORE-INSERT/UPDATE trigger.

`public.warehouse_transfers`:
- ADD `from_sub_container_id uuid NOT NULL REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT`
- ADD `to_sub_container_id uuid NOT NULL REFERENCES public.warehouse_sub_containers(id) ON DELETE RESTRICT`
- DROP CONSTRAINT `check_different_warehouses`
- ADD CONSTRAINT `check_different_sub_containers CHECK (from_sub_container_id <> to_sub_container_id)`
- Existing `from_warehouse_id` / `to_warehouse_id` retained as denormalized cache for query speed.

## Row-level security

### Core helper

```sql
CREATE OR REPLACE FUNCTION public.is_sub_container_visible(p_sub_container_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.warehouse_sub_containers sc
     WHERE sc.id = p_sub_container_id
       AND (
         -- Branch A: user's division access covers the sub-container's division.
         --   Reuses is_division_visible() including the JWT active_division_id
         --   narrowing added in the Division Switcher.
         public.is_division_visible(sc.division_id)
         OR
         -- Branch B: user is an RP of the warehouse hosting this sub-container.
         --   Grants cross-division read/write within their own warehouse only.
         EXISTS (
           SELECT 1
             FROM public.warehouse_responsible_persons rp
            WHERE rp.warehouse_id = sc.warehouse_id
              AND rp.profile_id   = public._current_user_data_id()
         )
       )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_sub_container_visible(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.is_sub_container_visible(uuid) TO authenticated, service_role;
```

### Policies

| Table | RESTRICTIVE check |
|---|---|
| `warehouse_sub_containers` | `is_sub_container_visible(id)` |
| `warehouses` (non-virtual) | `EXISTS (SELECT 1 FROM warehouse_sub_containers sc WHERE sc.warehouse_id = warehouses.id AND is_sub_container_visible(sc.id))` |
| `warehouses` (virtual, `is_virtual = TRUE`) | Visible to all authenticated (repair-vendor bookkeeping targets, not sensitive) |
| `fifo_cost_layers`, `inventory_stock_movements`, `warehouse_stock_allocations`, `stock_adjustments`, `receival_items`, `warehouse_transfer_items` | `is_sub_container_visible(sub_container_id)` |
| `warehouse_transfers` | `is_sub_container_visible(from_sub_container_id) OR is_sub_container_visible(to_sub_container_id)` |

The Division Switcher's existing `is_division_visible(division_id)` RESTRICTIVE policies on all six stock tables remain in place. Because rows carry a denormalized `division_id` synced from `sub_container_id`, both checks pass simultaneously; the redundancy is intentional (belt-and-braces).

## Migration path

Five phases, ordered so each phase is independently shippable and revertible until the last.

### Phase A — additive schema (no reads change)
1. `CREATE TABLE warehouse_sub_containers` (empty).
2. Add `sub_container_id` (nullable) to all six stock tables + `warehouse_transfers.from_sub_container_id` / `to_sub_container_id` (nullable at this point).
3. Add `warehouses.company_id` (nullable), backfill from `warehouses.division_id → company_divisions.company_id`.
4. Ship. Nothing reads the new columns yet.

### Phase B — data backfill (safety-net verification)
For every existing warehouse:
1. Auto-create one default sub-container named `<Warehouse Name> — <Division Name>`, owned by that warehouse's current `division_id`.
2. Backfill every stock row: `sub_container_id` = the newly created sub-container's id.
3. Backfill `warehouse_transfers`: `from_sub_container_id` / `to_sub_container_id` = source / destination warehouse's default sub-container.
4. Verify: `SELECT COUNT(*) FROM <table> WHERE sub_container_id IS NULL` = 0 across every stock table and `warehouse_transfers`.
5. Verify: `SELECT COUNT(*) FROM warehouses WHERE company_id IS NULL` = 0.
6. Ship. Reads still use `division_id` policies; sub-container is invisible except in raw SQL.

### Phase C — enforce + flip writes
1. `ALTER TABLE ... ALTER COLUMN sub_container_id SET NOT NULL` on all six stock tables and both `warehouse_transfers` FK columns.
2. `ALTER TABLE warehouses ALTER COLUMN company_id SET NOT NULL`.
3. Add BEFORE-INSERT/UPDATE trigger on each stock table that sets `NEW.division_id = (SELECT division_id FROM warehouse_sub_containers WHERE id = NEW.sub_container_id)`.
4. Update every RPC that writes stock to also set `sub_container_id`:
   - `create_and_approve_receival` — reads `po.division_id`, finds-or-creates the sub-container in the target warehouse.
   - `rpc_process_return_restock` — same (return.division_id → target warehouse's sub-container for that division).
   - `apply_adjustment` — reads sub-container from the source layer being adjusted.
   - `create_transfer_v2` — takes `p_from_sub_container_id` / `p_to_sub_container_id` as new params.
   - `dispatch_transfer` / `receive_transfer` — inherit from transfer header.
   - `deduct_fifo_layers` — reads sub-container from the layer being drained; propagates to `cogs_entries` + `inventory_stock_movements` rows.
   - All Phase 9 damaged-side RPCs (`_record_inventory_disposition`, `rpc_send_damaged_for_repair`, `rpc_return_damaged_from_repair`) — resolve sub-container from source warehouse × disposition's return line division.
5. Add new RLS policies from the table above (does NOT drop existing `is_division_visible()` policies yet).
6. Ship. Writes populate the new column; reads still work via existing division_id policies AND the new sub-container policies (both must pass).

### Phase D — operator-facing UI
1. Master Data → Warehouses: nested "Sub-containers" section per warehouse (list + create/edit/deactivate form). Warehouse creation form drops the division_id picker, adds a company_id picker (required).
2. Receival form: sub-container is derived automatically (from the PO's division and the target warehouse). Operator sees which sub-container the stock will land in, can override to another sub-container of the same division if the warehouse has more than one.
3. Sale delivery form: source sub-container derived from `sale_order.division_id` × source warehouse.
4. Transfer form: source and destination sub-container pickers (filtered to visible ones per user's access).
5. Stock overview pages (warehouse stock, dead stock, aging): sub-container column visible, filterable.
6. Repair vendors: unaffected (virtual warehouses have no sub-containers).
7. Damaged Stock overview (Phase 9.7): sub-container column added.
8. Ship. This is the first phase operators see change.

### Phase E — deprecate legacy columns
1. `ALTER TABLE warehouses DROP COLUMN division_id`.
2. Drop the denormalized `division_id` on stock tables once RLS is confirmed working via `sub_container_id` alone across several weeks of operator use.
3. Drop the sync trigger from Phase C step 3.
4. Ship as a final cleanup migration.

## RPC-level behavior details

### Sub-container auto-provision

Central helper called by every write path that needs to place stock:

```sql
CREATE OR REPLACE FUNCTION public._find_or_create_sub_container(
  p_warehouse_id uuid,
  p_division_id  uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id       uuid;
  v_wh_name  text;
  v_div_name text;
BEGIN
  -- Try to find an existing active sub-container for (warehouse, division).
  -- If the warehouse has multiple sub-containers for the same division (operator
  -- created named ones), we default to the oldest — which is the auto-created one
  -- from Phase B or the operator's first explicit sub-container.
  SELECT id INTO v_id
    FROM public.warehouse_sub_containers
   WHERE warehouse_id = p_warehouse_id
     AND division_id  = p_division_id
     AND is_active
   ORDER BY created_at
   LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT name INTO v_wh_name  FROM public.warehouses         WHERE id = p_warehouse_id;
  SELECT name INTO v_div_name FROM public.company_divisions WHERE id = p_division_id;

  INSERT INTO public.warehouse_sub_containers (warehouse_id, division_id, name, created_by)
  VALUES (p_warehouse_id, p_division_id,
          COALESCE(v_wh_name, 'Warehouse') || ' — ' || COALESCE(v_div_name, 'Division'),
          public._current_user_data_id())
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
```

### Cross-division warehouse transfer example

Maintenance sends 5 units of item X from Warehouse A (Maintenance sub-container) to Warehouse A (Kitchen sub-container):

1. UI submits `create_transfer_v2` with `p_from_sub_container_id = <Maintenance-A>` and `p_to_sub_container_id = <Kitchen-A>`.
2. Both sub-containers happen to sit in Warehouse A. The `check_different_sub_containers` constraint accepts (source ≠ dest sub-container even if same warehouse).
3. Header carries `from_warehouse_id = to_warehouse_id = A` (denormalized cache) and the two sub-container ids.
4. Dispatch decrements FIFO layers in the source sub-container. Receive creates matching layers in the destination sub-container at the same cost basis (mirrors existing per-layer transfer semantics from `2a88e334`).
5. RLS: both Maintenance and Kitchen users see the transfer row (either side satisfies the OR clause). Maintenance still sees only its own sub-container's stock; Kitchen only its own.

## Testing story

- **Migration verification (Phase B):** row-count invariants — every stock row has non-null `sub_container_id`, every warehouse has non-null `company_id`.
- **RLS spot-tests (Phase C):** set `request.jwt.claims` per test persona (owner, division-scoped operator, warehouse RP) and query each RLS-gated table; assert visible row counts match expectations.
- **RPC integration tests (Phase C):** for each RPC modified — feed a PO / return / adjustment / transfer with a known division context, verify the sub-container is picked correctly and the movement rows carry it.
- **UI smoke (Phase D):** for each persona, walk the golden path — receival → delivery → transfer — and verify only the correct sub-containers are pickable / visible.

## Virtual-warehouse sub-container decision (added 2026-07-31)

**Decision:** Option A Variant 1 — `warehouse_sub_containers.division_id` is nullable, but only for sub-containers whose parent warehouse is virtual.

**Context:** Phase B's backfill left 4 `warehouse_transfers` rows with a NULL sub-container FK on the repair-vendor side (2 `damaged_repair_out` with NULL `to_sub_container_id`, 2 `damaged_repair_return_*` with NULL `from_sub_container_id`). Repair-vendor virtual warehouses have `division_id = NULL` and no division ever "owns" units sitting at a vendor, so no real sub-container fits.

**Alternatives considered and rejected:**
- **Nullable sub-container FK on transfer rows + CHECK constraint (Option B)** — leaves NULL landmines scattered across multiple high-traffic columns. Every reader has to remember "might be NULL if the counterpart is virtual." Small papercuts everywhere.
- **Separate `from_repair_vendor_id` / `to_repair_vendor_id` FK columns (Option C)** — bloats every transfer row with columns used only sometimes. Discriminator logic per `transfer_kind` distributes across every read.
- **Fake `System / Repairs` division (Option A Variant 2)** — zero NULLs but adds pretend rows to `company_divisions` that operators can see; every division dropdown has to filter it out.
- **Drop virtual warehouses entirely; give repair a dedicated table (Option D)** — cleanest long-term but ~1 week of Phase 9 refactor for a benefit that only pays back over years. Punted to a possible future phase, not this design.

**Implementation shape for Phase C:**
- `ALTER TABLE warehouse_sub_containers ALTER COLUMN division_id DROP NOT NULL`.
- Add CHECK `division_id IS NOT NULL OR (SELECT is_virtual FROM warehouses WHERE id = warehouse_id) = TRUE` — real warehouses still require a division.
- Extend `_repair_vendor_provision_warehouse` trigger (from `20260802000200_repair_vendors.sql`) to also create one sub-container per newly-provisioned virtual warehouse, `division_id = NULL`, name = `"<Repair Vendor Name>"`.
- One-off migration: create sub-containers for the 2 existing virtual warehouses on staging + backfill the 4 orphan transfer rows.
- Then flip stock/transfer `sub_container_id` columns to NOT NULL.

**RLS composition:** the `is_sub_container_visible()` helper already needed a special case for virtual warehouses (design §Policies row `warehouses (virtual, is_virtual = TRUE)` = visible to all authenticated). That same branch handles virtual sub-containers.

**Read-time semantics:** `"which division owns this stock?"` = `sub_container.division_id`. NULL means "no division — units are at a repair vendor." Semantically true, not a bug.

---

## Scope boundary — what this design does NOT include

- **Not:** operator-visible multi-container-per-division (schema allows it; UI ships single-per-pair with an "advanced" flag for a later phase if needed).
- **Not:** cost / margin reporting per sub-container (aggregated per-division reporting stays unchanged; sub-container is a placement dimension, not a P&L dimension in this scope).
- **Not:** sub-container-level approval workflows (transfers already have approval; sub-containers inherit).
- **Not:** temp warehouses (§ 4 of the next-work plan — separate spec).
- **Not:** running while any code path still reads `warehouses.division_id`. Phase C's RPC sweep covers every writer including the Phase 9 damaged-side code; Phase E cannot drop `warehouses.division_id` until a full grep confirms zero remaining readers.

## Estimated effort

- Phase A: 1 migration, 2 h.
- Phase B: 1–2 migrations, 4 h (backfill + verification queries).
- Phase C: ~10 migrations (one per updated RPC family), 2 focused days.
- Phase D: ~15 files touched across warehouse-oriented pages, 1 focused week.
- Phase E: 1 migration, 1 h.

**Total: ~2 focused weeks of implementation.**

## Definition of done

- Every stock-carrying row has non-null `sub_container_id`.
- `warehouses.division_id` is gone; `warehouses.company_id` is `NOT NULL`.
- A user with single-division access, viewing a warehouse that hosts other divisions' sub-containers, sees only their own sub-container's stock and cannot enumerate the others.
- A user in `warehouse_responsible_persons` for a warehouse sees every sub-container in that warehouse regardless of division.
- Warehouses with no sub-container visible to the user do not render for that user.
- All existing Phase 9 damaged-side flows keep working (they carry the sub-container through the same auto-provision helper).
- Cross-division same-warehouse transfers work via `warehouse_transfers` with source ≠ destination sub-container.
