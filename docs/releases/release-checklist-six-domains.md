# Release Checklist — Six Uncovered Domains

> Companion to `release-checklist-money-path.md`. Covers the 6 domains NOT reviewed in the money-path pass.
> Fill this before merging `deploy/warehouse-shipping` to `main`.

**Review date:** 2026-08-05
**Review shape:** 6 parallel finders (effort: high, general-purpose agents) + adversarial verify per finding (default: REFUTED). 20 raw → 20 confirmed (0 refuted).
**Run ID:** `wf_2fab414e-5b4`
**Tokens:** ~1.7M subagent, 630 tool calls, ~16 min wall clock

---

## Severity summary

| Severity | Count | Domain breakdown |
|---|---|---|
| CRITICAL | 4 | Sales pre-delivery (1), Permissions (1), Warehouse ops (1), Consumption (1) |
| HIGH | 13 | Sales pre-delivery (2), PDFs (4), Pagination (2), Permissions (2), Warehouse ops (1), Consumption (2) |
| MEDIUM | 3 | Pagination (3) — verifier-downgraded from high |
| **Total** | **20** | |

---

## CRITICAL — Block deployment

### C1. useConfirmSO bypasses approval chain and double-reserves stock
- **File:** `src/hooks/useSaleOrders.ts:826`
- **Finder:** sales-pre-delivery
- **Why:** `useConfirmSO` does a direct `.update({ status: 'confirmed' })` on `sale_orders`. The page gate (`canConfirm = so.status === 'pending_approval'`) specifically targets SOs in the approval pipeline. The RLS UPDATE policy only checks `is_division_visible` — no role or approval-chain check. Any authenticated user in the same division can confirm a pending_approval SO, bypassing credit-limit and below-cost-margin approval workflows. Additionally, the hook calls `batch_update_reserved_qty` with positive deltas, but `create_sale_order` already reserved stock at creation time — double-counting reserved inventory. The hook also creates a phantom delivery stub and draft invoice.
- **Repro:** Create an SO for a credit customer exceeding the credit limit (goes to `pending_approval`). Click "Confirm" from the orders list page. SO immediately confirms without approval. Check `reserved_qty` — it's 2x the ordered quantity.
- **Fix:** Remove `useConfirmSO` or restrict to quotation-status SOs only. The `pending_approval → confirmed` transition must go through `approve_sales_request` / `force_approve_sales_request` RPCs. Remove the duplicate `batch_update_reserved_qty` call.

### C2. RLS on custom_roles and user_custom_roles allows any authenticated user to self-escalate to system admin
- **File:** `supabase/migrations/20240101000000_baseline_schema.sql:16120`
- **Finder:** permissions-matrix
- **Why:** RLS policies on `custom_roles` and `user_custom_roles` are `USING (true) WITH CHECK (true)` for `authenticated`. Any logged-in user can INSERT a role with `is_system_admin=true`, assign it to themselves via `user_custom_roles`, refresh the page, and gain full admin access. The Supabase URL and anon key are public (`NEXT_PUBLIC_` env vars), so direct browser-console calls bypass all frontend guards.
- **Repro:** Log in as any user → browser console → `sb.from('custom_roles').insert({name:'exploit', is_system_admin:true, permissions:['system.admin']})` → assign to self via `user_custom_roles` → refresh → full system admin.
- **Fix:** Replace permissive RLS with policies that check `caller_has_permission('master_data.roles.manage')` for write operations. Keep SELECT as `USING (true)` for read access.

