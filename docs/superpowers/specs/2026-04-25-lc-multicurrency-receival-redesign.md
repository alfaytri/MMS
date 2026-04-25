# LC Multi-Currency Fix + Receival Workflow Redesign

> Branch: `feature/inventory` — complete before merge to `develop`  
> Reviewed: 10 issues addressed (atomicity, LC math, COGS, float precision, deduction scope, race condition, weight distortion, zombie edit, traceability, all-sold gap)

---

## 1. Context

Two gaps identified after the LC Inventory Apply plan shipped:

1. **LC multi-currency:** `total_amount` was summed in TypeScript using floating-point arithmetic across lines regardless of each line's currency — producing wrong QAR totals and penny-rounding errors.
2. **Receival approval workflow mismatch:** Business requirement is that receivals save directly with immediate inventory update. Edit corrections go through an admin-approved edit request with expiry, full audit trail, and guarded delta logic.

---

## 2. LC Multi-Currency Fix

### 2.1 Rule

All landed costs are recorded in **QAR**. Individual cost lines may originate in any supported currency (QAR, USD, EUR, GBP, AED). The accountant manually supplies the exchange rate. The system stores the rate and the DB computes the QAR equivalent using `NUMERIC` arithmetic.

### 2.2 Data shape

`LandedCostLine` gains one field:

```typescript
exchange_rate: number   // default 1 (QAR lines need no conversion)
```

`lines` is already a JSONB column — no DB migration needed.

**Fix #4 — Float precision:** `total_amount` is NOT computed in TypeScript. The hook passes the raw lines JSONB to a Postgres RPC (`create_landed_cost`) which computes:

```sql
total_amount := (
  SELECT SUM((line->>'amount')::NUMERIC * (line->>'exchange_rate')::NUMERIC)
  FROM jsonb_array_elements(p_lines) AS line
);
```

`NUMERIC` in Postgres has arbitrary decimal precision — no floating-point rounding errors.

### 2.3 UI behaviour in CreateLcDialog

| Condition | What renders |
|---|---|
| `line.currency === 'QAR'` | Amount input only; `exchange_rate` stored as 1 (hidden) |
| `line.currency !== 'QAR'` | Amount input + "Rate to QAR" input + live label "= X.XX QAR" (display-only, computed in JS for the preview) |

The running total at the bottom always shows "Total (QAR)" and is the server-authoritative value returned by the RPC.

### 2.4 New RPC: `create_landed_cost`

Replaces the direct `.insert()` call in `useCreateLandedCost`. Accepts all LC fields, computes `total_amount` in `NUMERIC`, inserts, returns the new row.

```sql
CREATE OR REPLACE FUNCTION create_landed_cost(
  p_lc_number            TEXT,
  p_description          TEXT,
  p_date                 DATE,
  p_currency             TEXT,
  p_lines                JSONB,
  p_attached_receival_ids UUID[],
  p_attached_po_ids       UUID[]
) RETURNS JSONB ...
```

### 2.5 Files changed

| File | Change |
|---|---|
| `supabase/migrations/20260425000062_rpc_create_landed_cost.sql` | New `create_landed_cost` RPC |
| `src/hooks/useLandedCosts.ts` | Add `exchange_rate: number` to `LandedCostLine`; `useCreateLandedCost` calls RPC instead of direct insert |
| `src/app/(dashboard)/purchase/landed-costs/page.tsx` | Render exchange_rate input when `line.currency ≠ QAR`; show live QAR preview |

---

## 3. Receival Workflow Redesign

### 3.1 New lifecycle

```
Create Receival
    │
    ▼  (single atomic RPC — Fix #1)
create_and_approve_receival RPC:
  INSERT receivals + receival_items
  INSERT fifo_cost_layers
  UPDATE inventory_brand_variants stock_level
  INSERT stock_movements
  All in one transaction — no ghost receivals possible
    │
    └──→ Request Edit (if correction needed)
              │
              ▼
         receival_edit_requests row inserted + admin notified
              │
              ▼
         Admin: Approve (sets expires_at = now() + 48h) / Reject
              │ (approved, within expiry window — Fix #8)
              ▼
         UI pre-flight: fetch current remaining_qty before enabling Save
         User edits qty / unit_cost
              │
              ▼
         apply_receival_edit RPC (atomic) → receival locks again
```

