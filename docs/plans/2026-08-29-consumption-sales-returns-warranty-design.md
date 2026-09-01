# Consumption-as-Sales: Mandatory Notes, Warranty, Returns + Sales COGS-Reversal Fix

> Design spec — 2026-08-29. Architectural. Grounded in a full read-only map of
> the consumption module, the warranty/returns/permission infrastructure, and a
> COGS-reversal audit of the existing sales returns. No code until this spec is
> approved.

## 1. Context & problem

Operationally, **consuming stock into a Team/Project custody is a sale to a
customer**. But the system models consumption **cost-side only**: a
`consumption_entries` row drains FIFO from a source warehouse and books
**COGS** (`cogs_entries.source_type='consumption'`). There is **no customer, no
sale price, no invoice/receivable**. "Custody" = `consumer_type='custody'` +
`consumer_sub_container_id`; the alternative is `'internal'`.

The operator wants consumption-as-sales to gain the sales-grade lifecycle:

1. **Mandatory Notes** on custody consumption (the invoice/order/project ref) + a matching placeholder.
2. A **richer list view** showing the consumed items + the notes per row.
3. **Real-time** updates (no manual refresh).
4. **Warranty** on consumed items — same policies as sales, **starting on the consumption date**, auto-created per custody line; a warranty-management page.
5. **Returns** for consumed items — **mirroring the sales return flow** (direct + inspection; good units restocked to an operator-chosen warehouse with COGS cancelled; damaged units routed to Operations → Damaged Stock to scrap or send-for-repair; replacement like sales); a return-management page.
6. **Permissions** for the new return + warranty pages.

While auditing the sales flow to mirror it, we found the existing **sales returns
reverse COGS on only one of six outcome paths** (see §3) — a real P&L
correctness bug the operator asked us to fix as part of this work.

## 2. Locked decisions

- **No system customer.** Consumption stays customer-less; the invoice/order # in Notes is the only external reference. No customer-linked credit notes on consumption returns.
- **Returns mirror sales**, but book **COGS reversal on every disposition** (not just good-restock). `resolved` always means "COGS netted."
- **Warranty auto-created per custody consumption line** whose item resolves a warranty policy; **start = consumption date**; `'internal'` consumption gets none; no customer on the record.
- **Real-time** = instant on the actor's own actions (cache invalidation, already present) + **refetch-on-window-focus**; **no background polling** (Supabase quota rule). Cross-user changes appear on refocus.
- **Fix the sales-return COGS holes** as shared work, so sales returns and the new consumption returns are both correct.

## 3. Audit finding that drives the returns design

Traced every sales-return outcome; only **good-unit restock** reverses COGS.

| Return outcome | Reverses COGS today? | Gap |
|---|---|---|
| Good → restock to warehouse | ✅ yes | negative `cogs_entries('sale_return')` + re-layer + movement |
| Damaged → restock as damaged | ❌ no | damaged ledger only; original sale COGS stays expensed **and** cost re-parked as damaged asset → double count |
| Damaged → write-off (scrap) | ❌ no | movement `sale_return_damaged` not read by P&L Scrap line; loss invisible |
| Damaged → send for repair | ❌ no | repaired-good re-enters sellable stock with original COGS still booked → double count on resale |
| Replacement delivery | ❌ no (double) | original not reversed **and** replacement bypasses `complete_delivery_inventory` → ships with **no COGS**, on-hand overstated |
| Inspection → split | ❌ at inspection | only the good split reverses later |

Root cause: `return_progress.inventory_remaining` + `_maybe_close_return` close a
return when disposition/resolution rows exist — **they never check COGS**. So a
damaged/replacement return closes `resolved_*` with the original sale COGS still
on the books.

**Principle adopted (sales + consumption):** *every returned unit reverses its
original COGS (a compensating negative `cogs_entries`), regardless of
disposition; the disposition then decides where the cost lands* (back to
inventory, to the damaged asset, to scrap loss, or into a repair). Replacement
shipments must book their own COGS like any delivery.

## 4. Phasing

