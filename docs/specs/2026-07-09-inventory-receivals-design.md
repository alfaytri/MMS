# Inventory Receivals — Design

**Status:** Approved (2026-07-09)
**Author:** Mohamed Ismail
**Related:** [Inventory Excel Import Design](2026-07-08-inventory-excel-import-design.md), [Landed Cost Explained](../../landed-cost-explained.md)

---

## 1. Feature Overview

**Feature name:** Inventory Receivals

**Purpose:** Allow authorized users to create receival records directly from the Inventory view — either by carving a portion out of an existing FIFO layer (primary use case), or by adding fresh stock. Created receivals can then have Landed Costs attached via the existing LC page.

**Primary trigger:** Data migrated from Odoo arrived as one lump `INIT-IMPORT` FIFO layer per variant per warehouse. To apply Landed Costs against specific batches, users need to split those lumps into properly numbered receival batches.

**Not to be confused with:** Purchase Receivals (existing feature) — those come from POs and follow the standard PO → Receival → Stock flow. Inventory Receivals are independent of any PO.

**Scope note:** This feature is primarily a **one-time migration cleanup tool**. Once all Odoo data is properly separated into batches, most future receivals will come from POs created in this system. The "New stock" mode remains available for occasional edge cases.

---

## 2. Database Schema Changes

**Migration file:** `supabase/migrations/YYYYMMDDHHMMSS_inventory_receivals.sql`

### 2.1 `custom_roles` — new toggle column

```sql
ALTER TABLE custom_roles
  ADD COLUMN is_inventory_receiver boolean NOT NULL DEFAULT false;
```

### 2.2 `receivals` — make PO optional + source tracking

```sql
ALTER TABLE receivals ALTER COLUMN po_id DROP NOT NULL;

ALTER TABLE receivals
  ADD COLUMN source_type text NOT NULL DEFAULT 'purchase'
    CHECK (source_type IN ('purchase', 'inventory'));

ALTER TABLE receivals
  ADD COLUMN carved_from_layer_id uuid REFERENCES fifo_cost_layers(id);
```

- `source_type = 'purchase'` → existing PO receivals (all existing rows default to this).
- `source_type = 'inventory'` → new inventory receivals.
- `carved_from_layer_id` → nullable, only set when carving.

### 2.3 `receival_items` — make PO line reference optional

```sql
ALTER TABLE receival_items ALTER COLUMN po_line_item_id DROP NOT NULL;
```

### 2.4 New sequence for INV numbering

```sql
CREATE SEQUENCE inventory_receival_number_seq START 1;
```

`receival_number` column stays the same; new inventory receivals get `'INV-' || LPAD(nextval(...)::text, 5, '0')`.

### 2.5 `inventory_stock_movements` — extend movement_type check

```sql
ALTER TABLE inventory_stock_movements
  DROP CONSTRAINT inventory_stock_movements_movement_type_check;

ALTER TABLE inventory_stock_movements
  ADD CONSTRAINT inventory_stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase_receival', 'sale_delivery', 'adjustment', 'transfer_in',
    'transfer_out', 'cost_adjustment', 'receival_edit', 'free_receival',
    'sale_return', 'sale_return_damaged', 'purchase_return',
    'purchase_return_cancelled', 'inventory_check',
    'inventory_receival_carve', 'inventory_receival_new'
  ));
```

### 2.6 RLS policies

`receivals` and `receival_items` already have permissive `authenticated` policies. No new RLS needed — the RPC handles authorization.

---

## 3. New RPC — `create_inventory_receival`

**Signature:**

```sql
create_inventory_receival(
  p_mode text,              -- 'carve' or 'new_stock'
  p_warehouse_id uuid,
  p_brand_variant_id uuid,
  p_qty integer,
  p_unit_cost numeric,
  p_source_layer_id uuid,   -- required if p_mode = 'carve', null if 'new_stock'
  p_date date,
  p_notes text
) RETURNS receivals
SECURITY DEFINER
```

### 3.1 Atomic transaction steps

1. **Validate permission:** Caller must have at least one assigned role with `is_inventory_receiver = true`. Reject with `permission denied` error otherwise.

