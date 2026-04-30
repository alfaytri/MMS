# PO Returns — Design Spec
**Date:** 2026-04-30  
**Status:** Approved  

---

## Overview

Add Purchase Order Returns to MMS, mirroring the existing Sale Returns feature. Customers can return items to suppliers, inventory is deducted at dispatch, and a supplier-confirmation step exists before closing. The existing `returns` table is extended (Option A) rather than creating a new table.

---

## 1. Database

### 1.1 Enum / Constraint Extensions

| Target | Addition |
|---|---|
| `return_source_type` enum | `purchase_order` |
| `return_status` enum | `dispatched`, `supplier_confirmed`, `cancelled` |
| `movement_type` CHECK on `inventory_stock_movements` | `purchase_return`, `purchase_return_cancelled` |

### 1.2 New Column

```sql
ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
```

Idempotency guard for `rpc_process_po_return_dispatch` — same pattern as `restocked_at` on sale returns.

### 1.3 RPC: `rpc_process_po_return_dispatch(p_return_id UUID)`

- `SECURITY DEFINER` (required — `inventory_stock_movements` RLS has no INSERT policy)
- Guards: return exists · `status = 'dispatched'` · `dispatched_at IS NULL`
- For each item in `returns.items`:
  - Skip if `brand_variant_id` is NULL or `qty <= 0`
  - `UPDATE inventory_brand_variants SET stock_level = stock_level - qty WHERE id = brand_variant_id`
  - `INSERT INTO inventory_stock_movements` with `movement_type = 'purchase_return'`, `reference_type = 'po_return'`, `reference_id = p_return_id`
- Stamps `dispatched_at = now()`

### 1.4 RPC: `rpc_cancel_po_return_dispatch(p_return_id UUID)`

- `SECURITY DEFINER`
- Guards: return exists · `dispatched_at IS NOT NULL`
- Reverses inventory: `stock_level = stock_level + qty` for each item
- Inserts `purchase_return_cancelled` movement
- Clears `dispatched_at = NULL`

---

## 2. Status Flows

### Sale Returns (extended)
```
pending → received → restocked → closed
pending → cancelled          (no inventory to reverse)
received → cancelled         (no inventory to reverse)
```

### PO Returns (new)
```
pending → dispatched → supplier_confirmed → closed
pending → cancelled             (no inventory to reverse)
dispatched → cancelled          (reverse dispatch RPC called)
```

**Inventory event:** deduction happens at `dispatched`. No inventory change for any other transition.

---

## 3. Frontend Hooks (`src/hooks/usePurchaseReturns.ts`)

### `usePurchaseReturnsByPO(poId: string | null)`
- Query key: `['po-returns-by-po', poId]`
- Fetches `returns` where `source_type = 'purchase_order'` and `source_id = poId` and `deleted_at IS NULL`
- Used by the Returns tab in `PoDetailDialog`

### `usePurchaseReturns(filters: { search?: string; status?: string })`
- Query key: `['po-returns', filters]`
- Full list with optional search (ilike on `return_number`) and status filter
- Used by the Returns page

### `useCreatePurchaseReturn()`
- Auto-generates number `PR-XXXXX` (counts existing `purchase_order` source_type returns)
- Inserts with `source_type = 'purchase_order'`, `status = 'pending'`
- Logs activity: `action = 'PO Return Created'`, `module = 'purchase_orders'`, `entity_id = source_id`
- Invalidates: `po-returns`, `po-returns-by-po`, `activity-log`

### `useUpdatePOReturnStatus()`
- Signature: `{ id, status, sourceId }: { id: string; status: POReturnStatus; sourceId: string }`
- On `dispatched` → calls `rpc_process_po_return_dispatch`
- On `cancelled` + `dispatched_at IS NOT NULL` → calls `rpc_cancel_po_return_dispatch`
- Logs activity for every transition
- Invalidates: `po-returns`, `po-returns-by-po`, `brand-variants-v2`, `activity-log`

```ts
type POReturnStatus = 'pending' | 'dispatched' | 'supplier_confirmed' | 'closed' | 'cancelled'
```

---

## 4. PO Detail Dialog — Returns Tab

**File:** `src/components/purchase/PoDetailDialog.tsx`

**Visibility:** Tab shown only when PO `status` is `partially_received`, `received`, or `completed`.

### Tab Layout

- List of existing PO returns (return number, date, status badge, item count, reason)
- Each row expandable: shows items table + status-advancement button
- **"+ Create Return"** button — disabled with tooltip `"No items received yet"` if all line items have `received_qty = 0`

### Create Return Form (dialog)

| Field | Detail |
|---|---|
| Date | Date picker, defaults to today |
| Reason | Text input, required |
| Items | Table from PO line items with `received_qty > 0`; qty input, max = received_qty |
| Warehouse | Select from warehouses; default = warehouse of most recent receival |
| Notes | Textarea, optional |

### Status Advancement Buttons

| Current status | Button label | Target status |
|---|---|---|
| `pending` | Mark Dispatched | `dispatched` |
| `dispatched` | Confirm Supplier Receipt | `supplier_confirmed` |
| `supplier_confirmed` | Close Return | `closed` |
| `pending` or `dispatched` | Cancel Return | `cancelled` |

Cancelled returns show a grey `Cancelled` badge with no action buttons.

---

## 5. Returns Page (`/sales/returns`)

**File:** `src/app/(dashboard)/sales/returns/page.tsx`

### Toggle

Segmented control at top-left, next to the search bar:
- **Sale Returns** (default)
- **PO Returns**

URL reflects selection via query param: `?type=sale` / `?type=po`. Tab state survives refresh.

### PO Returns View

Same layout as Sale Returns: search bar + status filter chips + list of return cards.

**Status chips for PO Returns:** `All` · `pending` · `dispatched` · `supplier_confirmed` · `closed` · `cancelled`

**Return card shows:** return number, date, status badge, item count, reason, + action buttons.

### Cancel Behaviour (both return types)

| Return type | Cancel allowed when |
|---|---|
| Sale return | `pending` or `received` |
| PO return | `pending` or `dispatched` |

Cancelling a dispatched PO return calls `rpc_cancel_po_return_dispatch` to reverse the inventory deduction before setting status to `cancelled`.

---

## 6. Activity Logging

All return events log to `activity_log` with:
- `module = 'purchase_orders'`
- `entity_id = source_id` (the PO's id)

| Event | Action string | Severity |
|---|---|---|
| Return created | `PO Return Created` | `info` |
| Dispatched | `PO Return Dispatched` | `info` |
| Supplier confirmed | `PO Return Supplier Confirmed` | `info` |
| Closed | `PO Return Closed` | `info` |
| Cancelled | `PO Return Cancelled` | `warning` |

---

## 7. Out of Scope

- Credit notes linked to PO returns (future)
- Partial cancellation of a dispatched return
- Return qty validation against previously-returned qty (first version caps at received_qty, assumes one return per item)