### 3.2 DB — `receival_edit_requests` table

```sql
CREATE TABLE receival_edit_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receival_id     UUID NOT NULL REFERENCES receivals(id),
  requested_by    UUID NOT NULL REFERENCES profiles(id),
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'expired')),
  approved_by     UUID REFERENCES profiles(id),
  rejection_note  TEXT,
  expires_at      TIMESTAMPTZ,          -- set to now() + 48h on approval (Fix #8)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ
);
```

### 3.3 DB — extend `inventory_stock_movements` CHECK

**Fix #9 — Traceability:** Add `'receival_edit'` to the movement_type CHECK constraint so edit adjustments are distinguishable from generic adjustments in the audit ledger.

```sql
ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival', 'sale_delivery', 'adjustment',
    'transfer_in', 'transfer_out', 'cost_adjustment', 'receival_edit'
  ));
```

### 3.4 DB — new RPC `create_and_approve_receival`

**Fix #1 — Atomicity:** Everything in one transaction. No two-step create + RPC call from the client.

```
BEGIN
  INSERT INTO receivals (...) RETURNING id → v_receival_id
  INSERT INTO receival_items (...) for each item
  For each non-free item with brand_variant_id and qty_received > 0:
    INSERT INTO fifo_cost_layers (... unit_cost, landed_cost_per_unit=0, total_unit_cost=unit_cost ...)
    UPDATE inventory_brand_variants SET stock_level += qty_received
    INSERT INTO inventory_stock_movements (movement_type='purchase_receival', ...)
    collect brand_variant_id
  FOREACH brand_variant_id: PERFORM recalc_average_cost(brand_variant_id)
  RETURN full receival row as JSONB
END
```

Status is set to `'approved'` at insert time — no subsequent approval step.

### 3.5 DB — new RPC `apply_receival_edit`

Accepts: `p_edit_request_id UUID`, `p_items JSONB` (array of `{receival_item_id, new_qty, new_unit_cost}`).

**Full guard sequence (atomic):**