2. **Validate inputs:**
   - `p_qty > 0`
   - For `carve` mode: `p_source_layer_id` must exist, belong to `p_warehouse_id`, and reference `p_brand_variant_id`; also `p_qty ≤ source_layer.remaining_qty`
   - For `new_stock` mode: `p_source_layer_id` must be `NULL`

3. **Generate receival number:** `'INV-' || LPAD(nextval('inventory_receival_number_seq')::text, 5, '0')`

4. **Insert `receivals` row:**
   - `status = 'approved'`
   - `source_type = 'inventory'`
   - `po_id = NULL`
   - `carved_from_layer_id = p_source_layer_id` (nullable)
   - `received_by = auth.uid()`
   - `received_by_name` = snapshot of `profiles.full_name` (fallback to email)

5. **Insert `receival_items` row** — single item, `po_line_item_id = NULL`, `qty_received = p_qty`, `unit_cost = p_unit_cost`, `brand_variant_id = p_brand_variant_id`.

6. **FIFO layer handling:**
   - **Carve mode:**
     - Decrement source layer: `remaining_qty -= p_qty`, `qty -= p_qty`
     - Insert new FIFO layer:
       - `qty = remaining_qty = p_qty`
       - `receival_id = new_receival.id`
       - `receival_number = 'INV-…'`
       - `unit_cost = p_unit_cost`
       - `landed_cost_per_unit = source_layer.landed_cost_per_unit` (**inherited**)
       - `total_unit_cost = p_unit_cost + landed_cost_per_unit`
       - `source_type = 'receival'`
       - `warehouse_id = p_warehouse_id`
   - **New stock mode:**
     - No source layer change
     - Insert new FIFO layer with same fields, but `landed_cost_per_unit = 0`
     - Update `inventory_brand_variants.stock_level += p_qty`

7. **Insert `inventory_stock_movements` row:**
   - Carve mode: `movement_type = 'inventory_receival_carve'`, `qty = 0` (net-zero)
   - New stock mode: `movement_type = 'inventory_receival_new'`, `qty = p_qty`

8. **Recalculate average cost:** `recalc_average_cost(p_brand_variant_id)`.

9. **Return** the new `receivals` row.

---

## 4. UI — Role Toggle

**File:** `src/components/master-data/RoleFormDialog.tsx`

Add a third `<Switch>` toggle in the existing toggle stack, right below "Warehouse Responsible Person (RP)":

- **Label:** "Can Create Inventory Receivals"
- **Description:** "Users holding this role can create receivals directly from existing inventory stock (independent of Purchase Orders)."
- **Field:** `is_inventory_receiver` (boolean, default `false`)

**Zod schema:** Add `is_inventory_receiver: z.boolean().default(false)`.

**Save/load:** `useCreateRole` and `useUpdateRole` already pass the full form payload through. No hook logic change; only the type extension.

**Runtime check:** New hook `useCanCreateInventoryReceivals()` — reads current user's assigned roles via `user_custom_roles ⨝ custom_roles`, returns `true` if any role has `is_inventory_receiver = true`. Mirrors the existing `useMyApprovalSlotRoles` pattern.

---

## 5. UI — Button on the Brand Variant Row

**Files:**
- Inventory tree page (under `src/app/(dashboard)/master-data/inventory/`)
- The brand variant row component

**Button placement:** New icon button before the existing `[↑] [↓] [✏️] [🗑️]` actions on each brand variant row:

- **Icon:** `PackagePlus` (from `lucide-react`)
- **Tooltip:** "Create Inventory Receival"
- **Visibility:** Rendered only when `useCanCreateInventoryReceivals()` returns `true`

**Click behavior:** Opens the `InventoryReceivalDialog` (Section 6) with the brand variant pre-filled.

### 5.1 Warehouse column in the FIFO source table

The expanded FIFO source table under each variant currently doesn't show which warehouse each source row belongs to, which caused confusion (looked like duplicated data). Add a **Warehouse** column:

```
SOURCE       WAREHOUSE          DATE          QTY IN   REMAINING   UNIT COST   LANDED   TOTAL/UNIT   [👁]
INIT-IMPORT  Birkat Warehouse   09 Jul 2026   87       87          QAR 90.63   —        QAR 90.63    —
INIT-IMPORT  Industrial Area    09 Jul 2026   87       87          QAR 90.63   —        QAR 90.63    —
INV-00001    Birkat Warehouse   10 Jul 2026   30       30          QAR 90.63   —        QAR 90.63    [👁]
```

