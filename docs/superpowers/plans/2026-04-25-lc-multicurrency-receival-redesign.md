# LC Multi-Currency Fix + Receival Workflow Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix LC total_amount float-precision bug via a Postgres NUMERIC RPC, and redesign the receival workflow to be atomic on create (no approval step) with an admin-gated edit-request flow covering 10 accounting and concurrency guards.

**Architecture:** Five new Postgres migrations (atomic RPCs, new table, constraint extension) are applied first. TypeScript hooks are updated to call the new RPCs. The receivals UI removes approve/reject in favour of a Request Edit → Admin Approve → delta-edit flow. The LC creation dialog gains per-line exchange_rate inputs.

**Tech Stack:** Supabase Postgres (PLPGSQL, SECURITY DEFINER), TanStack Query v5 `useMutation`/`useQuery`, shadcn/ui Dialog + Button + Badge, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/20260425000062_rpc_create_landed_cost.sql` | Create | `create_landed_cost` RPC — NUMERIC total_amount |
| `supabase/migrations/20260425000063_receival_edit_requests.sql` | Create | `receival_edit_requests` table + RLS |
| `supabase/migrations/20260425000064_extend_movement_type.sql` | Create | Add `'receival_edit'` to movement_type CHECK |
| `supabase/migrations/20260425000065_rpc_create_and_approve_receival.sql` | Create | Atomic create+approve receival RPC |
| `supabase/migrations/20260425000066_rpc_apply_receival_edit.sql` | Create | `apply_receival_edit` with all 10 guards |
| `src/hooks/useLandedCosts.ts` | Modify | Add `exchange_rate` to type; `useCreateLandedCost` → RPC |
| `src/hooks/useReceivals.ts` | Modify | Atomic create; remove `useApproveReceival`; add 4 edit-request hooks |
| `src/app/(dashboard)/purchase/landed-costs/page.tsx` | Modify | `CreateLcDialog` per-line exchange_rate input |
| `src/app/(dashboard)/purchase/receivals/page.tsx` | Modify | Remove approve/reject; add Request Edit + admin approve/edit flow |
| `PROGRESS.md` | Modify | Task completion record |

---

### Task 1: DB Migrations — `receival_edit_requests` table + extend `movement_type` CHECK

**Files:**
- Create: `supabase/migrations/20260425000063_receival_edit_requests.sql`
- Create: `supabase/migrations/20260425000064_extend_movement_type.sql`

- [ ] **Step 1: Create receival_edit_requests migration**

```sql
-- supabase/migrations/20260425000063_receival_edit_requests.sql
BEGIN;

CREATE TABLE receival_edit_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receival_id     UUID NOT NULL REFERENCES receivals(id),
  requested_by    UUID NOT NULL REFERENCES profiles(id),
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),
  approved_by     UUID REFERENCES profiles(id),
  rejection_note  TEXT,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ
);

ALTER TABLE receival_edit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can manage receival_edit_requests"
  ON receival_edit_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_rer_receival ON receival_edit_requests(receival_id);
CREATE INDEX idx_rer_status   ON receival_edit_requests(status);

COMMIT;
```

- [ ] **Step 2: Create movement_type extension migration**

```sql
-- supabase/migrations/20260425000064_extend_movement_type.sql
BEGIN;

ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival', 'sale_delivery', 'adjustment',
    'transfer_in', 'transfer_out', 'cost_adjustment', 'receival_edit'
  ));

COMMIT;
```

- [ ] **Step 3: Commit migration files (do not push yet)**

```bash
git add supabase/migrations/20260425000063_receival_edit_requests.sql \
        supabase/migrations/20260425000064_extend_movement_type.sql
git commit -m "feat(db): add receival_edit_requests table and receival_edit movement type"
```

---

### Task 2: DB Migration — `create_and_approve_receival` atomic RPC

**Files:**
- Create: `supabase/migrations/20260425000065_rpc_create_and_approve_receival.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/20260425000065_rpc_create_and_approve_receival.sql
BEGIN;

