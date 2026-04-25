# Inventory — Complete Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire every inventory flow — receival approval, delivery completion, stock reservation, adjustments, and transfers — so that `stock_level`, `average_cost`, FIFO layers, stock movements, and COGS entries are always consistent even under network failures or concurrent writes.

**Architecture:** Multi-step inventory mutations (approve receival, complete delivery, approve adjustment, approve transfer) run entirely inside single Postgres RPCs (`SECURITY DEFINER`) so they are ACID-compliant — either everything commits or nothing does. React Query hooks call one `.rpc()` per action. Simple reads remain direct table queries. Three foundational RPCs (`recalc_average_cost`, `deduct_fifo_layers`, `update_reserved_qty`) are called by the atomic action RPCs, never directly from TypeScript.

**Tech Stack:** Next.js 14, React Query, Supabase (Postgres RPCs + direct table reads), TypeScript

---

## Design Decisions

| Decision | Reason |
|----------|--------|
| Atomic RPCs for approve/complete | Prevents ledger split-brain if browser closes mid-mutation |
| `p_is_transfer` flag on `deduct_fifo_layers` | Skips global `stock_level` decrement — transfers don't change the total |
| `RAISE EXCEPTION` on insufficient stock | Rolls back the transaction; frontend sees a clear error |
| SELECT-only RLS on ledger tables | Writes only happen through `SECURITY DEFINER` RPCs; no client can bypass business logic |
| Single RPC for batch received_qty update | Replaces N×2 round-trips with one call |

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260425000001_inventory_foundation.sql` | Create | New tables with restrictive RLS |
| `supabase/migrations/20260425000002_rpc_recalc_average_cost.sql` | Create | Weighted average from FIFO layers |
| `supabase/migrations/20260425000003_rpc_deduct_fifo_layers.sql` | Create | FIFO deduction with FOR UPDATE + stock guard + transfer flag |
| `supabase/migrations/20260425000004_rpc_update_reserved_qty.sql` | Create | Atomic reserved_qty inc/dec + service_inventory trigger |
| `supabase/migrations/20260425000005_rpc_batch_increment_received_qty.sql` | Create | Batch received_qty update (replaces N×2 loop) |
| `supabase/migrations/20260425000006_rpc_approve_receival.sql` | Create | Atomic: approve/reject receival + FIFO layer creation |
| `supabase/migrations/20260425000007_rpc_complete_delivery_inventory.sql` | Create | Atomic: mark delivered + FIFO deduction + COGS |
| `supabase/migrations/20260425000008_rpc_approve_stock_adjustment.sql` | Create | Atomic: approve adjustment + FIFO increase/decrease |
| `supabase/migrations/20260425000009_rpc_approve_warehouse_transfer.sql` | Create | Atomic: approve transfer + warehouse FIFO shift |
| `src/hooks/useReceivals.ts` | Modify | Populate brand_variant_id on create; call atomic RPC on approve |
| `src/hooks/useSaleDeliveries.ts` | Modify | Call atomic RPC on complete; TS handles invoice + follow-up stub |
| `src/hooks/useSaleOrders.ts` | Modify | Reserve stock on confirm; release on cancel |
| `src/hooks/useWarehouseOperations.ts` | Modify | Call atomic RPCs for adjustment and transfer approval |
| `src/hooks/useInventoryLedger.ts` | Create | Query hooks for COGS entries and stock movements |

---

## Task 1: DB Migration — Foundation Tables + Restrictive RLS

**Files:**
- Create: `supabase/migrations/20260425000001_inventory_foundation.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000001_inventory_foundation.sql

-- ─── New columns on existing tables ───────────────────────────────────────────

ALTER TABLE inventory_brand_variants
  ADD COLUMN IF NOT EXISTS reserved_qty INT NOT NULL DEFAULT 0;

ALTER TABLE fifo_cost_layers
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

CREATE INDEX IF NOT EXISTS idx_fifo_warehouse ON fifo_cost_layers(brand_variant_id, warehouse_id);

ALTER TABLE receival_items
  ADD COLUMN IF NOT EXISTS brand_variant_id UUID REFERENCES inventory_brand_variants(id);

-- ─── inventory_stock_movements ────────────────────────────────────────────────
-- Operational ledger. Written ONLY by SECURITY DEFINER RPCs — never directly from the client.

CREATE TABLE IF NOT EXISTS inventory_stock_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id     UUID REFERENCES warehouses(id),
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id),
  item_name        TEXT NOT NULL,
  sku              TEXT,
  movement_type    TEXT NOT NULL,
  qty              INT NOT NULL,
  unit_cost        NUMERIC NOT NULL DEFAULT 0,
  reference_type   TEXT,
  reference_id     UUID,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inventory_stock_movements ENABLE ROW LEVEL SECURITY;
-- Read-only for clients; RPCs (SECURITY DEFINER) bypass RLS for writes
CREATE POLICY "Internal can read stock_movements"
  ON inventory_stock_movements FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_stock_mvmt_variant ON inventory_stock_movements(brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_mvmt_ref ON inventory_stock_movements(reference_type, reference_id);

-- ─── cogs_entries ─────────────────────────────────────────────────────────────
-- Financial ledger. Append-only. Written ONLY by SECURITY DEFINER RPCs.

CREATE TABLE IF NOT EXISTS cogs_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id),
  sale_delivery_id UUID,
  sale_order_id    UUID,
  qty              INT NOT NULL,
  unit_cost        NUMERIC NOT NULL,
  total_cost       NUMERIC NOT NULL,
  date             DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cogs_entries ENABLE ROW LEVEL SECURITY;
