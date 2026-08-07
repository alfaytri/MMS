# PO / SO / Inventory Wide Audit — 2026-08-07

Follow-up to the narrow money-path audit earlier today. User asked for a
wider sweep after multiple runtime errors popped up during the release-
checklist smoke tests (42P01, 42703, 42804, and the type-code mismatch
that silently broke FX aggregates).

**Scope:** every SQL function/trigger under `supabase/migrations/` and every
hook under `src/hooks/` that mutates a table in the purchase, sales, or
inventory modules. Approximately 250 migration writers + 40 hook writers.

**Already-fixed (skipped in this audit):**

- `rpc_create_purchase_order` — supplier_id uuid cast + `biv.item_id` +
  `rfq_supplier_ids::uuid[]` cast (mig `20260807002000`)
- `rpc_create_purchase_bill` — dropped stale `source_id` / `source`
  columns (mig `20260806290000`)
- `rpc_settle_installment` — `source_type` / `source_id` /
  `customer_id` + `so_invoices.payment_status` recompute (mig
  `20260806280000`)
- `rpc_apply_debit_note_to_bill` — `p_bill_id` param
- `rpc_redeem_credit_note` — enum casts + auto-resolve
- `create_warranty_records_for_delivery` — `so_invoices` via
  `sale_order_id` (mig `20260806280200`)
- `revert_landed_cost` — ISM `warehouse_id` + `sub_container_id` (mig
  `20260807002000`)
- `_trg_payments_refresh_document_fx` + `rpc_recompute_document_fx` —
  enum-value normalisation (mig `20260807003000`)
- `allocate_payment_to_bill` — `manually_paid` drop + enum casts
- `generate_invoice_from_so` — dropped stale `so_invoices.tax` column
- Line-item CHECKs: `qty > 0` + `unit_price >= 0` on `po_line_items`,
  `bill_line_items`, `sale_order_lines`, `invoice_line_items` (mig
  `20260807000000`)

---

## Confirmed bugs (severity-ordered)

### 1. HIGH — `generate_invoice_from_so` leaves the SO FX aggregate stale after payment remap

**File:** `supabase/migrations/20260806190000_fix_generate_invoice_stale_tax_column.sql:101–106`

**Pattern:** #7 (type-code / trigger semantics)

**Bad code:**

```sql
UPDATE public.payments
   SET source_type = 'invoice',
       source_id   = v_new_inv_id
 WHERE source_type = 'sale_order'
   AND source_id   = p_so_id
   AND deleted_at IS NULL;
```

**Failure scenario.** Foreign-currency SO has one or more incoming
payments. The user generates an invoice. The RPC remaps every
payment's `source_type` from `sale_order` to `invoice`. The AFTER
trigger `_trg_payments_refresh_document_fx` fires with
`NEW.source_type = 'invoice'` — correctly skipped, since only
`purchase_order` / `sale_order` should aggregate to a parent doc.
But the SO row's `exchange_gain` / `exchange_loss` were computed
from those payments and are now stale forever. Reporting on FX per
SO will over-count until the SO is manually recomputed.

**Fix.** After the UPDATE, explicitly call
`PERFORM public.rpc_recompute_document_fx('sale_order', p_so_id);`
so the SO aggregate zeros out. Also consider having the trigger
inspect OLD.source_type on UPDATE for the general remap case.

---

### 2. HIGH — `invoiceSync.ts` bypasses server-side guards + skips cache invalidation

**File:** `src/lib/invoiceSync.ts:65–120`

**Pattern:** #11 (client write with no server guard) + #13 (cache gap)

**Bad code.** `.delete()` on `invoice_line_items` followed by `.insert()`
of the new line set; also `.insert()` / `.update()` on `so_invoices`
with client credentials — no RPC, no FOR UPDATE lock, no
atomic guarantee. Callers of `syncInvoiceToSalesOrder` do not
invalidate `queryKeys.customerInvoices.*`, `queryKeys.saleOrders.detail(id)`,
`queryKeys.financialDashboard`, or `queryKeys.agingReport`.

**Failure scenario.** After editing an SO line, the AR invoice reflects
new totals in DB, but the invoice list, aging report, and financial
dashboard keep serving stale cached data until manual refresh.
Concurrent double-click could produce duplicate line inserts (delete
+ insert is not atomic).

**Fix.** Wrap the delete + insert + invoice-row update in a new
`rpc_sync_invoice_from_so(p_so_id uuid)` that runs under one
transaction with a FOR UPDATE lock on `so_invoices`, then have the
hook wrapper invalidate the full customer-invoice / aging /
dashboard set.

---

### 3. LOW — `exchange_rate_change_log.document_type` CHECK constraint still uses short form

**File:** `supabase/migrations/20260729201528_fx_gain_loss_schema.sql:74`

**Pattern:** #7