CREATE OR REPLACE FUNCTION create_and_approve_receival(
  p_po_id            UUID,
  p_warehouse_id     UUID,
  p_date             DATE,
  p_received_by_name TEXT,
  p_receival_number  TEXT,
  p_notes            TEXT,
  p_items            JSONB   -- [{po_line_item_id, item_name, sku, qty_received, unit_cost, is_free, brand_variant_id}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_receival_id UUID;
  v_item        JSONB;
  v_bv_id       UUID;
  v_bv_ids      UUID[] := '{}';
  v_bv_id_elem  UUID;
  v_qty         INT;
  v_cost        NUMERIC;
  v_pli_id      UUID;
BEGIN
  -- Insert receival as approved immediately (no pending_approval step)
  INSERT INTO receivals (
    receival_number, po_id, warehouse_id, date,
    received_by_name, notes, status
  ) VALUES (
    p_receival_number, p_po_id, p_warehouse_id, p_date,
    p_received_by_name, p_notes, 'approved'
  ) RETURNING id INTO v_receival_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_bv_id  := NULLIF(v_item->>'brand_variant_id', '')::UUID;
    v_qty    := (v_item->>'qty_received')::INT;
    v_cost   := (v_item->>'unit_cost')::NUMERIC;
    v_pli_id := NULLIF(v_item->>'po_line_item_id', '')::UUID;

    -- Insert receival_item
    INSERT INTO receival_items (
      receival_id, po_line_item_id, brand_variant_id,
      item_name, sku, qty_received, unit_cost, is_free
    ) VALUES (
      v_receival_id, v_pli_id, v_bv_id,
      v_item->>'item_name',
      NULLIF(v_item->>'sku', ''),
      v_qty, v_cost,
      COALESCE((v_item->>'is_free')::BOOLEAN, false)
    );

    -- Skip inventory updates for free items or items without variant link
    CONTINUE WHEN COALESCE((v_item->>'is_free')::BOOLEAN, false) = TRUE
               OR v_bv_id IS NULL
               OR v_qty <= 0;

    -- FIFO layer (receival_id stored as TEXT per schema)
    INSERT INTO fifo_cost_layers (
      brand_variant_id, warehouse_id, receival_id, receival_number,
      date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
    ) VALUES (
      v_bv_id, p_warehouse_id, v_receival_id::TEXT, p_receival_number,
      p_date, v_qty, v_cost, 0, v_cost, v_qty
    );

    -- Increment global stock_level
    UPDATE inventory_brand_variants
    SET stock_level = stock_level + v_qty,
        updated_at  = now()
    WHERE id = v_bv_id;

    -- Update PO line item received_qty
    IF v_pli_id IS NOT NULL THEN
      UPDATE po_line_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_pli_id;
    END IF;

    -- Stock movement
    INSERT INTO inventory_stock_movements (
      warehouse_id, brand_variant_id, item_name, sku,
      movement_type, qty, unit_cost, reference_type, reference_id
    ) VALUES (
      p_warehouse_id, v_bv_id,
      v_item->>'item_name', NULLIF(v_item->>'sku', ''),
      'purchase_receival', v_qty, v_cost,
      'receival', v_receival_id
    );

    -- Collect distinct brand_variant_ids for average cost recalc
    IF NOT (v_bv_id = ANY(v_bv_ids)) THEN
      v_bv_ids := v_bv_ids || v_bv_id;
    END IF;
  END LOOP;

  -- Recalculate average_cost for every affected variant
  FOREACH v_bv_id_elem IN ARRAY v_bv_ids LOOP
    PERFORM recalc_average_cost(v_bv_id_elem);
  END LOOP;

  RETURN jsonb_build_object('receival_id', v_receival_id, 'receival_number', p_receival_number);
END;
$$;

GRANT EXECUTE ON FUNCTION create_and_approve_receival(UUID, UUID, DATE, TEXT, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260425000065_rpc_create_and_approve_receival.sql
git commit -m "feat(db): add atomic create_and_approve_receival RPC"
```

---

### Task 3: DB Migration — `apply_receival_edit` RPC

**Files:**
- Create: `supabase/migrations/20260425000066_rpc_apply_receival_edit.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/20260425000066_rpc_apply_receival_edit.sql
BEGIN;

CREATE OR REPLACE FUNCTION apply_receival_edit(
  p_edit_request_id UUID,
  p_items           JSONB  -- [{receival_item_id, new_qty, new_unit_cost}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req           RECORD;
  v_receival      RECORD;
  v_item_input    JSONB;
  v_ri            RECORD;
  v_bv_id         UUID;
  v_old_qty       INT;
  v_new_qty       INT;
  v_old_cost      NUMERIC;
  v_new_cost      NUMERIC;
  v_delta         INT;
  v_layer_remaining BIGINT;
  v_sold_qty      BIGINT;
  v_lc_count      INT;
  v_lc_rec        RECORD;
  v_total_remaining BIGINT;
  v_receival_date DATE;
BEGIN
  -- ── 1. Lock and validate the edit request (Fix #8: expiry check) ───────────
  SELECT * INTO v_req FROM receival_edit_requests WHERE id = p_edit_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edit request % not found', p_edit_request_id;
  END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'Edit request % is not approved (status: %)', p_edit_request_id, v_req.status;
  END IF;
  IF v_req.expires_at IS NOT NULL AND v_req.expires_at < now() THEN
    UPDATE receival_edit_requests SET status = 'expired' WHERE id = p_edit_request_id;
    RAISE EXCEPTION 'Edit window expired. Please request a new edit.';
  END IF;

  -- ── 2. Lock the receival ────────────────────────────────────────────────────
  SELECT id, date INTO v_receival FROM receivals WHERE id = v_req.receival_id FOR UPDATE;
  v_receival_date := v_receival.date;

  -- ── 3. Process each item ────────────────────────────────────────────────────
  FOR v_item_input IN SELECT * FROM jsonb_array_elements(p_items) LOOP

    -- Fetch current receival_item values
    SELECT ri.qty_received, ri.unit_cost, ri.brand_variant_id
    INTO v_old_qty, v_old_cost, v_bv_id
    FROM receival_items ri
    WHERE ri.id = (v_item_input->>'receival_item_id')::UUID;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'receival_item % not found', v_item_input->>'receival_item_id';
    END IF;

    v_new_qty  := (v_item_input->>'new_qty')::INT;
    v_new_cost := (v_item_input->>'new_unit_cost')::NUMERIC;
    v_delta    := v_new_qty - v_old_qty;

    -- Skip non-inventory items
    CONTINUE WHEN v_bv_id IS NULL;

    -- ── QTY CHANGE ────────────────────────────────────────────────────────────
    IF v_delta <> 0 THEN
      -- Fix #2: block if any applied LC references this receival
      SELECT COUNT(*) INTO v_lc_count
      FROM landed_costs
      WHERE v_req.receival_id = ANY(attached_receival_ids)
        AND applied_at IS NOT NULL AND voided_at IS NULL;
      IF v_lc_count > 0 THEN
        RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      IF v_delta > 0 THEN
        -- Fix #5: only update this receival's own FIFO layer
        UPDATE fifo_cost_layers
        SET qty          = qty          + v_delta,
            remaining_qty = remaining_qty + v_delta
        WHERE receival_id = v_req.receival_id::TEXT
          AND brand_variant_id = v_bv_id;

        UPDATE inventory_brand_variants
        SET stock_level = stock_level + v_delta, updated_at = now()
        WHERE id = v_bv_id;

        -- Fix #9: movement_type='receival_edit' + reference_id=edit_request_id
        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ibv.item_name, ibv.sku,
               'receival_edit', v_delta, v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty increase edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv WHERE ibv.id = v_bv_id;

      ELSE  -- v_delta < 0
        -- Fix #5: check remaining_qty on this receival's specific FIFO layer only
        SELECT COALESCE(SUM(remaining_qty), 0) INTO v_layer_remaining
        FROM fifo_cost_layers
        WHERE receival_id = v_req.receival_id::TEXT
          AND brand_variant_id = v_bv_id
        FOR UPDATE;

        IF v_layer_remaining < ABS(v_delta) THEN
          RAISE EXCEPTION
            'Cannot reduce qty by %: only % units remain from this receival (% were sold)',
            ABS(v_delta), v_layer_remaining, v_old_qty - v_layer_remaining;
        END IF;

        UPDATE fifo_cost_layers
        SET remaining_qty = remaining_qty - ABS(v_delta)
        WHERE receival_id = v_req.receival_id::TEXT
          AND brand_variant_id = v_bv_id;

        UPDATE inventory_brand_variants
        SET stock_level = stock_level - ABS(v_delta), updated_at = now()
        WHERE id = v_bv_id;

        INSERT INTO inventory_stock_movements
          (brand_variant_id, item_name, sku, movement_type, qty, unit_cost,
           reference_type, reference_id, notes)
        SELECT v_bv_id, ibv.item_name, ibv.sku,
               'receival_edit', -ABS(v_delta), v_old_cost,
               'receival_edit_request', p_edit_request_id,
               'Qty decrease edit on receival ' || v_req.receival_id
        FROM inventory_brand_variants ibv WHERE ibv.id = v_bv_id;
      END IF;
    END IF;

    -- ── UNIT COST CHANGE ──────────────────────────────────────────────────────
    IF v_new_cost <> v_old_cost THEN
      -- Fix #7: block if any applied LC references this receival (weight distortion)
      SELECT COUNT(*) INTO v_lc_count
      FROM landed_costs
      WHERE v_req.receival_id = ANY(attached_receival_ids)
        AND applied_at IS NOT NULL AND voided_at IS NULL;
      IF v_lc_count > 0 THEN
        RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.';
      END IF;

      -- Fix #3: update cogs_entries for already-sold units from this specific layer
      SELECT COALESCE(SUM(qty - remaining_qty), 0) INTO v_sold_qty
      FROM fifo_cost_layers
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;

      IF v_sold_qty > 0 THEN
        UPDATE cogs_entries
        SET unit_cost  = v_new_cost,
            total_cost = v_new_cost * qty
        WHERE id IN (
          SELECT id FROM cogs_entries
          WHERE brand_variant_id = v_bv_id
            AND unit_cost = v_old_cost
            AND date >= v_receival_date
          ORDER BY date ASC
          LIMIT v_sold_qty
        );
      END IF;

      -- Update FIFO layer cost
      UPDATE fifo_cost_layers
      SET unit_cost       = v_new_cost,
          total_unit_cost = v_new_cost + landed_cost_per_unit
      WHERE receival_id = v_req.receival_id::TEXT AND brand_variant_id = v_bv_id;
    END IF;

    -- Recalc average_cost after all changes for this variant
    PERFORM recalc_average_cost(v_bv_id);

    -- Fix #10: all-sold detection for pending LCs after qty decrease
    IF v_delta < 0 THEN
      FOR v_lc_rec IN
        SELECT id, attached_receival_ids
        FROM landed_costs
        WHERE v_req.receival_id = ANY(attached_receival_ids)
          AND applied_at IS NULL AND voided_at IS NULL
      LOOP
        SELECT COALESCE(SUM(fcl.remaining_qty), 0) INTO v_total_remaining
        FROM fifo_cost_layers fcl
        WHERE fcl.receival_id::UUID = ANY(v_lc_rec.attached_receival_ids);

        IF v_total_remaining = 0 THEN
          UPDATE landed_costs
          SET all_items_sold = TRUE, updated_at = now()
          WHERE id = v_lc_rec.id;
        END IF;
      END LOOP;
    END IF;

    -- Persist new values on receival_item
    UPDATE receival_items
    SET qty_received = v_new_qty,
        unit_cost    = v_new_cost
    WHERE id = (v_item_input->>'receival_item_id')::UUID;

  END LOOP;

  -- ── 4. Close the edit token ─────────────────────────────────────────────────
  UPDATE receival_edit_requests SET status = 'completed' WHERE id = p_edit_request_id;

  RETURN jsonb_build_object('ok', true, 'edit_request_id', p_edit_request_id);
END;
$$;

GRANT EXECUTE ON FUNCTION apply_receival_edit(UUID, JSONB) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260425000066_rpc_apply_receival_edit.sql
git commit -m "feat(db): add apply_receival_edit RPC with all 10 accounting guards"
```

---

### Task 4: DB Migration — `create_landed_cost` RPC (NUMERIC precision)

**Files:**
- Create: `supabase/migrations/20260425000062_rpc_create_landed_cost.sql`

- [ ] **Step 1: Create migration**

```sql
-- supabase/migrations/20260425000062_rpc_create_landed_cost.sql
BEGIN;

-- Auto-generate lc_number if not supplied (idempotent trigger)
CREATE OR REPLACE FUNCTION _set_lc_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lc_number IS NULL OR NEW.lc_number = '' THEN
    NEW.lc_number := 'LC-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
      LPAD((SELECT COALESCE(MAX(SUBSTRING(lc_number FROM '\d+$')::INT), 0) + 1
            FROM landed_costs
            WHERE lc_number ~ '^LC-\d{4}-\d+$')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lc_number ON landed_costs;
CREATE TRIGGER trg_set_lc_number
  BEFORE INSERT ON landed_costs
  FOR EACH ROW EXECUTE FUNCTION _set_lc_number();

-- RPC: compute total_amount in NUMERIC to avoid float-point errors (Fix #4)
CREATE OR REPLACE FUNCTION create_landed_cost(
  p_description           TEXT,
  p_date                  DATE,
  p_currency              TEXT,
  p_lines                 JSONB,   -- [{description, amount, currency, exchange_rate}]
  p_attached_receival_ids UUID[],
  p_attached_po_ids       UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_amount NUMERIC;
  v_id           UUID;
BEGIN
  -- Sum in NUMERIC — no JavaScript float rounding (Fix #4)
  SELECT COALESCE(SUM(
    (line->>'amount')::NUMERIC * COALESCE((line->>'exchange_rate')::NUMERIC, 1)
  ), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_lines) AS line;

  INSERT INTO landed_costs (
    description, total_amount, currency,
    lines, attached_receival_ids, attached_po_ids,
    all_items_sold, date
  ) VALUES (
    p_description, v_total_amount, p_currency,
    p_lines, p_attached_receival_ids, p_attached_po_ids,
    false, p_date
  ) RETURNING id INTO v_id;

  RETURN (SELECT row_to_json(lc)::JSONB FROM landed_costs lc WHERE lc.id = v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION create_landed_cost(TEXT, DATE, TEXT, JSONB, UUID[], UUID[]) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260425000062_rpc_create_landed_cost.sql
git commit -m "feat(db): add create_landed_cost RPC with NUMERIC precision and lc_number trigger"
```

---

### Task 5: Push all migrations to Supabase

- [ ] **Step 1: Push**

```bash
npx supabase db push
```

Expected: all 5 migrations applied cleanly, no errors.

- [ ] **Step 2: Verify with diff**

```bash
npx supabase db diff
```

Expected: empty diff.

---

### Task 6: `useReceivals.ts` — atomic create + 4 edit-request hooks

**Files:**
- Modify: `src/hooks/useReceivals.ts`

- [ ] **Step 1: Add `ReceivalEditRequest` type after the `Receival` type (around line 36)**

```typescript
export type ReceivalEditRequest = {
  id: string
  receival_id: string
  requested_by: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired'
  approved_by: string | null
  rejection_note: string | null
  expires_at: string | null
  created_at: string
  approved_at: string | null
}
```

- [ ] **Step 2: Update `CreateReceivalPayload` — add `brand_variant_id` to items**

Replace the existing `CreateReceivalPayload` type (lines 38–51):

```typescript
export type CreateReceivalPayload = {
  po_id: string
  warehouse_id: string
  date: string
  notes: string
  items: {
    po_line_item_id: string | null
    brand_variant_id: string | null   // ← new: pass pre-resolved BV id
    item_name: string
    sku: string | null
    qty_received: number
    unit_cost: number
    is_free?: boolean
  }[]
}
```

- [ ] **Step 3: Replace `useCreateReceival` (lines 109–213)**

Replace the entire function with:

```typescript
export function useCreateReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateReceivalPayload) => {
      const supabase = createClient()

      // Resolve current user's display name for audit trail
      const { data: { user } } = await supabase.auth.getUser()
      let receivedByName: string | null = null
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles').select('full_name').eq('auth_user_id', user.id).maybeSingle()
        receivedByName = profile?.full_name ?? user.email ?? null
      }

      // Generate receival_number (count-based, padded)
      const { count } = await (supabase as any)
        .from('receivals')
        .select('*', { count: 'exact', head: true })
      const receival_number = `RCV-${String((count ?? 0) + 1).padStart(5, '0')}`

      // Single atomic RPC — insert + FIFO + stock_level all in one transaction
      const { data, error } = await (supabase as any).rpc('create_and_approve_receival', {
        p_po_id:            payload.po_id,
        p_warehouse_id:     payload.warehouse_id,
        p_date:             payload.date,
        p_received_by_name: receivedByName,
        p_receival_number:  receival_number,
        p_notes:            payload.notes || null,
        p_items:            payload.items.map(it => ({
          po_line_item_id:  it.po_line_item_id,
          brand_variant_id: it.brand_variant_id,
          item_name:        it.item_name,
          sku:              it.sku,
          qty_received:     it.qty_received,
          unit_cost:        it.unit_cost,
          is_free:          it.is_free ?? false,
        })),
      })
      if (error) throw error

      const regularCount = payload.items.filter(i => !i.is_free).length
      const freeCount    = payload.items.filter(i => i.is_free).length
      await logPOActivity({
        poId: payload.po_id,
        action: 'Receival Recorded',
        details: [
          receival_number,
          regularCount > 0 ? `${regularCount} item(s) received` : null,
          freeCount > 0 ? `${freeCount} free item(s)` : null,
          payload.notes ? `Note: ${payload.notes}` : null,
        ].filter(Boolean).join(' · '),
        performerName: receivedByName,
      })

      return data as { receival_id: string; receival_number: string }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receivals'] })
      queryClient.invalidateQueries({ queryKey: ['po-receivals', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers'] })
    },
  })
}
```

- [ ] **Step 4: Remove `useApproveReceival` (lines 215–254)**

Delete the entire `useApproveReceival` function. It is no longer used — receivals are approved atomically on create.

- [ ] **Step 5: Add the four edit-request hooks at the bottom of the file**

```typescript
// ─── Edit Request Hooks ───────────────────────────────────────────────────────

export function useReceivalEditRequests(receival_id: string | null) {
  return useQuery({
    queryKey: ['receival_edit_requests', receival_id],
    enabled: !!receival_id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receival_edit_requests')
        .select('*')
        .eq('receival_id', receival_id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ReceivalEditRequest[]
    },
  })
}

export function useRequestReceivalEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ receival_id, reason }: { receival_id: string; reason: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user?.id).maybeSingle()
      if (!profile?.id) throw new Error('Profile not found')

      const { data, error } = await (supabase as any)
        .from('receival_edit_requests')
        .insert({ receival_id, requested_by: profile.id, reason, status: 'pending' })
        .select().single()
      if (error) throw error

      // Notify all admin profiles
      const { data: admins } = await (supabase as any)
        .from('profiles').select('id').eq('role', 'admin')
      const notifications = (admins ?? []).map((a: any) => ({
        user_id: a.id,
        title: 'Receival Edit Requested',
        body: `A receival edit was requested: ${reason}`,
        type: 'receival_edit_request',
        reference_id: data.id,
      }))
      if (notifications.length > 0) {
        await (supabase as any).from('notifications').insert(notifications)
      }

      return data as ReceivalEditRequest
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['receival_edit_requests', variables.receival_id] })
    },
  })
}

export function useApproveReceivalEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      request_id, action, rejection_note,
    }: { request_id: string; action: 'approved' | 'rejected'; rejection_note?: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user?.id).maybeSingle()

      const patch: Record<string, unknown> = {
        status: action,
        approved_by: profile?.id ?? null,
      }
      if (action === 'approved') {
        patch.approved_at = new Date().toISOString()
        // 48-hour edit window (Fix #8)
        patch.expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      }
      if (action === 'rejected' && rejection_note) {
        patch.rejection_note = rejection_note
      }

      const { data, error } = await (supabase as any)
        .from('receival_edit_requests')
        .update(patch)
        .eq('id', request_id)
        .select('*, receival_id').single()
      if (error) throw error

      // Notify the requestor
      const { data: req } = await (supabase as any)
        .from('receival_edit_requests')
        .select('requested_by').eq('id', request_id).single()
      if (req?.requested_by) {
        await (supabase as any).from('notifications').insert({
          user_id: req.requested_by,
          title: action === 'approved' ? 'Edit Request Approved' : 'Edit Request Rejected',
          body: action === 'approved'
            ? 'Your receival edit was approved. You have 48 hours to save your changes.'
            : `Your receival edit was rejected. ${rejection_note ?? ''}`,
          type: 'receival_edit_response',
          reference_id: request_id,
        })
      }

      return data as ReceivalEditRequest
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['receival_edit_requests', data.receival_id] })
      qc.invalidateQueries({ queryKey: ['receivals'] })
    },
  })
}