Independent, shippable increments. Ordered for value + dependency.

- **Phase 1 — Notes + list + real-time** (small; no schema).
- **Phase 2 — Consumption warranty** (schema + create RPC + page + perms).
- **Phase 3a — Fix sales return COGS reversal** (shared money-path RPC fixes).
- **Phase 3b — Consumption returns** (reuses the corrected reversal + dispositions; page + perms).
- **Phase 4 (deferred) — Consumption warranty claims → consumption returns** (claim resolution builds a consumption return instead of a sales return).

Each phase = its own migration set + commit(s) + operator smoke; pushed per the batch-push rule.

---

## 5. Detailed design

### 5.1 Phase 1 — Mandatory notes, richer list, real-time

**Mandatory notes (custody only)**
- Form: `src/components/consumption/NewConsumptionDialog.tsx` — add `notes.trim()` to the `canOpenConfirm` gate (`:521`) **only when `consumer_type==='custody'`**; change the `<Textarea>` placeholder (`:1128`) to **"Enter invoice / order number / project code."** Internal consumption keeps notes optional and its current placeholder.
- Server: `rpc_post_consumption` (authoritative body `supabase/migrations/20260919000000_consumption_is_team_item_stamp.sql`) — after resolving `consumer_type`, `RAISE` (P0001, friendly message) when `consumer_type='custody'` AND `NULLIF(trim(p_notes),'') IS NULL`. Keeps the DB the source of truth even if the form is bypassed.
- Note: a separate free-text `code` column already exists (project/WO ref, required for project-pool consumers). We are making **Notes** mandatory per the operator's explicit instruction; `code` behavior is unchanged.

**Richer list view (items + notes)**
- `src/hooks/useConsumption.ts` `LIST_SELECT` (`:141`) — extend the embedded `consumption_lines(...)` to include `item_name, sku, qty` (currently only `qty, unit_cost` for the total). `notes` is already fetched onto `ConsumptionListRow` (unused).
- `src/app/(dashboard)/consumption/page.tsx` — render two additions per row: an **Items** summary (e.g. first 2–3 `item_name ×qty`, "+N more") and a **Notes** cell (truncated, full on hover / in the mobile card). Keep the existing columns. Respect existing responsive column-hiding rules.

**Real-time**
- `useConsumptionList` + `useConsumption(id)` (+ the new returns/warranty hooks) — add `refetchOnWindowFocus: true`; keep `staleTime`; **no `refetchInterval`**. Same-tab create/cancel/return/claim already invalidate `queryKeys.consumption.all` etc.

### 5.2 Phase 2 — Consumption warranty

**Schema (migration)**
- `warranty_source_type` enum — add value `'consumption'`.
- `warranty_records`:
  - Make `sale_delivery_line_id`, `sale_order_id`, `customer_id` **NULLABLE** (drop NOT NULL; keep FKs).
  - Add `consumption_id uuid → consumption_entries(id) ON DELETE CASCADE`, `consumption_line_id uuid → consumption_lines(id) ON DELETE CASCADE`.
  - Add **partial UNIQUE index on `consumption_line_id`** (idempotency, parallel to `UNIQUE(sale_delivery_line_id)`).
  - Add a CHECK: exactly one provenance set — `sale_delivery_line_id` XOR `consumption_line_id`.
  - `warranty_records_remaining` view reads `wr.*` → new columns absorbed automatically (no view change needed).

**Creation RPC**
- `create_warranty_records_for_consumption(p_consumption_id)` — mirrors `create_warranty_records_for_delivery` (current body `supabase/migrations/20261002000200_warranty_origin_snapshot.sql:40`). Differences:
  - Iterate `consumption_lines` of the consumption; resolve item via `inventory_item_brand_variants.item_id`; resolve policy via `get_effective_warranty_policy(item_id)`; skip null-variant / policy-null / `duration_months=0`.
  - Run **only for `consumer_type='custody'`** (internal → none).
  - `v_start_date := consumption_entries.date` (the consumption date). `end_date = start + duration_months`.
  - `warranty_number := next_warranty_number('consumption', division_id)`.
  - `customer_id` NULL; `consumption_id`/`consumption_line_id` set; snapshot item/sku/qty/policy/origin as the delivery version does; `division_id` from the consumption.
  - `ON CONFLICT (consumption_line_id) DO NOTHING`.