```
LOCK receival_edit_requests row FOR UPDATE
Check status = 'approved' AND expires_at > now()   -- Fix #8: reject expired tokens
  → if expired: UPDATE status='expired', RAISE EXCEPTION 'Edit window expired. Request a new edit.'

LOCK receival row FOR UPDATE

For each item in p_items:

  -- ── QTY CHANGE ──────────────────────────────────────────────────────────
  delta = new_qty - old_qty_received

  -- Fix #2: LC guard (qty)
  IF delta ≠ 0 AND EXISTS (
    SELECT 1 FROM landed_costs
    WHERE receival_id = ANY(attached_receival_ids)
      AND applied_at IS NOT NULL AND voided_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot change qty: an applied Landed Cost references this receival. Void the LC first.'
  END IF

  IF delta > 0:
    -- Fix #5: only update the FIFO layer created by this specific receival
    UPDATE fifo_cost_layers
       SET qty          = qty          + delta,
           remaining_qty = remaining_qty + delta
     WHERE receival_id = v_receival_number   -- the text receival_number stored in the layer
       AND brand_variant_id = v_bv_id
    UPDATE inventory_brand_variants SET stock_level += delta
    INSERT INTO inventory_stock_movements
      (movement_type='receival_edit', qty=+delta, reference_type='receival_edit_request',
       reference_id=p_edit_request_id, ...)    -- Fix #9: full paper trail

  IF delta < 0:
    -- Fix #5: guard against the specific receival's layers, not all layers
    SELECT remaining_qty INTO v_layer_remaining
      FROM fifo_cost_layers
     WHERE receival_id = v_receival_number AND brand_variant_id = v_bv_id
     FOR UPDATE
    IF v_layer_remaining < abs(delta):
      RAISE EXCEPTION 'Cannot reduce qty: % units from this receival have already been sold',
        abs(delta) - v_layer_remaining
    END IF
    UPDATE fifo_cost_layers
       SET remaining_qty = remaining_qty - abs(delta)
     WHERE receival_id = v_receival_number AND brand_variant_id = v_bv_id
    UPDATE inventory_brand_variants SET stock_level -= abs(delta)
    INSERT INTO inventory_stock_movements
      (movement_type='receival_edit', qty=-abs(delta), reference_type='receival_edit_request',
       reference_id=p_edit_request_id, ...)    -- Fix #9

  -- ── UNIT COST CHANGE ─────────────────────────────────────────────────────
  IF new_unit_cost ≠ old_unit_cost:

    -- Fix #7: block if any LC applied (weight calculation would be invalidated)
    IF EXISTS (
      SELECT 1 FROM landed_costs
      WHERE receival_id = ANY(attached_receival_ids)
        AND applied_at IS NOT NULL AND voided_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot change unit cost: an applied Landed Cost references this receival. Void the LC first.'
    END IF

    -- Fix #3: update cogs_entries for already-sold units
    sold_qty = old_qty_received - v_layer_remaining
    IF sold_qty > 0:
      UPDATE cogs_entries
         SET unit_cost  = new_unit_cost,
             total_cost = new_unit_cost * qty
       WHERE sale_delivery_id IN (
         SELECT reference_id FROM inventory_stock_movements
          WHERE reference_type = 'sale_delivery'
            AND brand_variant_id = v_bv_id
       )
       -- Only update entries whose unit_cost matches the old cost from this receival layer
       AND unit_cost = old_unit_cost

    UPDATE fifo_cost_layers
       SET unit_cost      = new_unit_cost,
           total_unit_cost = new_unit_cost + landed_cost_per_unit
     WHERE receival_id = v_receival_number AND brand_variant_id = v_bv_id

  -- Recalc average cost after all changes for this variant
  PERFORM recalc_average_cost(v_bv_id)

  -- Fix #10: All-sold detection
  -- After any qty decrease, check if any pending LCs are now fully sold-through
  FOR each LC WHERE this receival = ANY(attached_receival_ids) AND applied_at IS NULL AND voided_at IS NULL:
    total_remaining = SUM(remaining_qty) across fifo_cost_layers for all brand_variants
                      in all receivals attached to this LC
    IF total_remaining = 0:
      UPDATE landed_costs SET all_items_sold = TRUE, updated_at = now() WHERE id = lc_id

-- Close the edit token
UPDATE receival_edit_requests SET status = 'completed' WHERE id = p_edit_request_id
UPDATE receival_items SET qty_received = new_qty, unit_cost = new_unit_cost WHERE id = receival_item_id
```

### 3.6 Hook changes — `useReceivals.ts`

| Hook | Change |
|---|---|
| `useCreateReceival` | Calls `create_and_approve_receival` RPC — single atomic action. No separate approve call. |
| `useApproveReceival` | Removed — no longer needed |
| `useRequestReceivalEdit` | New — inserts `receival_edit_requests` row (status=pending) + notifies admins |
| `useApproveReceivalEdit` | New — admin sets status=`'approved'`, sets `expires_at = now() + interval '48 hours'`; or rejects |
| `useSaveReceivalEdit` | New — calls `apply_receival_edit` RPC; handles `'Edit window expired'` exception with clear toast + redirect to request new edit |

### 3.7 UI changes

**Receival list / detail (all users):**
- Remove "Approve" / "Reject" action buttons entirely
- Approved receivals show **"Request Edit"** button — disabled if a `pending` or `approved` (unexpired) edit request already exists
- Clicking opens a dialog: reason textarea → `useRequestReceivalEdit`

**Admin view (viewer has admin role):**
- Pending edit requests show **"Approve Edit"** and **"Reject"** buttons with rejection note input
- Approval sets `expires_at = now() + 48h`; badge shows countdown "Edit approved — expires in Xh"