export function useSaveReceivalEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      edit_request_id,
      items,
    }: {
      edit_request_id: string
      items: { receival_item_id: string; new_qty: number; new_unit_cost: number }[]
    }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .rpc('apply_receival_edit', { p_edit_request_id: edit_request_id, p_items: items })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivals'] })
      qc.invalidateQueries({ queryKey: ['receival_edit_requests'] })
      qc.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      qc.invalidateQueries({ queryKey: ['fifo-layers'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
    },
  })
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors in `useReceivals.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useReceivals.ts
git commit -m "feat(hooks): atomic useCreateReceival via RPC + 4 edit-request hooks"
```

---

### Task 7: `useLandedCosts.ts` — `exchange_rate` type + RPC-based create

**Files:**
- Modify: `src/hooks/useLandedCosts.ts`

- [ ] **Step 1: Add `exchange_rate` to `LandedCostLine` type (line 7–11)**

Replace:
```typescript
export type LandedCostLine = {
  description: string
  amount: number
  currency: string
}
```

With:
```typescript
export type LandedCostLine = {
  description: string
  amount: number
  currency: string
  exchange_rate: number   // default 1; used for non-QAR lines
}
```

- [ ] **Step 2: Replace `useCreateLandedCost` mutationFn to call the RPC**