- Call it **inline from `rpc_post_consumption`** after the lines are inserted (custody only). SECURITY DEFINER; no new grant surface (invoked within the existing gated RPC).

**UI + permissions**
- New page `src/app/(dashboard)/consumption/warranties/page.tsx` — reuse the sales Warranties page pattern (Records + Claims tabs). `useWarrantyRecords` gains a `source` filter (`'consumption'`) reading `warranty_records_remaining`. Reuse `WarrantyRecordDetailDialog`, `FileWarrantyClaimDialog`, `WarrantyClaimDetailDialog`.
- Permission keys: `consumption.warranties.view`, `consumption.warranty_claims.manage` — added to NAV_TREE catalog, NAV_ITEMS (Operations group), ROUTE_PERMISSIONS (`/consumption/warranties`).
- **Deferred:** a consumption warranty certificate PDF (the current cert route is delivery-scoped) — Phase 4/later.

### 5.3 Phase 3a — Fix sales return COGS reversal (shared money path)

Apply the §3 principle to the existing sales-return RPCs. Each fix adds a
compensating negative `cogs_entries` and, where relevant, the correct P&L
routing. These are money-path changes — implement under the SQL migration
self-check rules (fetch live body via `pg_get_functiondef`, verify columns/enums,
prove via rolled-back `DO` probe).