**Live check (verified 2026-08-07):**

```
exchange_rate_change_log_document_type_check
  CHECK ((document_type = ANY (ARRAY['po'::text, 'so'::text])))
```

**Failure scenario.** Every other place in the FX chain was normalised
to `'purchase_order'` / `'sale_order'` in mig `20260807003000`. If any
future writer logs a change to this table with the long form (which
matches the enum values everywhere else), the insert fails with
`23514`. Currently `useExchangeRateChangeLog` is read-only in the
UI, so the bug is latent — but it will bite the first time a rate
change is programmatically logged.

**Fix.** Drop the check, add a new one accepting both forms (or the
long form only) plus a one-shot backfill:

```sql
UPDATE public.exchange_rate_change_log SET document_type =
  CASE document_type
    WHEN 'po' THEN 'purchase_order'
    WHEN 'so' THEN 'sale_order'
    ELSE document_type
  END
WHERE document_type IN ('po','so');

ALTER TABLE public.exchange_rate_change_log
  DROP CONSTRAINT exchange_rate_change_log_document_type_check;
ALTER TABLE public.exchange_rate_change_log
  ADD CONSTRAINT exchange_rate_change_log_document_type_check
  CHECK (document_type IN ('purchase_order','sale_order'));
```

Applied in mig **`20260807004000`** below (same file lands the HIGH #1 fix).

---

## Downgraded to clean (falsely suspected)

**Warranty creation on direct `sale_deliveries` inserts.** The audit
initially flagged that `useSaleOrders.ts:856` inserts a stub delivery
(status `'pending'`) without going through `rpc_create_sale_delivery`,
raising fear that warranty records would be skipped. **Verified
against staging:** the warranty creation is invoked inline by
`complete_delivery_inventory` RPC (mig `20260815003600`), not by a
DB trigger on `sale_deliveries`. The stub delivery is intentionally
`pending` — warranty is created when the delivery actually completes
via the RPC. No action needed.

## Suspected — needs targeted follow-up

### 4. MEDIUM — `useSaleOrders.ts` / `usePurchaseOrders.ts` payment inserts under-invalidate caches

Payment insert `onSuccess` only invalidates PO/SO detail. Callers of
`useFinancialDashboard`, `useAgingReport`, `useCustomerStatement`,
`useDocumentExchangeSummary` may serve stale rows until page refresh
or the 60-s `refetchInterval` fires. Broaden the `onSuccess` set.

### 5. MEDIUM — `useSaleOrders.ts:937` SO payment omits explicit `customer_id`

Nullable today, so no crash. But every SO-scope RPC and RLS policy
now derives customer via `source_id → sale_orders.customer_id`. A
row without `customer_id` won't appear in `customer_statement`
filters keyed on `payments.customer_id`. Add
`customer_id: sale_order.customer_id` to the insert payload.

## Clean areas (verified, no action needed)

- Every `INSERT INTO inventory_stock_movements` in migrations dated
  **2026-08-03 or later** explicitly includes both `warehouse_id` and
  `sub_container_id` (pattern #6 clean, including the
  `revert_landed_cost` fix shipped today).
- `_trg_payments_refresh_document_fx` + `rpc_recompute_document_fx`
  normalised to the long enum values (fixed this session).
- All `p_payload->>'x_id'` extractions in the currently-active PO /
  bill RPCs have `::uuid` casts (pattern #3 clean).
- `rpc_replace_po_lines` has correct casts and guards
  `receival_items` + `po_rfq_quote_items` references.
- `invoice_source` enum includes `'sale_order'` (rename 2026-07-23).
- `payment_source_type` enum values match the audit-time normalisation
  (`'purchase_order'`, `'sale_order'`, `'invoice'`, `'bill'`).
- Warranty creation inlined into `complete_delivery_inventory`; no DB
  trigger required on `sale_deliveries`.

## Notes / caveats

- Sub-agent could not run `npx supabase db query --linked` directly; I
  ran the required live-DB verifications myself (`pg_trigger` on
  `sale_deliveries`, `pg_constraint` on `exchange_rate_change_log`,
  `pg_get_functiondef` on `complete_delivery_inventory`).
- Scope was **not** exhaustive for: `useReceivals`, `useLandedCosts`
  (client write paths only — the RPCs they call were audited earlier),
  `useConsumption`, `useTransfers`, `useSaleReturns` client hooks. All
  warrant a focused follow-up pass. Spot-checked their `.insert` call
  sites for stale table names (none found); did not go column-by-column.
- Pattern #10 (`SELECT * INTO row_var` where the row shape changed) has
  many hits across the codebase; sampled ones (`v_so FROM sale_orders`,
  `v_lc FROM landed_costs`, `v_req FROM approval_requests`) do not
  reference dropped columns downstream, but a full row-var-usage
  cross-check was not performed.