Find and replace the `mutationFn` inside `useCreateLandedCost` (the lines that do the direct `.insert()`):

```typescript
export function useCreateLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateLandedCostPayload) => {
      const supabase = createClient()
      // total_amount computed in Postgres NUMERIC — no JS float rounding (Fix #4)
      const { data, error } = await (supabase as any).rpc('create_landed_cost', {
        p_description:           payload.description ?? null,
        p_date:                  payload.date,
        p_currency:              payload.currency,
        p_lines:                 payload.lines,
        p_attached_receival_ids: payload.attached_receival_ids,
        p_attached_po_ids:       payload.attached_po_ids,
      })
      if (error) throw error
      return data as LandedCost
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useLandedCosts.ts
git commit -m "feat(hooks): exchange_rate on LandedCostLine + useCreateLandedCost via RPC"
```

---

### Task 8: UI — `CreateLcDialog` exchange rate input

**Files:**
- Modify: `src/app/(dashboard)/purchase/landed-costs/page.tsx`

- [ ] **Step 1: Update initial line state — add `exchange_rate: 1`**

Find (around line 293):
```typescript
const [lines, setLines] = useState<LandedCostLine[]>([{ description: '', amount: 0, currency: 'QAR' }])
```

Replace with:
```typescript
const [lines, setLines] = useState<LandedCostLine[]>([{ description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }])
```