-- Read-only for clients; RPCs handle all inserts
CREATE POLICY "Internal can read cogs_entries"
  ON cogs_entries FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cogs_variant ON cogs_entries(brand_variant_id);
CREATE INDEX IF NOT EXISTS idx_cogs_delivery ON cogs_entries(sale_delivery_id);

-- ─── service_inventory ────────────────────────────────────────────────────────
-- Links services to brand variants. UI needs full CRUD so uses standard policies.

CREATE TABLE IF NOT EXISTS service_inventory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id       UUID NOT NULL,
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id),
  qty_per_service  NUMERIC NOT NULL DEFAULT 1,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, brand_variant_id)
);

ALTER TABLE service_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal can manage service_inventory"
  ON service_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_service_inv_service ON service_inventory(service_id);
CREATE INDEX IF NOT EXISTS idx_service_inv_variant ON service_inventory(brand_variant_id);
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected: no errors. Verify:
```bash
npx supabase db diff --linked
```
Expected: empty diff.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000001_inventory_foundation.sql
git commit -m "feat(inventory): foundation migration — tables, columns, restrictive RLS"
```

---

## Task 2: RPC — `recalc_average_cost`

**Files:**
- Create: `supabase/migrations/20260425000002_rpc_recalc_average_cost.sql`

Called by the atomic action RPCs after any change to FIFO layers. Not called directly from TypeScript.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000002_rpc_recalc_average_cost.sql

CREATE OR REPLACE FUNCTION recalc_average_cost(p_bv_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg NUMERIC;
BEGIN
  SELECT
    CASE
      WHEN SUM(remaining_qty) = 0 THEN 0
      ELSE SUM(remaining_qty * total_unit_cost) / SUM(remaining_qty)
    END
  INTO v_avg
  FROM fifo_cost_layers
  WHERE brand_variant_id = p_bv_id
    AND remaining_qty > 0;

  UPDATE inventory_brand_variants
  SET average_cost = COALESCE(v_avg, 0),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION recalc_average_cost(UUID) TO authenticated;
```

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000002_rpc_recalc_average_cost.sql
git commit -m "feat(inventory): add recalc_average_cost RPC"
```

---

## Task 3: RPC — `deduct_fifo_layers` (with transfer flag + stock guard)

**Files:**
- Create: `supabase/migrations/20260425000003_rpc_deduct_fifo_layers.sql`

Three key behaviors:
1. `FOR UPDATE` row locks prevent double-deduction under concurrent requests.
2. `RAISE EXCEPTION` if qty requested exceeds available stock — rolls back the whole transaction.
3. `p_is_transfer = true` skips the global `stock_level` decrement (transfers don't change the total).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000003_rpc_deduct_fifo_layers.sql

CREATE OR REPLACE FUNCTION deduct_fifo_layers(
  p_bv_id       UUID,
  p_wh_id       UUID,
  p_qty         INT,
  p_is_transfer BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(total_cost NUMERIC, weighted_unit_cost NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r            RECORD;
  remaining    INT := p_qty;
  v_total_cost NUMERIC := 0;
  v_take       INT;
BEGIN
  -- Walk oldest layers first, locking each row before touching it
  FOR r IN
    SELECT id, remaining_qty, total_unit_cost
    FROM fifo_cost_layers
    WHERE brand_variant_id = p_bv_id
      AND (
        (p_wh_id IS NOT NULL AND warehouse_id = p_wh_id)
        OR (p_wh_id IS NULL AND warehouse_id IS NULL)
      )
      AND remaining_qty > 0
    ORDER BY date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining = 0;

    v_take := LEAST(remaining, r.remaining_qty);

    UPDATE fifo_cost_layers
    SET remaining_qty = remaining_qty - v_take
    WHERE id = r.id;

    v_total_cost := v_total_cost + (v_take * r.total_unit_cost);
    remaining    := remaining - v_take;
  END LOOP;

  -- Guard: if we couldn't satisfy the full quantity, roll everything back
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: requested %, missing % units for variant %',
      p_qty, remaining, p_bv_id;
  END IF;

  -- Skip global stock_level update for warehouse-to-warehouse transfers
  IF NOT p_is_transfer THEN
    UPDATE inventory_brand_variants
    SET stock_level = stock_level - p_qty,
        updated_at  = now()
    WHERE id = p_bv_id;
  END IF;

  -- Recalculate weighted average after deduction
  PERFORM recalc_average_cost(p_bv_id);

  RETURN QUERY SELECT
    v_total_cost,
    CASE WHEN p_qty = 0 THEN 0::NUMERIC ELSE v_total_cost / p_qty END;
END;
$$;

GRANT EXECUTE ON FUNCTION deduct_fifo_layers(UUID, UUID, INT, BOOLEAN) TO authenticated;
```

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

- [ ] **Step 3: Smoke-test (SQL editor on local dev DB)**

