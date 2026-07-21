# Database Schema Review — Full Response

**Date:** 2026-07-21
**Reviewer source:** `C:\Users\IT\Downloads\databases schema.docx` (24 screenshots + inline comments)
**Visual response artifact:** [Database Schema Review — Response](https://claude.ai/code/artifact/202bcb49-848e-40f1-826d-a1235c9173de)
**Applied to:** Staging DB (`mwvblpgbgxipvrevkeff` / InventoryStaging)
**NOT yet applied to:** Production DB (`wkmvjxxmzstsvahuiwsz`)

---

## Summary

| Category | Count | Status |
|---|---|---|
| Fixes | 6 | All done (5 migrations + 1 already existed) |
| Explanations | 24 | Documented below — respond to reviewer |
| Discussions | 7 | Decision points documented below |

---

## Fixes — What Was Done

### Fix 1: Merge `cx_extension` into `threecx_extension`

**Reviewer said:** "Why is there `cx_extension` AND `threecx_extension`? We need one — always call it `threecx_extension`."

**Problem:** Both columns existed on `profiles`. `cx_extension` was the original; `threecx_extension` was added later for the Contact Centre module. Same purpose — the user's 3CX phone extension number.

**Migration:** `20260721100000_merge_cx_extension_column.sql`
- Copied any data from `cx_extension` into `threecx_extension` (where the latter was null)
- Dropped `cx_extension` column

---

### Fix 2: Rename `is_field_rp` → `is_warehouse_responsible`

**Reviewer said:** "What is `is_field_rp`? The name is unclear."

**Problem:** `is_field_rp` stands for "Field Responsible Person" which means "Warehouse Responsible Person." The name was legacy and confusing.

**Migration:** `20260721100001_rename_is_field_rp.sql`
- Renamed column on `custom_roles` table
- Recreated the `is_field_rp_of()` RPC function to use the new column name

**Source code updated:**
- `src/components/master-data/RoleFormDialog.tsx` — form field name, schema, defaults
- `src/hooks/useRoles.ts` — removed stale manual type widening (types now generated natively)
- `src/hooks/useWarehouseFieldRPs.ts` — Supabase query filter updated

---

### Fix 3: Rename `pricing_factors` → `contract_pricing_factors`

**Reviewer said:** "`pricing_factors` — is this for contracts? We need to make it clear."

**Problem:** The table stores multipliers for contract quotation pricing (e.g. "Weekend Rate = 1.5x", "Emergency = 2x"). The generic name could be confused with sale order discounts.

**Migration:** `20260721100002_rename_pricing_factors_table.sql`
- Renamed table to `contract_pricing_factors`
- Renamed PK, FK constraints, trigger, and RLS policies
- Created compatibility view `pricing_factors` → `contract_pricing_factors` to avoid breaking any existing queries

**Note:** This table has no frontend code yet — it was built for the contract quotations module but the management UI hasn't been built. It stores rows like:
- category: `"time"`, label: `"Weekend Rate"`, factor: `1.5`
- category: `"urgency"`, label: `"Emergency"`, factor: `2.0`

Scoped by `division_id` → `company_divisions`, with `created_by` → `profiles`.

---

### Fix 4: Add `tool_asset_item_id` to delivery/return/receival lines

**Reviewer said:** "`sale_delivery_lines` has `brand_variant_id` but NOT `tool_asset_item_id`. Sale order lines have both."

**Problem:** The system has two inventory types:
- **Stock items** (consumables, spare parts) — tracked by `brand_variant_id`
- **Tools & assets** (individual serialized items) — tracked by `tool_asset_item_id`

Sale order lines can reference either type, but delivery and return lines only had `brand_variant_id`. This meant tool/asset deliveries lost the FK link to the specific asset.

**Migrations:**
- `20260721100003_add_tool_asset_to_delivery_return_lines.sql` — Added to `sale_delivery_lines` and `return_lines`
- `20260721100006_add_tool_asset_to_receival_items.sql` — Added to `receival_items` (discovered same gap on purchase side)

**Result — both chains now fully traceable:**

Sales chain:

| Table | `brand_variant_id` | `tool_asset_item_id` |
|---|---|---|
| `sale_order_lines` (sell it) | ✅ | ✅ |
| `sale_delivery_lines` (deliver it) | ✅ | ✅ added |
| `return_lines` (customer returns) | ✅ | ✅ added |

Purchase chain:

| Table | `brand_variant_id` | `tool_asset_item_id` |
|---|---|---|
| `po_line_items` (buy it) | ✅ | ✅ |
| `receival_items` (receive it) | ✅ | ✅ added |
| `return_lines` (return to supplier) | ✅ | ✅ added |

---

### Fix 5: Add `division_id` to `warehouses`

**Reviewer said:** "Why is `division_id` on warehouses not a FK to UUID?" / "How can you separate costing and warehousing tables by divisions?"

**Problem:** The `warehouses` table had NO `division_id` column. Division was inferred via a fragile 2-hop join: `warehouses` → `warehouse_field_rps` → `profiles` → `company_divisions`. If no Field RP was assigned, the warehouse had no division.

**Migration:** `20260721100004_add_division_id_to_warehouses.sql`
- Added `division_id UUID NOT NULL REFERENCES company_divisions(id)` to `warehouses`
- Backfilled from `user_company_divisions` (not `profiles.division_id` which was always null) — only where all RPs share exactly one division
- Fallback: remaining warehouses assigned to first active division (admin can reassign via UI)
- Enforced `NOT NULL` after backfill — every warehouse must belong to a division
- Created index `idx_warehouses_division_id`

**Source code updated:**
- `src/hooks/useWarehouses.ts` — simplified query to join `company_divisions` directly instead of 2-hop inference
- `src/app/api/warehouse/reports/route.ts` — replaced 3-table join with direct `warehouses.division_id` lookup
- `src/components/master-data/WarehouseFormDialog.tsx` — added required Division dropdown (pre-selected when only one division exists, disabled)
- `src/app/(dashboard)/master-data/admin/warehouses/page.tsx` — added Division column to the table
- `src/types/database.types.ts` — `division_id` is now `string` (non-null) in Row/Insert types

---

### Fix 6: Per-payment `exchange_rate` — Already Done

**Reviewer said:** "`exchange_rate` should be added on the payment date, not on the sale order level."

**Finding:** The `payments` table already has `exchange_rate` and `currency` columns. No migration needed.

**Design:** Both rates serve different purposes:
- **Order-level rate** = the booking rate (agreed rate when customer said "yes")
- **Payment-level rate** = the actual rate when money was collected
- The difference = FX gain/loss for accounting

---

## Additional Fix: Drop `profiles.division_id`

**Discovery during implementation:** While fixing the warehouses `division_id`, we found that `profiles.division_id` was completely unused:
- Never written to by the UI (no form field, no toggle, no trigger)
- Division access is managed entirely through `user_company_divisions` junction table + JWT claims via `custom_access_token_hook`
- The PO approval code was reading it but it was always null (so it always fell through to the global chain)

**Migration:** `20260721100005_drop_profiles_division_id.sql`
- Dropped FK constraint, index, and column

**Source code updated:**
- `src/hooks/usePurchaseOrders.ts` — PO approval chain now uses the PO's own `division_id` (correct logic — the chain should match the PO, not the submitter)
- `src/hooks/usePOApprovals.ts` — removed `division_id` from profile select (was returned but never used)
- `src/hooks/useWarehouses.ts` — simplified Field RP sub-select (no longer joins through `profiles.division_id`)
- `src/app/api/warehouse/reports/route.ts` — replaced old 2-hop inference with direct `warehouses.division_id`

---

## Explanations — What to Tell the Reviewer

### Identity & Access (`profiles`, `custom_roles`, `user_company_divisions`)

**Q: `division_id` on profiles — is it an array? One user can have access to multi divisions.**
A: Not an array — it's a single UUID FK pointing to the user's primary division. Multi-division access is handled by the `user_company_divisions` junction table. *(Note: we ended up dropping this column — see fix above.)*

**Q: What is `feature_flags`?**
A: An ARRAY column storing per-user feature toggles as text tags (e.g. `['beta_dashboard', 'new_calendar']`). Used for gradual feature rollouts. Avoids adding a new boolean column for every experiment.

**Q: How does the `permissions` array work? What is `is_system`?**
A: `permissions` is a text ARRAY holding dot-notation permission strings: `['orders.create', 'orders.view', 'inventory.manage', ...]`. The app checks `permissions.includes('orders.create')` before showing UI or allowing actions. `is_system` marks built-in roles (Admin, Manager, Viewer) that cannot be deleted or renamed by users.

**Q: What is `is_approval_slot`, `is_field_rp`, `is_inventory_receiver`?**
A: Functional role flags that determine workflow assignments:
- `is_approval_slot` — users with this role appear in approval workflow step assignments
- `is_field_rp` (now `is_warehouse_responsible`) — users with this role can be assigned as warehouse responsible persons
- `is_inventory_receiver` — users with this role can receive and approve incoming inventory

### Company & Config (`company_divisions`, `pricing_factors`)

**Q: What is `calendar_schedule_id` on company_divisions?**
A: Links a division to its work calendar schedule — defines working hours, holidays, and off-days. Used by the scheduling/calendar module to determine available service slots.

### Customers (`customers`)

**Q: `pending_balance` and `credit_limit` / `credit_balance` — are they running on a function?**
A: `credit_limit` lives on `credit_groups` (not on the customer directly) — customers belong to a credit group via `credit_group_id` FK. `pending_balance` and `credit_balance` are computed at query time by RPCs. The sale order approval RPC recalculates from source data every time. The columns on the table are display cache only — updated by triggers, but approval logic always recalculates.

**Q: What is the difference between `customer_type` and `entity_type`?**
A:
- `customer_type` — Business classification: `'cash'` or `'credit'`. Determines whether the customer pays upfront or gets invoiced on terms.
- `entity_type` — Legal classification: `'individual'` or `'company'`. Determines what documents are required (CR for companies, establishment ID for individuals).

### Sales (`sale_orders`, `sale_order_lines`, `sale_order_approvals`)

**Q: What are the statuses? How do you identify if it is a quotation? Do you keep versions?**
A: Statuses: `quotation` → `pending_approval` → `confirmed` → `in_progress` → `partial_delivery` → `delivered` → `invoiced` → `closed` | `cancelled`. A sale order with `status = 'quotation'` IS the quotation — same record, no duplication. When approved, status changes to `confirmed`. Quotation versioning is not currently implemented (the `po_versions` pattern could be replicated if needed).

**Q: `item_name` is text — why? Should be directly ID to item table.**
A: Intentional snapshot. `item_name` captures the item name at the time of the sale. If the item is later renamed, historical orders still show the correct name. The actual item reference is via `brand_variant_id` FK. The text is the denormalized display value.

**Q: `brand_variant_id` — is this the item table? And `tool_asset_item_id` is a different table?**
A: Yes, two separate inventory systems:
- `brand_variant_id` → `inventory_brand_variants` — consumable/stock items tracked with FIFO costing and quantity
- `tool_asset_item_id` → `inventory_items` (tools & assets) — serialized individual items tracked by unit, not quantity
A sale order line has one OR the other, never both.

**Q: What is `source_type` on approvals? What is `approval_type`?**
A:
- `source_type`: `'sale_order'` or `'order'` — the approval system is shared between sale orders and service orders
- `approval_type`: `'margin'` (discount pushes margin below threshold) or `'credit'` (open balance + new order exceeds credit limit)

### Deliveries & Returns

**Q: What is `type` on sale_deliveries? How does `return_id` work?**
A: `type` differentiates `'standard'` (normal delivery) vs `'replacement'` (delivery created to replace items from a customer return). `return_id` FK links replacement deliveries back to the return that triggered them. Standard deliveries have `return_id = null`.

**Q: What is `source_type` on returns? What is `dispatched_at`?**
A:
- `source_type`: `'sale_order'` | `'order'` | `'purchase_order'` — returns can come from product sales, service orders, or purchase orders
- `dispatched_at` — timestamp for when return items were physically dispatched (pickup collected / shipment sent). Separate from `restocked_at` (when items were put back into inventory).

### Procurement (`purchase_orders`, `shipments`)

**Q: Same exchange rate comment as sale orders.**
A: Same logic applies. PO-level rate is the agreed booking rate. Payment-level rates should track actual FX at payment time. Decision mirrors whatever is decided for sale orders. *(Already done — `payments` table has `exchange_rate`.)*

**Q: Did you manage to find a tracking API?**
A: Yes — 17track. The `shipments` table integrates with the 17track API. Columns `sync_error`, `last_synced_at`, `is_syncing`, `carrier_code`, and `events` (JSONB) all relate to 17track webhook data.

### Inventory & Costing (`fifo_cost_layers`, `cogs_entries`, `inventory_stock_movements`)

**Q: How does FIFO work? How are tools and assets calculated differently?**
A: FIFO for brand variants: each receival creates a `fifo_cost_layers` record with qty, unit_cost, landed_cost_per_unit, remaining_qty. Sales consume from the oldest layer first, creating `cogs_entries`. Tools & assets are NOT FIFO-tracked — each is an individual record with its own condition, status, and assignment. Cost tracked per-unit at purchase time.

**Q: What happens when order received then returned? When sold, delivered, then returned?**
A:
- Receival → Return to supplier: FIFO layer's `remaining_qty` decremented, stock movement logged with negative qty
- Sale → Delivery → Customer return: FIFO layers consumed on delivery (COGS entry created), return creates new FIFO layer at original cost (`source_type = 'sale_return'`), stock movement with positive qty
- Uses signed `qty` (positive = stock in, negative = stock out) combined with 15 `movement_type` values

**Q: Where are you keeping record of the current stock level?**
A: Current stock = SUM of `remaining_qty` across all `fifo_cost_layers` for a given `brand_variant_id` + `warehouse_id`. No separate "current stock" column — always derived from FIFO layers to prevent drift. `warehouse_stock_allocations` tracks reserved vs available.

### Billing & Payments (`invoices`, `tl_invoices`)

**Q: Is invoice and bill in the same table? Do you have a type column?**
A: Yes, unified table. The `direction` column differentiates: `'ar'` (Accounts Receivable = Invoice we send) vs `'ap'` (Accounts Payable = Bill we receive). Additional context via `source` enum and `invoice_type` enum.

**Q: What are the `tl_` prefixed tables?**
A: `tl_` = "Team Leader" — a completely separate invoicing system for field-service mobile workflow. `tl_invoices` is NOT a view on the main `invoices` table — it's independent, used when team leaders generate quick invoices on-site. Four `tl_` tables exist: `tl_invoices`, `tl_invoice_lines`, `tl_payment_batches`, `tl_payment_batch_items`. Simpler statuses (just `unpaid/paid`).

---

## Discussions — Decisions Needed

### 1. `profiles.division_id` + `user_company_divisions` — why both?

**Reviewer said:** "Why both? Pick one. Also rename `profiles` to `users`."

**Resolution:** We dropped `profiles.division_id` — it was never written to by the app. Division access is fully managed through:
- `user_company_divisions` junction table (admin assigns divisions in UI)
- `custom_access_token_hook` bakes `division_ids[]` into the JWT at login
- `useUserDivisionScope` hook reads the JWT claims

**Renaming `profiles` → `users`:** Not recommended. Supabase Auth already has `auth.users`. Naming ours `users` in public schema creates confusion. 57 foreign keys reference this table — massive, risky migration for no functional gain. The name `profiles` is the Supabase convention.

---

### 2. `has_contact_centre_access` — should it be in roles?

**Reviewer said:** "Isn't it better to keep in roles? Manage all permissions in a single location."

**Current state:** Binary toggle on `profiles`. The `custom_roles.permissions` array handles granular permissions (e.g. `orders.create`, `inventory.view`). Contact Centre is separate because it's cross-role (an admin AND a technician might both need it).

**Options:**
- **A: Keep as profile toggle** (current — simpler, one boolean check)
- **B: Move to `custom_roles.permissions` as `'contact_centre.access'`** (cleaner — all permissions in one place, but every role change recalculates access)

**Decision needed from you.**

---

### 3. `exchange_rate` — per payment vs per order

**Reviewer said:** "Exchange rate should be on the payment date, not on the sale order level."

**Resolution:** Both already exist:
- Order-level rate = booking rate (agreed when customer approved)
- Payment-level rate = actual rate when money collected (`payments.exchange_rate` already exists)
- The difference = FX gain/loss

**Tell reviewer:** Both are in place. The order-level rate stays as the booking reference.

---

### 4. `division_id` on deliveries and returns

**Reviewer said:** "Do you need `division_id` on deliveries and returns? Shouldn't they inherit from the sale order?"

**Current state:**
- `sale_deliveries` does NOT have `division_id` — already inherits via `sale_order_id` FK join (reviewer's instinct matches our design)
- `returns` DOES have `division_id` because returns can come from 3 sources (`sale_order`, `order`, `purchase_order`) — no single parent to inherit from

**Decision:** Current design is correct. Tell reviewer that deliveries inherit, returns need it because of multi-source.

---

### 5. RFQ and PO flow — meeting required

**Reviewer said:** "I need more explanation on how RFQ and PO work — flow and columns. We need to go over it one by one."

**Flow:** RFQ (`po_type='rfq'`) → send to multiple suppliers (`rfq_supplier_ids` array) → each quote is a `po_versions` record → select best → `po_type='draft'` → approval → `po_type='confirmed'` → receive goods.

**Action:** Schedule a 30-minute meeting to walk through `purchase_orders` (35 columns) and `po_versions` (21 columns) column by column. This is a "teach, don't fix" item.

---

### 6. Costing/warehousing tables by division

**Reviewer said:** "How can you separate costing and warehousing tables by divisions? I don't see division relations there."

**Resolution (partially fixed):**
- `warehouses` now has direct `division_id` (Fix 5 above)
- `fifo_cost_layers` → `warehouse_id` → `warehouses.division_id` is now a clean one-hop join
- `cogs_entries` still has no direct path to division (multi-hop through the sale order/delivery that triggered it)

**Remaining decision:** Should we denormalize `division_id` onto `fifo_cost_layers` and `cogs_entries` for fast division filtering in reports? Tradeoff: faster queries vs risk of data drift. The warehouse fix covers most reporting needs. Denormalize later if performance becomes an issue.

---

### 7. Exchange rate on purchase orders (same as #3)

**Reviewer said:** Same exchange rate comment on PO section.

**Resolution:** Same answer — PO-level rate is the agreed rate with the supplier. Payment-level rates track actual FX at payment time. Both already supported via `payments.exchange_rate`.

---

## All Migrations Created

| # | File | Description |
|---|---|---|
| 1 | `20260721100000_merge_cx_extension_column.sql` | Merge `cx_extension` → `threecx_extension`, drop old column |
| 2 | `20260721100001_rename_is_field_rp.sql` | Rename `is_field_rp` → `is_warehouse_responsible` on `custom_roles` |
| 3 | `20260721100002_rename_pricing_factors_table.sql` | Rename table → `contract_pricing_factors` + compatibility view |
| 4 | `20260721100003_add_tool_asset_to_delivery_return_lines.sql` | Add `tool_asset_item_id` to `sale_delivery_lines` + `return_lines` |
| 5 | `20260721100004_add_division_id_to_warehouses.sql` | Add `division_id` to `warehouses` + backfill from Field RPs |
| 6 | `20260721100005_drop_profiles_division_id.sql` | Drop unused `profiles.division_id` |
| 7 | `20260721100006_add_tool_asset_to_receival_items.sql` | Add `tool_asset_item_id` to `receival_items` |

## All Source Files Modified

| File | Change |
|---|---|
| `src/components/master-data/RoleFormDialog.tsx` | `is_field_rp` → `is_warehouse_responsible` |
| `src/hooks/useRoles.ts` | Removed stale manual type widening |
| `src/hooks/useWarehouseFieldRPs.ts` | `is_field_rp` → `is_warehouse_responsible` |
| `src/hooks/useWarehouses.ts` | Simplified to direct `division_id` join, removed Field RP division inference |
| `src/hooks/usePurchaseOrders.ts` | PO approval chain uses PO's `division_id` instead of profile's |
| `src/hooks/usePOApprovals.ts` | Removed unused `division_id` from profile select |
| `src/app/api/warehouse/reports/route.ts` | Direct `warehouses.division_id` lookup instead of 2-hop inference |
| `src/types/database.types.ts` | Regenerated with all schema changes |
| `.env.local` | Fixed unquoted separator lines that broke Supabase CLI |

---

## Pending

- [ ] Apply all 7 migrations to **production DB** (`wkmvjxxmzstsvahuiwsz`) when ready
- [ ] Git commit after user confirms changes work
- [ ] Schedule meeting with reviewer for RFQ/PO flow walkthrough (Discussion #5)
- [ ] Decide on `has_contact_centre_access` location (Discussion #2)
- [ ] Decide on denormalizing `division_id` to costing tables (Discussion #6)