- [ ] **Step 2: Update `addLine` to include `exchange_rate: 1`**

Find:
```typescript
function addLine() { setLines((l) => [...l, { description: '', amount: 0, currency: 'QAR' }]) }
```

Replace with:
```typescript
function addLine() { setLines((l) => [...l, { description: '', amount: 0, currency: 'QAR', exchange_rate: 1 }]) }
```

- [ ] **Step 3: Update `updateLine` to reset `exchange_rate` when currency changes to QAR**

Find:
```typescript
function updateLine(i: number, k: keyof LandedCostLine, v: string | number) {
  setLines((l) => l.map((line, idx) => idx === i ? { ...line, [k]: v } : line))
}
```

Replace with:
```typescript
function updateLine(i: number, k: keyof LandedCostLine, v: string | number) {
  setLines((l) => l.map((line, idx) => {
    if (idx !== i) return line
    const updated = { ...line, [k]: v }
    // Reset exchange_rate to 1 when switching back to QAR
    if (k === 'currency' && v === 'QAR') updated.exchange_rate = 1
    return updated
  }))
}
```

- [ ] **Step 4: Update the total calculation to use exchange_rate**

Find:
```typescript
const total = lines.reduce((s, l) => s + Number(l.amount), 0)
```

Replace with:
```typescript
const total = lines.reduce((s, l) => s + Number(l.amount) * Number(l.exchange_rate || 1), 0)
```