---

## 6. UI — The Popup Dialog

**File:** `src/components/inventory/InventoryReceivalDialog.tsx` (new)

**Fields:**

| Field | Type | Notes |
|-------|------|-------|
| Mode | Toggle | "Carve from stock" (default) / "Add new stock" |
| Header | Read-only | Brand variant name + code |
| Warehouse | Dropdown | Warehouses with stock (carve) / all warehouses (new stock). Auto-select if only one. |
| Source Batch | Dropdown | **Carve mode only.** Lists FIFO layers with `remaining_qty > 0`, sorted oldest first. Format: `"<receival_number|INIT-IMPORT> — <remaining_qty> available"`. |
| Quantity | Number | Max = source layer remaining qty (carve) or unbounded (new stock). Error if exceeded. |
| Unit Cost (QAR) | Number, read-only by default | Pre-filled from source layer (carve) or 0.00 (new stock). Locked behind an "Edit" button that opens a confirm dialog. |
| Date | Date picker | Defaults to today. |
| Notes | Textarea | Optional. |

**Unit-cost edit confirmation:**

> **Are you sure you want to edit the unit cost?**
> This affects your inventory valuation and future landed cost calculations. Only change this if you have a specific reason (correction, currency conversion, etc.).
>
> [ Cancel ]  [ Yes, edit unit cost ]

**Create button behavior:**
- Disabled while form invalid or mutation is pending
- On success: close dialog, toast `"Inventory Receival INV-00001 created"` with action `[View Receivals]` linking to `/purchase/receivals?source=inventory`
- Invalidates: inventory tree, FIFO layers, receivals list, warehouse stock

**Responsive:** Full-screen on mobile (`w-full h-full rounded-none`), centered card on `md:+`. Sticky footer.

---

## 7. UI — Receivals Page Integration

**File:** `src/app/(dashboard)/purchase/receivals/page.tsx` (modify)

### 7.1 New filter — Source

Add a filter chip next to the existing Status filter:

```
Status: [ All ▼ ]   Source: [ All ▼ ]   [Search…]
                             └─ All / Purchase / Inventory
```

### 7.2 Visual differentiation

- `RCV-00001` → default badge styling
- `INV-00001` → distinct colored badge (orange or purple) so inventory receivals are instantly identifiable

### 7.3 Source column

New column showing:
- `Purchase` — with a link to the PO — for `source_type = 'purchase'`
- `Inventory` — with source layer info in tooltip — for `source_type = 'inventory'`

### 7.4 Detail dialog additions

`ReceivalDetailDialog.tsx` — when the opened receival is inventory-sourced:

- Hide the "PO Reference" section
- Show a new **"Carved From"** section listing the source layer's original receival number, warehouse, and current remaining qty
- Show **"Created By"** and **"Created At"** in the header metadata
- Keep the "Landed Cost" section unchanged — the `[Attach LC →]` button links to the LC create page with this receival pre-selected

### 7.5 LC integration

`useReceivalsForLcSelector()` already returns all receivals — no change required. `INV-*` numbers appear alongside `RCV-*` numbers in the LC create dialog automatically.

### 7.6 Route permissions

No new route. Existing `/purchase/receivals` gates on `purchase.receivals.view`. The `is_inventory_receiver` toggle only controls the *create* action; users still need `purchase.receivals.view` through the permission tree to see the list. Consistent with how `is_approval_slot` and `is_field_rp` work.

---

## 8. Hooks & Data Layer

### 8.1 New file: `src/hooks/useInventoryReceivals.ts`

**`useCanCreateInventoryReceivals(): boolean`**
- Reads current user's roles via `user_custom_roles ⨝ custom_roles`
- Returns `true` if any assigned role has `is_inventory_receiver = true`

**`useCreateInventoryReceival()`** — mutation
```ts
type Input = {
  mode: 'carve' | 'new_stock'
  warehouse_id: string
  brand_variant_id: string
  qty: number
  unit_cost: number
  source_layer_id: string | null
  date: string
  notes: string | null
}
```
- Calls `create_inventory_receival` RPC
- On success invalidates: `inventoryVariants.all`, `fifoLayers.all`, `receivals.all`, `warehouseStock.all`
- Calls `logActivity({ action: 'Inventory Receival Created', module: 'receivals', entity_id, entity_type: 'receival', new_data })`