```sql
-- Test 1: normal deduction
SELECT * FROM deduct_fifo_layers('<bv_id>', '<wh_id>', 5, false);
-- Verify remaining_qty decreased on oldest layer(s)
SELECT id, remaining_qty FROM fifo_cost_layers WHERE brand_variant_id = '<bv_id>' ORDER BY date;
-- Verify stock_level decreased
SELECT stock_level FROM inventory_brand_variants WHERE id = '<bv_id>';

-- Test 2: transfer flag skips stock_level change
SELECT stock_level FROM inventory_brand_variants WHERE id = '<bv_id>';  -- note it
SELECT * FROM deduct_fifo_layers('<bv_id>', '<wh_id>', 2, true);
SELECT stock_level FROM inventory_brand_variants WHERE id = '<bv_id>';  -- must be unchanged

-- Test 3: insufficient stock raises exception
SELECT * FROM deduct_fifo_layers('<bv_id>', '<wh_id>', 999999, false);
-- Expected: ERROR: Insufficient stock: ...
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260425000003_rpc_deduct_fifo_layers.sql
git commit -m "feat(inventory): deduct_fifo_layers RPC — FOR UPDATE, transfer flag, stock guard"
```

---

## Task 4: RPC — `update_reserved_qty` + `service_inventory` trigger

**Files:**
- Create: `supabase/migrations/20260425000004_rpc_update_reserved_qty.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000004_rpc_update_reserved_qty.sql

-- Atomically increment or decrement reserved_qty, floored at 0
CREATE OR REPLACE FUNCTION update_reserved_qty(
  p_bv_id UUID,
  p_delta  INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE inventory_brand_variants
  SET reserved_qty = GREATEST(0, reserved_qty + p_delta),
      updated_at   = now()
  WHERE id = p_bv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_reserved_qty(UUID, INT) TO authenticated;

-- Cache linked_services_count on brand_variants for LC allocation
ALTER TABLE inventory_brand_variants
  ADD COLUMN IF NOT EXISTS linked_services_count INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION fn_update_linked_services_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE inventory_brand_variants
    SET linked_services_count = linked_services_count + 1
    WHERE id = NEW.brand_variant_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE inventory_brand_variants
    SET linked_services_count = GREATEST(0, linked_services_count - 1)
    WHERE id = OLD.brand_variant_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_linked_services_count ON service_inventory;
CREATE TRIGGER trg_update_linked_services_count
  AFTER INSERT OR DELETE ON service_inventory
  FOR EACH ROW EXECUTE FUNCTION fn_update_linked_services_count();
```

- [ ] **Step 2: Apply and verify**

```bash
npx supabase db push
```

SQL smoke-test:
```sql
SELECT update_reserved_qty('<bv_id>', 10);
SELECT reserved_qty FROM inventory_brand_variants WHERE id = '<bv_id>';  -- +10

SELECT update_reserved_qty('<bv_id>', -50);
SELECT reserved_qty FROM inventory_brand_variants WHERE id = '<bv_id>';  -- 0, not negative
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000004_rpc_update_reserved_qty.sql
git commit -m "feat(inventory): update_reserved_qty RPC and service_inventory count trigger"
```

---

## Task 5: RPC — `batch_increment_received_qty` (replaces N×2 loop)

**Files:**
- Create: `supabase/migrations/20260425000005_rpc_batch_increment_received_qty.sql`

Replaces the for-loop in `useCreateReceival` that did `SELECT received_qty` + `UPDATE` per line item (N×2 round trips → 1 call).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000005_rpc_batch_increment_received_qty.sql