### C3. Stock adjustment type 'damage' deducts good FIFO but never creates damaged stock entries
- **File:** `supabase/migrations/20260814000100_phase_f_stock_adjustments_source_pile.sql:146`
- **Finder:** warehouse-ops
- **Why:** When `approve_stock_adjustment_inventory` processes `adjustment_type='damage'` on the good pile, it calls `deduct_fifo_layers` and increments `damaged_qty` on `inventory_item_brand_variants`, but never inserts into `inventory_damaged_stock`, `inventory_damaged_stock_layers`, or `inventory_damaged_movements`. Units vanish from good stock without materializing in the damaged stock system. The Damaged Stock On-hand tab won't show them, send-for-repair and write-off RPCs will report "insufficient damaged stock".
- **Repro:** Create a stock adjustment with `adjustment_type='damage'` → approve → query `inventory_damaged_stock` for the BV — 0 rows. Damaged Stock tab shows nothing. `rpc_send_damaged_stock_for_repair` raises "Insufficient damaged stock".
- **Fix:** In `approve_stock_adjustment_inventory`'s damage branch, add: (a) `INSERT INTO inventory_damaged_stock ... ON CONFLICT DO UPDATE SET qty = qty + taken`, (b) `INSERT INTO inventory_damaged_stock_layers` with cost from consumed FIFO layer, (c) `INSERT INTO inventory_damaged_movements` with `movement_type = 'damage_from_adjustment'`. Mirror the pattern in `_record_inventory_disposition`.

### C4. rpc_cancel_consumption does not restore inventory_item_brand_variants.stock_level
- **File:** `supabase/migrations/20260815000400_teams_places_rpc_consumption.sql:207`
- **Finder:** consumption-workflow
- **Why:** Posting consumption calls `deduct_fifo_layers` which decrements `stock_level`. Cancellation restores FIFO layers but never increments `stock_level` back. The analogous `cancel_delivery_inventory` correctly does `SET stock_level = stock_level + v_cogs.qty`. After any consumption cancellation, `stock_level` is permanently too low, corrupting dead-stock reports, reorder alerts, and all variant-level inventory UIs.
- **Repro:** Post consumption for 10 units (stock_level drops 50→40) → cancel → FIFO restored but stock_level stays at 40 instead of 50.
- **Fix:** In `rpc_cancel_consumption`, inside the COGS loop after FIFO layer restore, add: `UPDATE inventory_item_brand_variants SET stock_level = stock_level + v_cogs.qty WHERE id = v_cogs.brand_variant_id;`

---

## HIGH — Must fix before deployment

### H1. useCancelSO allows cancelling delivered/invoiced SOs without reversing deliveries or COGS
- **File:** `src/hooks/useSaleOrders.ts:1014`
- **Finder:** sales-pre-delivery
- **Why:** The hook has no status guard — sets `status='cancelled'` on any SO. The list page gate allows cancel on `partial_delivery`, `delivered`, and `invoiced` statuses. FIFO deductions, COGS entries, and delivery records persist orphaned. (Note: `SoDetailDialog` has a stricter guard limiting to `quotation`/`confirmed` only, but the list page bypasses it.)
- **Fix:** Add a status guard: reject cancellation if any non-pending deliveries exist. Add server-side enforcement via trigger/constraint.

### H2. 18-arg create_sale_order overload checks wrong intent string, can auto-confirm a quotation
- **File:** `supabase/migrations/20260729221927_fx_create_sale_order_capture_initial_rate.sql:105`
- **Finder:** sales-pre-delivery
- **Why:** The 18-arg overload checks `p_intent = 'save_quote'` but the frontend type uses `'quotation'`. Passing `intent='quotation'` via the 18-arg overload skips the credit check and quotation branch, silently confirming the order. The 17-arg overload handles this correctly. The 18-arg is callable by any authenticated user via PostgREST.
- **Fix:** Change the intent check to `p_intent IN ('save_quote', 'quotation')`, or drop the 18-arg overload entirely.

### H3. Invoice PDF hardcodes QAR currency — wrong label on non-QAR sales
- **File:** `src/lib/sales/invoice-pdf-html.ts:60`
- **Finder:** pdf-generation
- **Why:** `fmtMoney` hardcodes `'QAR'` as prefix. The generator never fetches `currency` from the parent SO. A USD 1,000 sale shows "QAR 1,000.00" on the invoice. The quotation PDF handles this correctly with `CURRENCY_PREFIXES`.
- **Fix:** Add `currency` to the SO select in `generate-invoice-pdf.ts`. Pass it through to `buildInvoiceHtml`. Update `fmtMoney` to accept currency param.