**`useFifoLayersForVariant(brandVariantId, warehouseId)`** — query
- Returns FIFO layers for a variant + warehouse with `remaining_qty > 0`
- Sorted `date` asc, `created_at` asc
- Used to populate the Source Batch dropdown

### 8.2 Modifications to existing hooks

**`src/hooks/useReceivals.ts`** — extend `useReceivals(filters)`:
```ts
type ReceivalFilters = {
  status?: ReceivalStatus
  source_type?: 'purchase' | 'inventory' | 'all'  // NEW
}
```

**`src/hooks/useRoles.ts`** — extend the role type to include `is_inventory_receiver`. Both `useCreateRole` and `useUpdateRole` pass the full payload, so no logic change.

### 8.3 No changes needed

- `useLandedCosts.ts`, `useReceivalsForLcSelector`
- LC RPCs
- All LC-related UI

---

## 9. View Button & Audit Trail

### 9.1 Audit data captured

Every Inventory Receival records:
- `received_by` — `auth.uid()` (FK to profiles)
- `received_by_name` — snapshot of `profiles.full_name` (fallback to email)
- `created_at` — auto timestamp
- `activity_log` entry via `logActivity()`

### 9.2 View button — two places

**On each FIFO source row** in the inventory tree:
- Eye icon on the far right
- Rendered only when the row has a `receival_id` (i.e., `INIT-IMPORT` rows show none)
- Click opens `ReceivalDetailDialog`

**On each row of the Receivals page:**
- Dedicated `[👁]` icon button for one-click access
- The existing `[⋯]` dropdown menu still contains "View Details" for consistency

### 9.3 Detail dialog — additions for inventory receivals

Header metadata gains **Created By** and **Created At** rows:

```
INV-00001
Inventory Receival · Carved from INIT-IMPORT

Warehouse:    Birkat Warehouse
Date:         10 Jul 2026
Created By:   Mohamed Ismail
Created At:   10 Jul 2026, 03:42 PM
Notes:        Batch A from shipment #4472
```

The `[Attach LC →]` button links to the LC create page with the receival pre-selected.

---

## 10. Testing & Rollout

### 10.1 Manual test plan

**Permission gating:**
- Without `is_inventory_receiver`: button hidden; direct RPC call rejected
- With toggle enabled: button renders, RPC succeeds

**Carve mode:**
- Source qty 87 → carve 30 → source becomes 57, new INV-00001 layer has 30
- Total variant stock unchanged
- `average_cost` recomputes correctly
- Carve > available → validation error, no DB change
- Source layer with `landed_cost_per_unit = 5` → new layer inherits 5

**New stock mode:**
- Stock 87 → add 30 → stock becomes 117, INV-00002 layer created
- Movement row shows positive `qty = 30`

**LC integration:**
- INV-* appears in LC create dialog's receival selector
- Apply LC → `landed_cost_per_unit` updates on the INV layer only, not on the source layer

**Receivals page:**
- INV receivals have distinct badge
- Source filter narrows to inventory-only
- Detail dialog shows `received_by_name` and `created_at`
- `carved_from_layer_id` populated for carve, null for new stock

**Edge cases:**
- Layer with `remaining_qty = 0` not shown in dropdown
- Source layer's brand variant deleted → INV receivals still viewable (FK protects)

### 10.2 Rollout plan

1. Apply DB migration to **staging** first, verify all scenarios
2. Push same migration to **dev** once staging is clean
3. **No feature flag** — the toggle itself is the gate. Existing roles default to `false`, so nothing new appears until an admin enables the toggle on a role
4. **No backfill required** — `source_type` defaults to `'purchase'` for all existing rows, which is correct

### 10.3 Assumptions

- `received_by_name` snapshots `profiles.full_name` at creation (denormalized). Falls back to email if `full_name` is null.
- RPC runs with `SECURITY DEFINER`. Permission check uses `auth.uid()` — same pattern as `create_and_approve_receival`.
- Existing permission `purchase.receivals.view` is required to see the receivals list; the toggle only controls the *create* action.

---

## Open Questions

None at time of approval. All decisions locked in during brainstorming session on 2026-07-09.