-- p_updates: [{ "id": "<po_line_item_id>", "delta": <qty> }, ...]
CREATE OR REPLACE FUNCTION batch_increment_received_qty(p_updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec JSONB;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE po_line_items
    SET received_qty = GREATEST(0, received_qty + (rec->>'delta')::INT)
    WHERE id = (rec->>'id')::UUID;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION batch_increment_received_qty(JSONB) TO authenticated;
```

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000005_rpc_batch_increment_received_qty.sql
git commit -m "feat(inventory): batch_increment_received_qty RPC — replaces N×2 loop"
```

---

## Task 6: RPC — `approve_receival_inventory` (Atomic)

**Files:**
- Create: `supabase/migrations/20260425000006_rpc_approve_receival.sql`

The entire approve/reject logic runs in one transaction. If the browser closes after this call starts, Postgres either commits everything or rolls back completely.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000006_rpc_approve_receival.sql

-- Returns po_id so the client can invalidate PO caches
CREATE OR REPLACE FUNCTION approve_receival_inventory(
  p_receival_id UUID,
  p_action      TEXT   -- 'approved' | 'rejected'
)
RETURNS UUID   -- po_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receival   RECORD;
  v_item       RECORD;
  v_bv_ids     UUID[] := '{}';
  v_bv_id      UUID;
BEGIN
  -- Fetch receival header
  SELECT id, po_id, receival_number, warehouse_id, date
  INTO v_receival
  FROM receivals
  WHERE id = p_receival_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receival % not found', p_receival_id;
  END IF;

  -- Update status
  UPDATE receivals SET status = p_action WHERE id = p_receival_id;

  IF p_action = 'rejected' THEN
    -- Roll back received_qty on all non-free po_line_items in one statement
    UPDATE po_line_items pli
    SET received_qty = GREATEST(0, pli.received_qty - ri.qty_received)
    FROM receival_items ri
    WHERE ri.receival_id = p_receival_id
      AND ri.po_line_item_id = pli.id
      AND ri.is_free = FALSE;

    RETURN v_receival.po_id;
  END IF;

  -- APPROVED: create FIFO layers + stock movements + increment stock_level
  FOR v_item IN
    SELECT item_name, sku, qty_received, unit_cost, brand_variant_id
    FROM receival_items
    WHERE receival_id = p_receival_id
      AND is_free = FALSE
      AND brand_variant_id IS NOT NULL
      AND qty_received > 0
  LOOP
    -- FIFO layer
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_item.brand_variant_id, v_receival.warehouse_id, p_receival_id, v_receival.receival_number,
      v_receival.date, v_item.qty_received, v_item.unit_cost, 0, v_item.unit_cost, v_item.qty_received
    );

    -- Increment global stock_level
    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_item.qty_received,
        updated_at  = now()
    WHERE id = v_item.brand_variant_id;

    -- Stock movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      v_receival.warehouse_id, v_item.brand_variant_id, v_item.item_name, v_item.sku,
      'purchase_receival', v_item.qty_received, v_item.unit_cost, 'receival', p_receival_id
    );

    -- Collect unique brand_variant_ids for average cost recalculation
    IF NOT (v_item.brand_variant_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_item.brand_variant_id;
    END IF;
  END LOOP;

  -- Recalculate average_cost for each affected variant
  FOREACH v_bv_id IN ARRAY v_bv_ids
  LOOP
    PERFORM recalc_average_cost(v_bv_id);
  END LOOP;

  RETURN v_receival.po_id;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_receival_inventory(UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

- [ ] **Step 3: Smoke-test via SQL editor**

```sql
-- With a pending_approval receival that has items with brand_variant_id:
SELECT approve_receival_inventory('<receival_id>', 'approved');
-- Verify:
SELECT status FROM receivals WHERE id = '<receival_id>';           -- 'approved'
SELECT remaining_qty FROM fifo_cost_layers WHERE receival_id = '<receival_id>';  -- qty_received
SELECT stock_level, average_cost FROM inventory_brand_variants WHERE id = '<bv_id>';  -- increased
SELECT movement_type FROM inventory_stock_movements WHERE reference_id = '<receival_id>';  -- 'purchase_receival'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260425000006_rpc_approve_receival.sql
git commit -m "feat(inventory): atomic approve_receival_inventory RPC"
```

---

## Task 7: RPC — `complete_delivery_inventory` (Atomic)

**Files:**
- Create: `supabase/migrations/20260425000007_rpc_complete_delivery_inventory.sql`

Marks the delivery as delivered, deducts FIFO, writes COGS and stock movements — all in one transaction. Invoice update and follow-up stub creation remain in TypeScript (they are separate concerns with no atomicity requirement against inventory).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000007_rpc_complete_delivery_inventory.sql

CREATE OR REPLACE FUNCTION complete_delivery_inventory(
  p_delivery_id UUID,
  p_so_id       UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_delivery  RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_wh_id     UUID;
  v_date      DATE;
  v_result    RECORD;
BEGIN
  -- Fetch delivery header
  SELECT warehouse_id, date, items
  INTO v_delivery
  FROM sale_deliveries
  WHERE id = p_delivery_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery % not found', p_delivery_id;
  END IF;

  v_wh_id := v_delivery.warehouse_id;
  v_date  := COALESCE(v_delivery.date, CURRENT_DATE);

  -- Mark as delivered
  UPDATE sale_deliveries SET status = 'delivered', updated_at = now() WHERE id = p_delivery_id;

  -- Process each item in the JSONB array
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_delivery.items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty_delivered')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Deduct FIFO — raises EXCEPTION if insufficient stock (rolls back whole tx)
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_bv_id, v_wh_id, v_qty, false);

    -- COGS entry
    INSERT INTO cogs_entries (
      brand_variant_id, sale_delivery_id, sale_order_id,
      qty, unit_cost, total_cost, date
    ) VALUES (
      v_bv_id, p_delivery_id, p_so_id,
      v_qty, v_result.weighted_unit_cost, v_result.total_cost, v_date
    );

    -- Stock movement (negative qty = outbound)
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id,
      item_name, sku, movement_type, qty, unit_cost,
      reference_type, reference_id
    ) VALUES (
      v_wh_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''),
      v_item->>'sku',
      'sale_delivery', -v_qty, v_result.weighted_unit_cost,
      'sale_delivery', p_delivery_id
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_delivery_inventory(UUID, UUID) TO authenticated;
```

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

- [ ] **Step 3: Smoke-test**

```sql
-- With a pending delivery that has items with brand_variant_id and enough stock:
SELECT complete_delivery_inventory('<delivery_id>', '<so_id>');
SELECT status FROM sale_deliveries WHERE id = '<delivery_id>';          -- 'delivered'
SELECT total_cost FROM cogs_entries WHERE sale_delivery_id = '<delivery_id>';
SELECT qty FROM inventory_stock_movements WHERE reference_id = '<delivery_id>';  -- negative

-- Test insufficient stock guard:
-- Temporarily set all fifo layer remaining_qty to 0 for a variant, then:
SELECT complete_delivery_inventory('<delivery_id_with_that_variant>', '<so_id>');
-- Expected: ERROR: Insufficient stock: ...
-- Verify delivery status is still 'pending' (rollback)
SELECT status FROM sale_deliveries WHERE id = '<delivery_id_with_that_variant>';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260425000007_rpc_complete_delivery_inventory.sql
git commit -m "feat(inventory): atomic complete_delivery_inventory RPC — FIFO + COGS"
```

---

## Task 8: RPC — `approve_stock_adjustment_inventory` (Atomic)

**Files:**
- Create: `supabase/migrations/20260425000008_rpc_approve_stock_adjustment.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000008_rpc_approve_stock_adjustment.sql

CREATE OR REPLACE FUNCTION approve_stock_adjustment_inventory(
  p_adjustment_id  UUID,
  p_approved_by    TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_adj     RECORD;
  v_bv      RECORD;
  v_qty     INT;
BEGIN
  SELECT brand_variant_id, warehouse_id, adjustment_type, qty::INT, reason
  INTO v_adj
  FROM stock_adjustments
  WHERE id = p_adjustment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found', p_adjustment_id;
  END IF;

  v_qty := v_adj.qty;

  -- Mark as approved
  UPDATE stock_adjustments
  SET status = 'approved', approved_by_name = p_approved_by, approved_at = now()
  WHERE id = p_adjustment_id;

  IF v_adj.adjustment_type = 'increase' THEN
    -- Use current average_cost as the cost basis for the new layer
    SELECT average_cost, stock_level INTO v_bv
    FROM inventory_brand_variants WHERE id = v_adj.brand_variant_id;

    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_adj.brand_variant_id, v_adj.warehouse_id, CURRENT_DATE,
      v_qty, COALESCE(v_bv.average_cost, 0), 0, COALESCE(v_bv.average_cost, 0), v_qty
    );

    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty, updated_at = now()
    WHERE id = v_adj.brand_variant_id;

    PERFORM recalc_average_cost(v_adj.brand_variant_id);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      v_qty, COALESCE(v_bv.average_cost, 0), 'adjustment', p_adjustment_id, v_adj.reason
    );

  ELSIF v_adj.adjustment_type = 'decrease' THEN
    -- deduct_fifo_layers handles stock_level decrement, average_cost recalc, and RAISES if insufficient
    PERFORM deduct_fifo_layers(v_adj.brand_variant_id, v_adj.warehouse_id, v_qty, false);

    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, movement_type,
      qty, unit_cost, reference_type, reference_id, notes
    ) VALUES (
      v_adj.warehouse_id, v_adj.brand_variant_id, '', 'adjustment',
      -v_qty, 0, 'adjustment', p_adjustment_id, v_adj.reason
    );

  ELSE
    RAISE EXCEPTION 'Unknown adjustment_type: %', v_adj.adjustment_type;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_stock_adjustment_inventory(UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000008_rpc_approve_stock_adjustment.sql
git commit -m "feat(inventory): atomic approve_stock_adjustment_inventory RPC"
```

---

## Task 9: RPC — `approve_warehouse_transfer_inventory` (Atomic, No Flip-Flop)

**Files:**
- Create: `supabase/migrations/20260425000009_rpc_approve_warehouse_transfer.sql`

Uses `p_is_transfer = true` on `deduct_fifo_layers` so the global `stock_level` is never touched during a transfer. No round-trip needed to re-add it back.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000009_rpc_approve_warehouse_transfer.sql

CREATE OR REPLACE FUNCTION approve_warehouse_transfer_inventory(
  p_transfer_id   UUID,
  p_approved_by   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer  RECORD;
  v_item      JSONB;
  v_bv_id     UUID;
  v_qty       INT;
  v_result    RECORD;
BEGIN
  SELECT from_warehouse_id, to_warehouse_id, date, items
  INTO v_transfer
  FROM warehouse_transfers
  WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id;
  END IF;

  -- Mark as approved
  UPDATE warehouse_transfers
  SET status = 'approved',
      approved_by_name = p_approved_by,
      approved_date = CURRENT_DATE
  WHERE id = p_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_transfer.items)
  LOOP
    v_bv_id := (v_item->>'brand_variant_id')::UUID;
    v_qty   := (v_item->>'qty')::INT;

    CONTINUE WHEN v_bv_id IS NULL OR v_qty IS NULL OR v_qty <= 0;

    -- Deduct from source warehouse; p_is_transfer=true skips global stock_level change
    SELECT total_cost, weighted_unit_cost
    INTO v_result
    FROM deduct_fifo_layers(v_bv_id, v_transfer.from_warehouse_id, v_qty, TRUE);

    -- Create new FIFO layer in destination warehouse at the same weighted cost
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, date,
      qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, v_transfer.to_warehouse_id, COALESCE(v_transfer.date, CURRENT_DATE),
      v_qty, v_result.weighted_unit_cost, 0, v_result.weighted_unit_cost, v_qty
    );

    -- Two movement records: out from source, in to destination
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES
    (
      v_transfer.from_warehouse_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''), v_item->>'sku',
      'transfer_out', -v_qty, v_result.weighted_unit_cost, 'transfer', p_transfer_id
    ),
    (
      v_transfer.to_warehouse_id, v_bv_id,
      COALESCE(v_item->>'item_name', ''), v_item->>'sku',
      'transfer_in', v_qty, v_result.weighted_unit_cost, 'transfer', p_transfer_id
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION approve_warehouse_transfer_inventory(UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: Apply**

```bash
npx supabase db push
```

- [ ] **Step 3: Smoke-test**

```sql
-- Approve a transfer and verify global stock_level is unchanged
SELECT stock_level FROM inventory_brand_variants WHERE id = '<bv_id>';  -- note it
SELECT approve_warehouse_transfer_inventory('<transfer_id>', 'Test User');
SELECT stock_level FROM inventory_brand_variants WHERE id = '<bv_id>';  -- must be same
-- Verify source FIFO layers decreased, destination has a new layer
SELECT warehouse_id, remaining_qty FROM fifo_cost_layers WHERE brand_variant_id = '<bv_id>' ORDER BY created_at;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260425000009_rpc_approve_warehouse_transfer.sql
git commit -m "feat(inventory): atomic approve_warehouse_transfer_inventory RPC — no flip-flop"
```

---

## Task 10: Update TypeScript Hooks — Wire to Atomic RPCs

**Files:**
- Modify: `src/hooks/useReceivals.ts`
- Modify: `src/hooks/useSaleDeliveries.ts`
- Modify: `src/hooks/useWarehouseOperations.ts`

The hooks are now thin wrappers: look up data needed for cache invalidation, call the atomic RPC, invalidate queries.

### 10A: Update `useCreateReceival` — batch received_qty + populate brand_variant_id

In `src/hooks/useReceivals.ts`, add `brand_variant_id` to the `ReceivalItem` type:

- [ ] **Step 1: Update the type**

```typescript
export type ReceivalItem = {
  id: string
  receival_id: string
  po_line_item_id: string | null
  item_name: string
  sku: string | null
  qty_received: number
  unit_cost: number
  is_free: boolean | null
  brand_variant_id: string | null   // ← new
  ordered_qty?: number
}
```

- [ ] **Step 2: Replace the items insert block in `useCreateReceival` mutationFn**

Replace the block from `if (payload.items.length > 0) {` through the closing `}` (around lines 143–171) with:

```typescript
if (payload.items.length > 0) {
  // Batch-fetch brand_variant_id for all po_line_item_ids in one round-trip
  const poLineIds = payload.items
    .map(it => it.po_line_item_id)
    .filter((id): id is string => !!id)

  let bvMap: Record<string, string | null> = {}
  if (poLineIds.length > 0) {
    const { data: poLines } = await (supabase as any)
      .from('po_line_items')
      .select('id, brand_variant_id')
      .in('id', poLineIds)
    for (const pl of poLines ?? []) {
      bvMap[pl.id] = pl.brand_variant_id ?? null
    }
  }

  const { error: iErr } = await (supabase as any)
    .from('receival_items')
    .insert(
      payload.items.map((it) => ({
        receival_id: receival.id,
        po_line_item_id: it.po_line_item_id,
        item_name: it.item_name,
        sku: it.sku,
        qty_received: it.qty_received,
        unit_cost: it.unit_cost,
        is_free: it.is_free ?? false,
        brand_variant_id: it.po_line_item_id ? (bvMap[it.po_line_item_id] ?? null) : null,
      }))
    )
  if (iErr) throw iErr

  // Batch update received_qty — one RPC call instead of N×2 round trips
  const updates = payload.items
    .filter(it => it.po_line_item_id && !it.is_free)
    .map(it => ({ id: it.po_line_item_id!, delta: it.qty_received }))

  if (updates.length > 0) {
    const { error: batchErr } = await (supabase as any)
      .rpc('batch_increment_received_qty', { p_updates: updates })
    if (batchErr) throw batchErr
  }
}
```

### 10B: Replace `useApproveReceival` mutationFn

- [ ] **Step 3: Rewrite `useApproveReceival` to call the atomic RPC**

```typescript
export function useApproveReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approved' | 'rejected' }) => {
      const supabase = createClient()

      // Fetch po_id and receival_number for activity log and cache invalidation
      const { data: receival } = await (supabase as any)
        .from('receivals')
        .select('po_id, receival_number')
        .eq('id', id)
        .single()

      // Single atomic RPC — all FIFO + stock_level + movements happen or none do
      const { error } = await (supabase as any)
        .rpc('approve_receival_inventory', { p_receival_id: id, p_action: action })
      if (error) throw error

      const approvalPerformer = await resolveMyName()
      await logPOActivity({
        poId: receival?.po_id,
        action: action === 'approved' ? 'Receival Approved' : 'Receival Rejected',
        details: receival?.receival_number ?? id,
        performerName: approvalPerformer,
        severity: action === 'rejected' ? 'warning' : 'info',
      })

      return receival?.po_id as string | null
    },
    onSuccess: (poId) => {
      queryClient.invalidateQueries({ queryKey: ['receivals'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      if (poId) {
        queryClient.invalidateQueries({ queryKey: ['po-receivals', poId] })
        queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] })
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      }
    },
  })
}
```

### 10C: Replace `useCompleteDelivery` mutationFn

- [ ] **Step 4: Rewrite `useCompleteDelivery` in `src/hooks/useSaleDeliveries.ts`**

```typescript
export function useCompleteDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      deliveryId,
      soId,
      invoiceId,
      remainingItems,
    }: {
      deliveryId: string
      soId: string
      invoiceId: string | null
      remainingItems: DeliveryItem[]
    }) => {
      const supabase = createClient()

      // Single atomic RPC: marks delivered + deducts FIFO + writes COGS + movements
      // Raises an exception (and rolls everything back) if stock is insufficient
      const { error } = await (supabase as any)
        .rpc('complete_delivery_inventory', { p_delivery_id: deliveryId, p_so_id: soId })
      if (error) throw new Error(error.message)  // surface "Insufficient stock" to the UI

      // Invoice update (separate, non-inventory concern — no atomicity needed with FIFO)
      if (invoiceId) {
        const { data: inv } = await (supabase as any)
          .from('invoices')
          .select('needs_refresh, doc_status')
          .eq('id', invoiceId)
          .single()
        if (inv && !inv.needs_refresh && inv.doc_status === 'draft') {
          await (supabase as any)
            .from('invoices')
            .update({ doc_status: 'ready_to_send' })
            .eq('id', invoiceId)
        }
      }

      // Create follow-up delivery stub for remaining items (partial delivery)
      if (remainingItems.length > 0) {
        const { data: orig } = await (supabase as any)
          .from('sale_deliveries')
          .select('sale_order_id')
          .eq('id', deliveryId)
          .single()
        if (orig) {
          const { count } = await (supabase as any)
            .from('sale_deliveries')
            .select('*', { count: 'exact', head: true })
          const delivery_number = `DEL-${String((count ?? 0) + 1).padStart(5, '0')}`
          await (supabase as any).from('sale_deliveries').insert({
            delivery_number,
            sale_order_id: orig.sale_order_id,
            warehouse_id: null,
            date: new Date().toISOString().split('T')[0],
            items: remainingItems,
            status: 'pending',
          })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-deliveries'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      queryClient.invalidateQueries({ queryKey: ['cogs-entries'] })
    },
  })
}
```

### 10D: Replace `useApproveStockAdjustment` and `useApproveTransfer`

- [ ] **Step 5: Rewrite both in `src/hooks/useWarehouseOperations.ts`**

Replace `useApproveStockAdjustment` (lines ~301–313):

```typescript
export function useApproveStockAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approvedByName }: { id: string; approvedByName: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .rpc('approve_stock_adjustment_inventory', {
          p_adjustment_id: id,
          p_approved_by: approvedByName,
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock_adjustments'] })
      qc.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
    },
  })
}
```

Replace `useApproveTransfer` (lines ~236–248):

```typescript
export function useApproveTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approvedByName }: { id: string; approvedByName: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .rpc('approve_warehouse_transfer_inventory', {
          p_transfer_id: id,
          p_approved_by: approvedByName,
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse_transfers'] })
      qc.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
      qc.invalidateQueries({ queryKey: ['fifo-layers'] })
    },
  })
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useReceivals.ts src/hooks/useSaleDeliveries.ts src/hooks/useWarehouseOperations.ts
git commit -m "feat(inventory): wire TS hooks to atomic RPCs — one .rpc() per action"
```

---

## Task 11: Stock Reservation — Wire to Sale Orders

**Files:**
- Modify: `src/hooks/useSaleOrders.ts`

- [ ] **Step 1: Read the existing file to locate `useCreateSaleOrder` and the cancel mutation**

```bash
grep -n "useCreateSaleOrder\|useCancelSaleOrder\|sale_order_lines" D:/MMS/src/hooks/useSaleOrders.ts | head -20
```

- [ ] **Step 2: Add reservation calls after SO insert succeeds in `useCreateSaleOrder`**

After the sale order insert, add:

```typescript
// Reserve stock for each line item linked to a brand variant
const lines: { brand_variant_id: string | null; qty: number }[] = payload.lines ?? []
for (const line of lines) {
  if (!line.brand_variant_id || line.qty <= 0) continue
  await (supabase as any).rpc('update_reserved_qty', {
    p_bv_id: line.brand_variant_id,
    p_delta: line.qty,
  })
}
```

- [ ] **Step 3: Add release calls in the cancel mutation**

Before or after marking the SO cancelled, fetch its lines and release:

```typescript
const { data: lines } = await (supabase as any)
  .from('sale_order_lines')
  .select('brand_variant_id, qty')
  .eq('sale_order_id', id)

