# LC Multi-Currency Fix + Receival Workflow Redesign

> Branch: `feature/inventory` — complete before merge to `develop`

---

## 1. Context

Two gaps identified after the LC Inventory Apply plan shipped:

1. **LC multi-currency:** `total_amount` was summed raw across lines regardless of each line's currency, producing wrong QAR totals when lines were in different currencies (e.g. USD freight + QAR handling).
2. **Receival approval workflow mismatch:** The system had a two-step create → approve flow for receivals. Business requirement is: receivals are saved directly and inventory updates immediately. Edit corrections go through an admin-approved edit request instead.

---

## 2. LC Multi-Currency Fix

### 2.1 Rule

All landed costs are recorded in **QAR**. Individual cost lines may originate in any supported currency (QAR, USD, EUR, GBP, AED). The accountant manually applies the exchange rate. The system stores the rate and computes the QAR equivalent.

### 2.2 Data shape

`LandedCostLine` gains one field:

```typescript
exchange_rate: number   // default 1 (QAR lines need no conversion)
```

`lines` is already a JSONB column — no DB migration needed.

`total_amount` stored to DB = `Σ(line.amount × line.exchange_rate)` — always QAR.

### 2.3 UI behaviour in CreateLcDialog

| Condition | What renders |
|---|---|
| `line.currency === 'QAR'` | Amount input only, exchange_rate = 1 (hidden) |
| `line.currency !== 'QAR'` | Amount input + exchange rate input (label: "Rate to QAR") + computed label "= X.XX QAR" |

The running total at the bottom of the form always shows QAR.

### 2.4 Files changed

| File | Change |
|---|---|
| `src/hooks/useLandedCosts.ts` | Add `exchange_rate: number` to `LandedCostLine` type; update `useCreateLandedCost` to compute `total_amount = Σ(amount × exchange_rate)` |
| `src/app/(dashboard)/purchase/landed-costs/page.tsx` | Render exchange_rate input in `CreateLcDialog` when line.currency ≠ QAR; show live QAR equivalent |

---

## 3. Receival Workflow Redesign

### 3.1 New lifecycle

```
Create Receival
    │
    ▼  (immediate, same action)
Inventory updated — FIFO layers + stock_level + stock_movements
    │
    └──→ Request Edit (if correction needed)
              │
              ▼
         Edit Request row created + admin notified
              │
              ▼
         Admin: Approve / Reject
              │ (approved)
              ▼
         Receival editable
              │
              ▼
         User saves edits → delta inventory update → receival locks again
```

### 3.2 DB — new table

```sql
CREATE TABLE receival_edit_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receival_id     UUID NOT NULL REFERENCES receivals(id),
  requested_by    UUID NOT NULL REFERENCES profiles(id),
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  approved_by     UUID REFERENCES profiles(id),
  rejection_note  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ
);
```

### 3.3 DB — new RPC `apply_receival_edit`

Handles the delta inventory update when an approved edit is saved:

```
For each edited receival_item:
  delta = new_qty_received - old_qty_received
  If delta > 0:
    UPDATE fifo_cost_layers SET qty += delta, remaining_qty += delta WHERE receival_id = this receival AND brand_variant_id = this variant
    UPDATE inventory_brand_variants SET stock_level += delta
    INSERT stock_movement (adjustment, +delta)
  If delta < 0:
    Guard: remaining_qty in FIFO layers >= |delta| — raise EXCEPTION if not (units already sold)
    UPDATE fifo_cost_layers SET remaining_qty -= |delta| (walk oldest first)
    UPDATE inventory_brand_variants SET stock_level -= |delta|
    INSERT stock_movement (adjustment, -|delta|)
  In all cases: PERFORM recalc_average_cost(brand_variant_id)
  
  unit_cost change (if any):
    UPDATE fifo_cost_layers SET unit_cost = new_cost, total_unit_cost = new_cost + landed_cost_per_unit WHERE receival_id = this receival
    PERFORM recalc_average_cost(brand_variant_id)

Close edit request: UPDATE receival_edit_requests SET status = 'completed' WHERE id = edit_request_id
```

### 3.4 Hook changes — `useReceivals.ts`

| Hook | Change |
|---|---|
| `useCreateReceival` | After inserting receival + items, immediately call `approve_receival_inventory(id, 'approved')` RPC. Receival is created with status `'approved'`. |
| `useApproveReceival` | Remove (no longer needed for the approval step) |
| `useRequestReceivalEdit` | New — inserts `receival_edit_requests` row + sends notification to admin profiles |
| `useApproveReceivalEdit` | New — admin: sets edit_request status to `'approved'`; admin can also reject |
| `useSaveReceivalEdit` | New — calls `apply_receival_edit` RPC; on success invalidates receival + fifo-layers + inventory queries |

### 3.5 UI changes

**Receival list / detail:**
- Remove "Approve" / "Reject" action buttons
- Approved receivals show a **"Request Edit"** button (disabled if a pending edit request already exists)
- Clicking opens a dialog asking for a reason → submits `useRequestReceivalEdit`

**Admin view (same receival detail, if viewer is admin):**
- Pending edit request shows **"Approve Edit"** and **"Reject"** buttons with rejection note input
- On approve: receival detail enables edit mode (qty + unit cost fields become editable)
- User saves → `useSaveReceivalEdit` → fields lock again

**Notifications:**
- Edit request created → push notification to all admin-role profiles (uses existing notification system)
- Edit approved/rejected → push notification to the requestor

### 3.6 Files changed

| File | Change |
|---|---|
| `supabase/migrations/20260425000062_receival_edit_requests.sql` | Create `receival_edit_requests` table |
| `supabase/migrations/20260425000063_rpc_apply_receival_edit.sql` | Create `apply_receival_edit` RPC |
| `src/hooks/useReceivals.ts` | Update `useCreateReceival`; remove approval hooks; add edit request hooks |
| Receival UI (in PO detail or standalone) | Remove approve/reject buttons; add Request Edit + admin approve/reject flow |

---

## 4. What Does NOT Change

- `allocate_landed_cost` RPC — unchanged
- `approve_receival_inventory` RPC — still called, now called immediately on create
- FIFO deduction logic — unchanged
- COGS entries — unchanged
- LC list + detail page display — unchanged

---

## 5. Out of Scope

- Exchange rate auto-fetch (accountant enters rate manually)
- Receival edit history / audit log beyond the stock_movements entries
- Multi-level edit approval chains

---

## 6. Acceptance Criteria

- [ ] LC with mixed-currency lines stores correct QAR `total_amount`
- [ ] Exchange rate input appears only when line currency ≠ QAR
- [ ] Live "= X.XX QAR" label updates as user types
- [ ] Creating a receival immediately updates FIFO layers and `stock_level` — no separate approve step
- [ ] "Request Edit" button appears on approved receivals; disabled when pending request exists
- [ ] Admin receives notification when edit is requested
- [ ] Admin can approve or reject the edit request
- [ ] On approved edit save, qty delta is correctly applied to FIFO layers (increase + decrease with guard)
- [ ] `recalc_average_cost` fires after every edit save
- [ ] `tsc --noEmit` passes, `next build` succeeds