- [ ] **Step 5: Add exchange_rate input in the line rows**

Find the line rendering section (around line 352). Each line renders a grid row with description, amount, currency, delete. After the amount input and before the currency select, add the conditional exchange_rate input.

Replace the line row JSX (the `.map((line, i) => ...)` block) with:

```tsx
{lines.map((line, i) => (
  <div key={i} className="grid grid-cols-12 gap-2 items-start">
    <div className="col-span-5">
      <Input
        placeholder="Description (e.g. Air freight)"
        value={line.description}
        onChange={(e) => updateLine(i, 'description', e.target.value)}
      />
    </div>
    <div className="col-span-3">
      <Input
        type="number" min={0} step="0.01"
        placeholder="Amount"
        value={line.amount}
        onChange={(e) => updateLine(i, 'amount', parseFloat(e.target.value) || 0)}
      />
    </div>
    <div className="col-span-2">
      <select
        value={line.currency}
        onChange={(e) => updateLine(i, 'currency', e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
      >
        {['QAR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'KWD'].map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
    {line.currency !== 'QAR' ? (
      <div className="col-span-1">
        <Input
          type="number" min={0} step="0.0001"
          placeholder="Rate"
          title="Exchange rate to QAR"
          value={line.exchange_rate || ''}
          onChange={(e) => updateLine(i, 'exchange_rate', parseFloat(e.target.value) || 1)}
        />
      </div>
    ) : (
      <div className="col-span-1" />
    )}
    <div className="col-span-1 flex items-center gap-1">
      {line.currency !== 'QAR' && line.exchange_rate > 0 && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          ={(Number(line.amount) * Number(line.exchange_rate)).toFixed(2)} QAR
        </span>
      )}
      <Button
        type="button" variant="ghost" size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => removeLine(i)}
        disabled={lines.length === 1}
        aria-label="Remove line"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  </div>
))}
```

- [ ] **Step 6: Update the total label**

Find:
```typescript
<p className="text-sm font-semibold">Total: {formatCurrency(total, currency)}</p>
```

Replace with:
```typescript
<p className="text-sm font-semibold">Total (QAR): {formatCurrency(total, 'QAR')}</p>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(dashboard\)/purchase/landed-costs/page.tsx
git commit -m "feat(ui): per-line exchange_rate input in CreateLcDialog with live QAR preview"
```

---

### Task 9: UI — Receivals page redesign

**Files:**
- Modify: `src/app/(dashboard)/purchase/receivals/page.tsx`

- [ ] **Step 1: Update imports**

Find the existing import line for `useApproveReceival`:
```typescript
import { useReceivals, useApproveReceival, type Receival, type ReceivalStatus } from '@/hooks/useReceivals'
```

Replace with:
```typescript
import {
  useReceivals, useReceivalEditRequests, useRequestReceivalEdit,
  useApproveReceivalEdit, useSaveReceivalEdit,
  type Receival, type ReceivalEditRequest,
} from '@/hooks/useReceivals'
```

Also add `useState` if not already imported, and ensure these shadcn components are imported: `Textarea`, `Badge`.

- [ ] **Step 2: Remove the `STATUS_CONFIG` entry for `pending_approval` and the approval state**

Find and remove:
```typescript
pending_approval: { label: 'Pending',  className: 'bg-amber-100 text-amber-700' },
```
```typescript
{ value: 'pending_approval', label: 'Pending' },
```
```typescript
const approveReceival = useApproveReceival()
```
And the `approving` state and its dialog.

Update `STATUS_CONFIG` to only have `approved` and `rejected` (receivals are always created as approved now):
```typescript
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
}
```

- [ ] **Step 3: Add `ReceivalRowActions` component (hooks must live in a proper component, not a cell renderer)**

Add this component before the page component definition:

```tsx
function ReceivalRowActions({
  receival,
  onRequestEdit,
}: {
  receival: Receival
  onRequestEdit: (r: Receival) => void
}) {
  const { data: editRequests = [] } = useReceivalEditRequests(receival.id)
  const active = editRequests.find(r => r.status === 'pending' || r.status === 'approved')
  return (
    <Button
      size="sm" variant="outline"
      disabled={!!active}
      onClick={() => onRequestEdit(receival)}
    >
      {active?.status === 'pending' ? 'Edit Pending…' :
       active?.status === 'approved' ? 'Edit Approved' :
       'Request Edit'}
    </Button>
  )
}
```