for (const line of lines ?? []) {
  if (!line.brand_variant_id || line.qty <= 0) continue
  await (supabase as any).rpc('update_reserved_qty', {
    p_bv_id: line.brand_variant_id,
    p_delta: -line.qty,
  })
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Manual test**

1. Create a sale order with a line item that has `brand_variant_id`
2. Verify `reserved_qty` increased
3. Cancel the SO; verify `reserved_qty` returned to prior value

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useSaleOrders.ts
git commit -m "feat(inventory): reserve stock on SO creation, release on cancellation"
```

---

## Task 12: `useInventoryLedger` — Query Hooks for COGS + Movements

**Files:**
- Create: `src/hooks/useInventoryLedger.ts`

- [ ] **Step 1: Write the file**

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CogsEntry = {
  id: string
  brand_variant_id: string
  sale_delivery_id: string | null
  sale_order_id: string | null
  qty: number
  unit_cost: number
  total_cost: number
  date: string
  created_at: string
}

export function useCogsEntries(brandVariantId?: string) {
  return useQuery({
    queryKey: ['cogs-entries', brandVariantId],
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('cogs_entries')
        .select('*')
        .eq('brand_variant_id', brandVariantId)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as CogsEntry[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useStockMovementsByVariant(brandVariantId?: string) {
  return useQuery({
    queryKey: ['stock_movements', 'by_variant', brandVariantId],
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_stock_movements')
        .select('*')
        .eq('brand_variant_id', brandVariantId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useServiceInventoryLinks(brandVariantId?: string) {
  return useQuery({
    queryKey: ['service-inventory', brandVariantId],
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_inventory')
        .select('*')
        .eq('brand_variant_id', brandVariantId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useInventoryLedger.ts
git commit -m "feat(inventory): useInventoryLedger — COGS and movement query hooks"
```

---

## Task 13: Integration Check + PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Full TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 2: End-to-end manual test of the complete lifecycle**

Run this sequence and verify in Supabase Table Editor after each step:

1. **Receival creation:** Create a receival for a PO with `brand_variant_id` on its line items. Check `receival_items.brand_variant_id` is populated.
2. **Receival approval:** Approve it. Check `fifo_cost_layers` (new row), `stock_level` increased, `average_cost` updated, `stock_movements` has `purchase_receival`.
3. **Sale order:** Create a SO for the same variant. Check `reserved_qty` increased.
4. **Delivery completion:** Complete the delivery. Check FIFO layers decreased, `cogs_entries` has a row, `stock_movements` has negative `sale_delivery`, `stock_level` decreased.
5. **SO cancellation:** Cancel a different SO. Check `reserved_qty` released.
6. **Stock adjustment increase:** Create and approve an increase adjustment. Check new FIFO layer, `stock_movements` `adjustment`, `stock_level` up.
7. **Stock adjustment decrease:** Create and approve a decrease adjustment. Check oldest FIFO layers consumed, `stock_level` down.
8. **Warehouse transfer:** Create and approve a transfer. Check source FIFO layers decreased, destination has new layer, **global `stock_level` unchanged**.
9. **Insufficient stock guard:** Try to complete a delivery for 1000 units with only 5 in stock. Verify the RPC returns an error and delivery status stays `pending`.

- [ ] **Step 3: Update PROGRESS.md**

```markdown
## Inventory Module — Complete (2026-04-25)
- ✅ DB foundation: inventory_stock_movements (SELECT-only RLS), cogs_entries (SELECT-only RLS), service_inventory, reserved_qty, warehouse FIFO
- ✅ RPCs: recalc_average_cost, deduct_fifo_layers (FOR UPDATE, transfer flag, stock guard), update_reserved_qty, batch_increment_received_qty
- ✅ Atomic RPCs: approve_receival_inventory, complete_delivery_inventory, approve_stock_adjustment_inventory, approve_warehouse_transfer_inventory
- ✅ Receival approval: atomic FIFO layer creation + stock_level + movements
- ✅ Delivery completion: atomic FIFO deduction + COGS + movements; surfaces "Insufficient stock" error
- ✅ Sale order creation reserves stock; cancellation releases
- ✅ Stock adjustment approval: atomic FIFO increase/decrease + movement
- ✅ Warehouse transfer: atomic FIFO shift between warehouses, global stock_level unchanged
- ✅ useInventoryLedger: COGS and movement query hooks (ready for LC allocation page)
```

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: mark inventory module complete"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| SELECT-only RLS on ledger tables | Task 1 |
| `recalc_average_cost` RPC | Task 2 |
| `deduct_fifo_layers` with FOR UPDATE | Task 3 |
| `p_is_transfer` flag — no global stock_level change | Task 3 |
| `RAISE EXCEPTION` on insufficient stock | Task 3 |
| `update_reserved_qty` RPC (floored at 0) | Task 4 |
| `linked_services_count` trigger | Task 4 |
| Batch received_qty update (N×2 → 1 call) | Task 5 |
| Atomic receival approve/reject | Task 6 |
| Atomic delivery complete + COGS | Task 7 |
| Atomic adjustment approve | Task 8 |
| Atomic transfer approve (no flip-flop) | Task 9 |
| TS hooks call single `.rpc()` per action | Task 10 |
| brand_variant_id populated on receival_items | Task 10 |
| Stock reserve on SO create / release on cancel | Task 11 |
| COGS + movement query hooks | Task 12 |

**No placeholders.** All tasks contain complete SQL and TypeScript.

**Type consistency:** `deduct_fifo_layers` is called with `(UUID, UUID, INT, BOOLEAN)` in all callers (Tasks 7, 8, 9). `approve_receival_inventory` returns `UUID` (po_id); the TS hook ignores the return value and reads po_id separately for the activity log. RPC parameter names (`p_receival_id`, `p_action`, `p_delivery_id`, `p_so_id`, `p_adjustment_id`, `p_approved_by`, `p_transfer_id`) match their definitions.