### H4. Credit/Debit Note PDF hardcodes QAR currency — wrong label on non-QAR notes
- **File:** `src/lib/sales/credit-debit-note-pdf-html.ts:60`
- **Finder:** pdf-generation
- **Why:** Same pattern as H3. Credit/debit notes linked to non-QAR sales/purchases show "QAR" for all amounts.
- **Fix:** Resolve currency from source invoice's SO (credit notes) or source bill's PO (debit notes). Pass to template.

### H5. PO PDF mixes QAR totals with original-currency label — Grand Total contradicts Subtotal
- **File:** `src/lib/purchase/generate-po-pdf.ts:198`
- **Finder:** pdf-generation
- **Why:** Subtotal uses `po.subtotal` (original currency) but Grand Total uses `po.total_qar` (QAR equivalent), both labeled with `po.currency`. For a USD PO (rate 3.65, subtotal $1,000, discount $50): Subtotal shows "USD 1,000.00" but Grand Total shows "USD 3,467.50" — actually QAR mislabeled as USD. Same issue for Amount Paid and Outstanding.
- **Fix:** Compute displayed grand total as `subtotal - discountAmount` in original currency. Or label QAR rows as QAR.

### H6. Bill PDF payment table shows duplicate/inflated entries from three overlapping queries
- **File:** `src/lib/purchase/generate-bill-pdf.ts:77`
- **Finder:** pdf-generation
- **Why:** Three payment queries (payment_bill_allocations, direct payments, PO-level payments) overlap without deduplication. A PO-level payment of 10,000 allocated 3,000 to a bill shows both amounts (13,000 visible vs 3,000 correct).
- **Fix:** Deduplicate by payment ID across all three queries. Exclude already-seen IDs from queries 2 and 3.

### H7. useSaleOrders fetches entire order history with heavy nested joins and no .limit()
- **File:** `src/hooks/useSaleOrders.ts:517-534`
- **Finder:** pagination-sorting
- **Why:** Selects `*, sale_order_lines(*), sale_deliveries(*, sale_delivery_lines(*)), customers!inner(name), ...` with NO `.limit()`. 4 levels of nested data. Three callers: orders page (default no filters), returns page, `DeliveryFormDialog` (zero filters). Violates `supabase-budget.md` Pillar 3.
- **Fix:** Add `.limit(200)` to the main query. Longer-term: migrate to server-side pagination.

### H8. WhStockValueTab latestReceivalMap fetches ALL fifo_cost_layers rows with no limit
- **File:** `src/components/purchase/wh/WhStockValueTab.tsx:312-323`
- **Finder:** pagination-sorting
- **Why:** Selects `brand_variant_id, created_at` from `fifo_cost_layers` ordered by `created_at DESC` with NO `.limit()`. Only needs latest per BV but fetches every layer ever created. FIFO layers grow monotonically.
- **Fix:** Replace with `DISTINCT ON (brand_variant_id)` view/RPC, or add `.limit(10000)` as immediate safety cap.

### H9. Warehouse reports API has no permission check
- **File:** `src/app/api/warehouse/reports/route.ts:36`
- **Finder:** permissions-matrix
- **Why:** Uses `requireUser()` (session-only, no permission check) then `SERVICE_ROLE_KEY` (bypasses all RLS). Any authenticated user can export full inventory valuation, cost data, and movement history. The dashboard page requires `reports.view` but the API doesn't.
- **Fix:** Replace `requireUser` with `requirePermission('reports.view')`.