**Edit mode (requestor, after approval, before expiry — Fix #8 pre-flight):**
- Before rendering editable fields, fetch fresh `remaining_qty` from FIFO layers
- If `remaining_qty < qty_received` for any item: show yellow warning banner "X units already sold — maximum reducible qty is Y"
- "Save" button performs `apply_receival_edit`; on `'Edit window expired'` error: show toast "Your edit window expired. Please request a new edit." and lock fields
- On `'Cannot change qty/unit cost: LC applied'` error: show toast with instruction to void the LC first

**Notifications:**
- Edit request created → notification to all admin profiles
- Approved / rejected → notification to the requestor

### 3.8 Files changed

| File | Change |
|---|---|
| `supabase/migrations/20260425000062_rpc_create_landed_cost.sql` | `create_landed_cost` RPC (LC fix) |
| `supabase/migrations/20260425000063_receival_edit_requests.sql` | `receival_edit_requests` table |
| `supabase/migrations/20260425000064_extend_movement_type.sql` | Add `'receival_edit'` to movement_type CHECK |
| `supabase/migrations/20260425000065_rpc_create_and_approve_receival.sql` | Atomic `create_and_approve_receival` RPC |
| `supabase/migrations/20260425000066_rpc_apply_receival_edit.sql` | `apply_receival_edit` RPC with all 10 guards |
| `src/hooks/useLandedCosts.ts` | `LandedCostLine` + `exchange_rate`; `useCreateLandedCost` → RPC |
| `src/hooks/useReceivals.ts` | Update create hook; remove approve hook; add 3 edit-request hooks |
| Receival UI | Remove approve/reject; add Request Edit + admin approve/reject + edit mode with pre-flight |

---

## 4. What Does NOT Change

- `allocate_landed_cost` RPC — unchanged; it uses the `item_allocations` snapshot which is immutable after apply
- `approve_receival_inventory` RPC — kept in DB (used by `create_and_approve_receival` internally); no longer called from the client directly
- `deduct_fifo_layers` — unchanged
- LC list + detail page display — unchanged

---

## 5. Guard Summary Table

| Scenario | Guard | Location | Error message |
|---|---|---|---|
| Qty change, LC already applied | Block | `apply_receival_edit` | "Void the LC first" |
| Unit cost change, LC already applied | Block | `apply_receival_edit` | "Void the LC first" |
| Qty decrease beyond receival's own layer | Block | `apply_receival_edit` | "X units already sold from this receival" |
| Edit token expired | Block | `apply_receival_edit` | "Edit window expired. Request a new edit." |
| Stock sold since approval granted | Pre-flight warn (UI) + hard block (RPC) | UI + `apply_receival_edit` | "X units sold since approval — max reducible qty is Y" |
| All-sold after edit | Auto-flag LC | `apply_receival_edit` | (silent, sets `all_items_sold = TRUE`) |

---

## 6. Out of Scope

- Exchange rate auto-fetch (accountant enters rate manually)
- Multi-level edit approval chains
- COGS restatement notifications to QuickBooks (manual bookkeeping entry required when unit_cost is corrected post-sale)

---

## 7. Acceptance Criteria

**LC Multi-Currency:**
- [ ] `total_amount` computed in Postgres `NUMERIC` — no TypeScript float arithmetic
- [ ] Exchange rate input appears only when line currency ≠ QAR
- [ ] Live "= X.XX QAR" preview updates as user types (display only)
- [ ] Mixed-currency LC stores correct QAR `total_amount` verified against Postgres output

**Receival Workflow:**
- [ ] Creating a receival is a single atomic operation — FIFO layers + stock_level update in same transaction
- [ ] No "ghost receival" possible if connection drops mid-operation
- [ ] "Request Edit" button disabled when a non-expired edit request exists
- [ ] Admin receives notification on edit request; requestor notified on approve/reject
- [ ] Approved edit token has 48h expiry shown in UI
- [ ] UI pre-flight warns when remaining_qty < qty_received before edit save
- [ ] Qty decrease blocked when receival's own FIFO layers don't have enough remaining_qty
- [ ] Qty change blocked when any applied LC references this receival
- [ ] Unit cost change blocked when any applied LC references this receival
- [ ] Expired edit token returns clear error; fields lock; user prompted to re-request
- [ ] COGS entries updated when unit_cost changes and units were already sold
- [ ] Stock movements from edits use `movement_type='receival_edit'` with `reference_id=edit_request_id`
- [ ] Pending LCs auto-flagged `all_items_sold=TRUE` when edit leaves 0 remaining
- [ ] `tsc --noEmit` passes, `next build` succeeds