- **restock_as_damaged** (`_record_inventory_disposition`, `supabase/migrations/20260819430000_damaged_writeoff_division_write_path.sql:309`) — add negative `cogs_entries` reversing the original sale COGS for the disposed qty (cost moves from sold → damaged asset).
- **write_off at return** (`rpc_record_inventory_disposition` write_off branch, `supabase/migrations/20260802000500_rpc_send_for_repair.sql:459`) — reverse the sale COGS **and** emit the scrap movement the P&L Scrap line actually reads (`damaged_write_off`, matching `rpc_report_pnl`) so the loss is captured once, in the right place.
- **send_for_repair / return_from_repair** (`rpc_send_damaged_for_repair`, `rpc_return_damaged_from_repair`, `supabase/migrations/20260810000100_phase_e_rpc_rewrites.sql:677,838`) — reverse the original sale COGS when the unit leaves "sold" state; repaired-good re-enters at original+amortized-repair cost (already) with no re-expense until resale (no double count).
- **replacement** (`rpc_create_partial_replacement`, `supabase/migrations/20260810000100_phase_e_rpc_rewrites.sql:465`) — the replacement delivery must **book its cost** (deduct FIFO + stock movement + `stock_level` decrement) but with **no new revenue** (it's a free like-for-like swap; the customer already paid). Since `rpc_report_pnl` derives revenue from `cogs_entries.qty × unit_price`, the replacement's `cogs_entries` row must carry **`unit_price = 0`** (or a distinct non-revenue `source_type`) so cost is recognized without phantom revenue. Original returned unit reverses per its disposition above.
- **Revenue/cost interaction (accounting model to confirm at planning):** the existing good-restock reversal unwinds the **full sale line** (both revenue and cost, because a `cogs_entries` row carries `qty × unit_price` for revenue and `total_cost` for COGS). The damaged/repair fixes will mirror that (reverse the full line via a negative `cogs_entries`), and the disposition then routes the cost (damaged asset / scrap loss / repair); the customer's cash side stays with `return_line_customer_resolutions` + credit notes. Confirm this "full-line reversal + separate cash resolution" model with the operator before implementing, since it defines what nets where on the P&L.
- **Closure invariant (optional hardening):** consider having `_maybe_close_return` / `return_progress` assert COGS reversal exists per accounted unit, so this class of hole can't silently reappear. (Design note; confirm scope during planning.)

Backfill of already-closed historical returns is **out of scope** (documented) — the fix is forward-looking; a separate reconciliation could be scoped later if the operator wants historical correction.

### 5.4 Phase 3b — Consumption returns

**Schema (migration)**
- `return_source_type` enum — add `'consumption'` (currently `('sale_order','purchase_order')`).
- `return_lines` — add `consumption_line_id uuid → consumption_lines(id)`; relax the `return_lines_provenance_required` CHECK to require exactly one of `receival_item_id` / `sale_delivery_line_id` / `consumption_line_id`.
- Reuse `so_po_returns` as the header (`source_type='consumption'`, `source_id=consumption_id`), `status` lifecycle, `restock_warehouse_id`, `notes`, `division_id`, `return_line_inventory_dispositions`. `return_line_customer_resolutions` is **N/A** for consumption (no customer/credit note).

**RPCs (mirror sales, using the corrected reversal, parameterized by source)**
- **Create** — client-side hook `useCreateConsumptionReturn` (mirrors `useCreateSaleReturn`): number scheme e.g. `CR-#####` (consumption return) or reuse `SR`-style under advisory lock; insert `so_po_returns(source_type='consumption', source_id=consumption_id, status = pending_inspection if any 'inspection' line else pending)` + `return_lines(consumption_line_id, condition, qty, …)`. Returnable-qty computed from `consumption_lines.qty` minus already-returned.
- **Restock (good)** — mirror `rpc_process_return_restock` for consumption: reverse `cogs_entries` where `source_type='consumption'` + `consumption_id` (negative `cogs_entries('consumption_return')`), re-layer `fifo_cost_layers('consumption_return')` into the **operator-chosen warehouse/sub-container**, positive `inventory_stock_movements('consumption_return')`, bump `stock_level` + `recalc_average_cost`.
- **Inspection split** — reuse `rpc_complete_return_inspection` (source-agnostic; operates on `return_lines`).
- **Damaged dispositions** — reuse the **now-fixed** disposition recorders (restock_as_damaged / write_off / send_for_repair), generalized so the COGS reversal targets the **consumption** COGS (`source_type='consumption'`) when the return's `source_type='consumption'`. Damaged units land in `inventory_damaged_stock` and are actioned on the existing **Operations → Damaged Stock** page (scrap / send-for-repair) — no new damaged-stock UI needed.
- **Closer** — a consumption return closes when `inventory_remaining=0` (customer dimension always satisfied / N-A). Extend `_maybe_close_return` to treat consumption returns as customer-resolved-by-default.
- **No credit note** — consumption has no customer/invoice; the return is inventory + COGS reversal only.

**UI + permissions**
- New page `src/app/(dashboard)/consumption/returns/page.tsx` — mirror `sales/returns` (list + stat strip + status lifecycle) with a Create-Consumption-Return dialog (adapted from `CreateReturnDialog`; no credit-note step). Detail dialog adapted from `SaleReturnDetailDialog` (no customer-resolution section).
- Permission keys: `consumption.returns.view/.create/.manage` — NAV_TREE + NAV_ITEMS (Operations) + ROUTE_PERMISSIONS (`/consumption/returns`).

### 5.5 Permissions recipe (both new pages)

Per the confirmed 3-place pattern:
1. **Catalog** — add keys under a Consumption node in `NAV_TREE` (`src/components/master-data/PermissionTree.tsx`); keep `.view` siblings so `validatePermissionSet` passes.
2. **Nav** — add `NavItem`s to the Operations group in `NAV_ITEMS` (`src/components/layout/nav-config.ts`).
3. **Route gate** — add `{pathPrefix, permission}` to `ROUTE_PERMISSIONS` (`src/lib/route-permissions.ts`), most-specific first.
4. **Server** — new RPCs SECURITY DEFINER, `_user_has_permission`-gated, `REVOKE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.

New keys: `consumption.returns.view`, `consumption.returns.create`, `consumption.returns.manage`, `consumption.warranties.view`, `consumption.warranty_claims.manage`.

---

## 6. Real-time strategy

- No Supabase Realtime (removed for quota). Use React-Query: mutations invalidate `queryKeys.consumption.*` / the new returns + warranty keys; list/detail hooks set `refetchOnWindowFocus: true`. No `refetchInterval`. This satisfies "no manual refresh" for the actor and updates on refocus for cross-user changes, within the Supabase-budget rules.

## 7. Migrations & rollout

- Every migration written to **both** `supabase/migrations/` and `supabase/migrations-staging/`.
- Apply via `psql -f` to **staging + new-prod** (db push unusable — ledgers drifted), record `supabase_migrations.schema_migrations`.
- Money-path RPCs (Phase 3a/3b): follow the mutation-path + SQL self-check memory rules — `pg_get_functiondef` before/after, verify enum values added before use, single overload, rolled-back `DO` probe proving each COGS reversal, caller grep.
- `database.types.ts` regenerated after schema changes (re-append the 4 helper aliases).
- Co-author trailers on every commit; PROGRESS.md + EOD updated per task; flows-registry updated for the new flows.

## 8. Testing / verification

- **Per COGS path (rolled-back probe):** for each sales disposition (restock-as-damaged, write-off, repair, replacement) and each consumption-return disposition, assert a compensating `cogs_entries` row nets the original to zero (or to scrap) — the exact hole the audit found.
- Warranty: posting a custody consumption with a policy-bearing item creates a `warranty_records` row with `source_type='consumption'`, `start_date=consumption date`; internal creates none; re-post idempotent.
- Notes: custody consumption rejects blank notes (form + RPC); internal allows blank.
- List/real-time: items + notes render; a second action updates without refresh; refocus refetches.
- `tsc` + `eslint` clean; operator smoke on staging for each page.

## 9. Out of scope / deferred

- **Historical backfill** of already-closed sales returns that missed COGS reversal (forward-fix only).
- **Consumption warranty certificate PDF** (cert route is delivery-scoped).
- **Phase 4:** wiring consumption warranty **claim resolution** to build a **consumption** return (current `rpc_start_warranty_claim_resolution` rejects non-`sale` and builds a sales return).
- Attaching a real Customer entity to consumption (explicitly rejected — notes-ref only).
- Consolidating the duplicate Create-Return dialog (tracked separately in the PO/SO parity backlog).

## 10. Risks

- **Money-path changes** (Phase 3a) touch shared return RPCs used in production — highest-risk; gated by rolled-back probes + staging smoke before new-prod.
- **`warranty_records` nullable relaxation** — dropping NOT NULL on `sale_delivery_line_id`/`sale_order_id`/`customer_id`; existing sales rows unaffected; the XOR CHECK guards integrity.
- **Enum additions** (`warranty_source_type`, `return_source_type`) are additive/backward-compatible.
- **Disposition recorders becoming source-aware** — must not regress the sales path while adding consumption; covered by per-path probes for both sources.

## 11. Key file touchpoints

- Consumption: `src/hooks/useConsumption.ts`, `src/app/(dashboard)/consumption/page.tsx`, `src/components/consumption/NewConsumptionDialog.tsx`; RPC `rpc_post_consumption` (`supabase/migrations/20260919000000…`).
- Warranty: `warranty_records` + enum migrations; new `create_warranty_records_for_consumption`; `src/hooks/useWarrantyRecords.ts`, `useWarrantyClaims.ts`; new `consumption/warranties` page.
- Returns: `return_source_type`/`return_lines` migration; return RPCs (`rpc_process_return_restock`, `_record_inventory_disposition`, `rpc_record_inventory_disposition`, `rpc_send_damaged_for_repair`, `rpc_return_damaged_from_repair`, `rpc_create_partial_replacement`, `_maybe_close_return`, `rpc_complete_return_inspection`); `src/hooks/useSaleReturns.ts` (+ new `useConsumptionReturns.ts`); new `consumption/returns` page; adapt `CreateReturnDialog`/`SaleReturnDetailDialog`.
- Permissions/nav: `PermissionTree.tsx`, `nav-config.ts`, `route-permissions.ts`.