Then in the columns definition, replace the approve/reject cell with:
```tsx
cell: ({ row }) => (
  <ReceivalRowActions
    receival={row.original}
    onRequestEdit={setRequestEditTarget}
  />
),
```

Add state at the top of the page component:
```typescript
const [requestEditTarget, setRequestEditTarget] = useState<Receival | null>(null)
const [editTarget, setEditTarget] = useState<{ receival: Receival; request: ReceivalEditRequest } | null>(null)
const [adminApproveTarget, setAdminApproveTarget] = useState<ReceivalEditRequest | null>(null)
```

- [ ] **Step 4: Add `RequestEditDialog` component**

Add this component before the page's `return`:

```tsx
function RequestEditDialog({
  receival, onClose,
}: { receival: Receival | null; onClose: () => void }) {
  const requestEdit = useRequestReceivalEdit()
  const [reason, setReason] = useState('')

  if (!receival) return null
  return (
    <Dialog open={!!receival} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Request Edit — {receival.receival_number}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Describe what needs to be corrected. An admin will review and approve your request.
        </p>
        <Textarea
          rows={3} placeholder="e.g. Qty for Item A should be 48, not 50"
          value={reason} onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!reason.trim() || requestEdit.isPending}
            onClick={() => requestEdit.mutate(
              { receival_id: receival.id, reason },
              { onSuccess: () => { toast.success('Edit request sent to admin'); onClose() },
                onError: (e) => toast.error(e.message) }
            )}
          >
            {requestEdit.isPending ? 'Sending…' : 'Send Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5: Add `AdminEditApprovalDialog` component**

```tsx
function AdminEditApprovalDialog({
  request, onClose, isAdmin,
}: { request: ReceivalEditRequest | null; onClose: () => void; isAdmin: boolean }) {
  const approveEdit = useApproveReceivalEdit()
  const [rejectionNote, setRejectionNote] = useState('')

  if (!request || !isAdmin) return null
  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader><DialogTitle>Review Edit Request</DialogTitle></DialogHeader>
        <p className="text-sm"><strong>Reason:</strong> {request.reason}</p>
        <Textarea
          rows={2} placeholder="Rejection note (required only to reject)"
          value={rejectionNote} onChange={(e) => setRejectionNote(e.target.value)}
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive"
            disabled={!rejectionNote.trim() || approveEdit.isPending}
            onClick={() => approveEdit.mutate(
              { request_id: request.id, action: 'rejected', rejection_note: rejectionNote },
              { onSuccess: () => { toast.success('Edit request rejected'); onClose() },
                onError: (e) => toast.error(e.message) }
            )}
          >Reject</Button>
          <Button
            disabled={approveEdit.isPending}
            onClick={() => approveEdit.mutate(
              { request_id: request.id, action: 'approved' },
              { onSuccess: () => { toast.success('Edit approved — 48h window open'); onClose() },
                onError: (e) => toast.error(e.message) }
            )}
          >Approve Edit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Add `ReceivalEditDialog` component (edit mode with pre-flight check)**

```tsx
function ReceivalEditDialog({
  target, onClose,
}: { target: { receival: Receival; request: ReceivalEditRequest } | null; onClose: () => void }) {
  const saveEdit = useSaveReceivalEdit()
  const [items, setItems] = useState<{ receival_item_id: string; new_qty: number; new_unit_cost: number }[]>([])

  useEffect(() => {
    if (target) {
      setItems((target.receival.receival_items ?? []).map(ri => ({
        receival_item_id: ri.id,
        new_qty:          ri.qty_received,
        new_unit_cost:    ri.unit_cost,
      })))
    }
  }, [target])

  if (!target) return null

  const { receival, request } = target
  const expiresAt = request.expires_at ? new Date(request.expires_at) : null
  const expired = expiresAt ? expiresAt < new Date() : false
  const hoursLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000))
    : null

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Receival — {receival.receival_number}
            {expired
              ? <Badge variant="destructive">Window Expired</Badge>
              : <Badge className="bg-green-100 text-green-800">Approved — {hoursLeft}h left</Badge>}
          </DialogTitle>
        </DialogHeader>

        {expired && (
          <p className="text-sm text-destructive">
            Your edit window has expired. Please request a new edit.
          </p>
        )}

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {items.map((item, idx) => {
            const ri = (receival.receival_items ?? [])[idx]
            const soldUnits = ri ? Math.max(0, ri.qty_received - (ri as any).fifo_remaining ?? ri.qty_received) : 0
            return (
              <div key={item.receival_item_id} className="grid grid-cols-12 gap-2 items-center border rounded p-2">
                <div className="col-span-4 text-sm font-medium">{ri?.item_name}</div>
                <div className="col-span-3">
                  <label className="text-xs text-muted-foreground">Qty</label>
                  <Input type="number" min={0} disabled={expired}
                    value={item.new_qty}
                    onChange={(e) => setItems(its => its.map((it, i) =>
                      i === idx ? { ...it, new_qty: parseInt(e.target.value) || 0 } : it))} />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-muted-foreground">Unit Cost</label>
                  <Input type="number" min={0} step="0.0001" disabled={expired}
                    value={item.new_unit_cost}
                    onChange={(e) => setItems(its => its.map((it, i) =>
                      i === idx ? { ...it, new_unit_cost: parseFloat(e.target.value) || 0 } : it))} />
                </div>
                <div className="col-span-2 text-xs text-muted-foreground pt-4">
                  {ri && ri.qty_received > item.new_qty && (
                    <span className="text-amber-600">
                      orig: {ri.qty_received}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={expired || saveEdit.isPending}
            onClick={() => saveEdit.mutate(
              { edit_request_id: request.id, items },
              {
                onSuccess: () => { toast.success('Receival updated'); onClose() },
                onError: (e) => toast.error(e.message),  // RPC surfaces all guard messages
              }
            )}
          >
            {saveEdit.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 7: Mount all three dialogs in the page return**

In the page component's `return (...)`, add before the closing `</div>`:

```tsx
<RequestEditDialog
  receival={requestEditTarget}
  onClose={() => setRequestEditTarget(null)}
/>
<AdminEditApprovalDialog
  request={adminApproveTarget}
  onClose={() => setAdminApproveTarget(null)}
  isAdmin={profile?.role === 'admin'}  {/* profile comes from useMyProfile() or equivalent */}
/>
<ReceivalEditDialog
  target={editTarget}
  onClose={() => setEditTarget(null)}
/>
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(dashboard\)/purchase/receivals/page.tsx
git commit -m "feat(ui): receivals — remove approve/reject, add Request Edit + admin approve + edit-mode dialogs"
```

---

### Task 10: Build verification

- [ ] **Step 1: TypeScript full check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Next.js build**

```bash
npx next build 2>&1 | tail -20
```

Expected: `Route (app)` table printed, no TypeScript or import errors, exit 0.

---

### Task 11: PROGRESS.md + merge to `develop` + new `feature/purchase-module` branch

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Update PROGRESS.md `## 🔄 In Progress`**

Change:
```
LC Inventory Apply plan complete — all tasks shipped. Ready to move to next feature.
```

To:
```
🚀 Starting: **LC Multi-Currency + Receival Redesign — complete**. Merging to develop, opening feature/purchase-module.
```

- [ ] **Step 2: Add to `## ✅ Completed` (top of list)**

```
- [2026-04-25] **LC Multi-Currency + Receival Redesign Task 9: Receivals UI** — `src/app/(dashboard)/purchase/receivals/page.tsx` — Remove approve/reject, add Request Edit + AdminApproval + ReceivalEdit dialogs with expiry badge
- [2026-04-25] **LC Multi-Currency + Receival Redesign Task 8: LC CreateDialog** — `src/app/(dashboard)/purchase/landed-costs/page.tsx` — Per-line exchange_rate input, live QAR preview, currency list expanded to 7
- [2026-04-25] **LC Multi-Currency + Receival Redesign Task 7: useLandedCosts** — `src/hooks/useLandedCosts.ts` — exchange_rate field on LandedCostLine; useCreateLandedCost calls create_landed_cost RPC
- [2026-04-25] **LC Multi-Currency + Receival Redesign Task 6: useReceivals** — `src/hooks/useReceivals.ts` — Atomic useCreateReceival; removed useApproveReceival; added useReceivalEditRequests, useRequestReceivalEdit, useApproveReceivalEdit, useSaveReceivalEdit
- [2026-04-25] **LC Multi-Currency + Receival Redesign Tasks 1–5: DB Migrations** — 5 migrations: receival_edit_requests table, receival_edit movement type, create_and_approve_receival RPC, apply_receival_edit RPC (10 guards), create_landed_cost RPC (NUMERIC precision)
```

- [ ] **Step 3: Commit PROGRESS.md**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — LC multi-currency + receival redesign complete"
```

- [ ] **Step 4: Merge `feature/inventory` into `develop`**

```bash
git checkout develop
git merge feature/inventory --no-ff -m "merge(feature/inventory): LC multi-currency fix + receival workflow redesign"
```

- [ ] **Step 5: Push `develop`**

```bash
git push origin develop
```

- [ ] **Step 6: Create and push new `feature/purchase-module` branch**

```bash
git checkout -b feature/purchase-module
git push -u origin feature/purchase-module
```

- [ ] **Step 7: Confirm branches**

```bash
git branch -a | grep -E "develop|purchase-module|inventory"
```

Expected: `develop`, `feature/purchase-module` present; `feature/inventory` can be deleted or kept for reference.

---

## Acceptance Criteria

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx next build` → clean exit
- [ ] `npx supabase db diff` → empty (all 5 migrations applied)
- [ ] LC with mixed-currency lines stores correct QAR `total_amount` (verified via Supabase SQL editor: `SELECT total_amount FROM landed_costs ORDER BY created_at DESC LIMIT 1`)
- [ ] Exchange rate input visible only when line currency ≠ QAR
- [ ] Creating a receival creates FIFO layers + updates stock_level immediately — no separate approve step
- [ ] No "ghost receivals" — if creation fails the DB rolls back atomically
- [ ] "Request Edit" button disabled when a pending/approved edit request exists
- [ ] Admin notification created on edit request
- [ ] Admin can approve (sets 48h expiry) or reject with note
- [ ] Requestor notified on approve/reject
- [ ] Approved edit saves correctly — qty increase extends FIFO layer, qty decrease guarded against own layer's remaining_qty
- [ ] Qty/cost change blocked with clear error when an applied LC references the receival
- [ ] COGS entries updated when unit_cost changes post-sale
- [ ] `receival_edit` movements reference `edit_request_id` in `reference_id`
- [ ] Pending LCs auto-flagged `all_items_sold=TRUE` when edit leaves 0 remaining
- [ ] Expired edit token surfaces "Edit window expired" error
- [ ] `develop` branch updated; `feature/purchase-module` branch created