### H10. requireAdmin() does not check is_system_admin flag — inconsistent with frontend
- **File:** `src/lib/auth/require-admin.ts:15`
- **Finder:** permissions-matrix
- **Why:** `requireAdmin()` only checks for `'master_data.users.manage'` permission. Unlike `requirePermission()` and `useHasPermission`, it doesn't check `is_system_admin` or `'system.admin'`. If the Admin role's permissions are ever edited, system admins see user management UI but every API call returns 403.
- **Fix:** Add `is_system_admin` check to `requireAdmin()`, matching `requirePermission()`.

### H11. receive_transfer does not decrement stock_level for shrinkage
- **File:** `supabase/migrations/20260803000700_warehouse_model_v2_phase_c2c.sql:422`
- **Finder:** warehouse-ops
- **Why:** During dispatch, `deduct_fifo_layers` skips `stock_level` decrement (correct: items in transit). At receive, destination FIFO layers created only for `received_qty`. When shrinkage occurs, the missing units are absent from FIFO but `stock_level` is never decremented. Each transfer with shrinkage inflates `stock_level`. Read by: `CascadeInventorySelector` (ATP), `ItemRow`, `BrandVariantRow`, dead stock report, `category_stock_aggregates`.
- **Fix:** In `receive_transfer`, after the item loop: `IF v_total_shrinkage > 0 THEN UPDATE inventory_item_brand_variants SET stock_level = stock_level - v_total_shrinkage WHERE id = v_item.brand_variant_id; END IF;`

### H12. rpc_decide_consumption_edit allows requester to approve their own cancellation request
- **File:** `supabase/migrations/20260815001600_consumption_edit_requests.sql:282`
- **Finder:** consumption-workflow
- **Why:** The RPC checks the caller holds an approval role but never checks whether the caller IS the requester. A user with both create and approve permissions can file and immediately approve their own cancellation, defeating separation of duties.
- **Fix:** Add: `IF v_uid = (SELECT requested_by FROM consumption_edit_requests WHERE id = p_request_id) THEN RAISE EXCEPTION 'cannot approve own request'; END IF;`

### H13. generate_consumption_number uses count(*) which races under concurrent inserts
- **File:** `supabase/migrations/20260815000300_teams_places_consumption_tables.sql:165`
- **Finder:** consumption-workflow
- **Why:** Two concurrent `rpc_post_consumption` calls read the same count, generate the same CE number, second INSERT hits UNIQUE constraint. The rest of the codebase uses sequences for this pattern (e.g., `warehouse_transfer_seq`).
- **Fix:** Replace with a sequence: `CREATE SEQUENCE consumption_entry_seq; ... SELECT 'CE-' || lpad(nextval('consumption_entry_seq')::text, 5, '0');`

---

## MEDIUM — Fix before or shortly after deployment (verifier-downgraded)

### M1. useReceivalsAndDeliveries fetches ALL receivals and deliveries with no limit
- **File:** `src/hooks/useWarehouseOperations.ts:948-958`
- **Finder:** pagination-sorting
- **Note:** PostgREST `max_rows` (1000) provides a silent backstop, but still violates `supabase-budget.md` and nested joins amplify payload. Verifier downgraded from high.

### M2. useSaleReturns fetches all returns with nested return_lines and no limit
- **File:** `src/hooks/useSaleReturns.ts:49-68`
- **Finder:** pagination-sorting
- **Note:** Same pattern. Verifier downgraded from high.

### M3. useReorderPoints fetches all reorder points with no limit
- **File:** `src/hooks/useWarehouseOperations.ts:1513-1528`
- **Finder:** pagination-sorting
- **Note:** Configuration table, realistic rows bounded by (variants x warehouses). Verifier downgraded from high.

---

## Combined totals (money-path + six-domains)

| | Money-path pass | Six-domains pass | **Total** |
|---|---|---|---|
| Critical | 12 | 4 | **16** |
| High | 15 | 13 | **28** |
| Medium | 1 | 3 | **4** |
| Migration blocker | 1 | 0 | **1** |
| **Total** | **29** | **20** | **49** |
