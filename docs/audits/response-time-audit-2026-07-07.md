# Response-Time Audit — Purchase + Warehouse Modules

**Date:** 2026-07-07
**Scope:** All Supabase queries, RPCs, and realtime channels in Purchase + Warehouse pages
**Builds on:** [June 8 Supabase Query Performance Audit](supabase-query-performance-audit.md)

---

## Executive Summary

**11 critical** and **9 moderate** performance issues found across list queries, realtime patterns, and mutation chains. The most impactful problems are unbounded list queries (no `.limit()`) that will degrade as data grows, and 60-second polling intervals that don't pause when the browser tab is hidden.

No Purchase/Warehouse-specific realtime channels exist — the module relies on TanStack Query polling. The contact centre channels (out of scope) remain the biggest realtime quota consumers.

---

## Critical Findings

### C1. usePurchaseOrders — unbounded list + nested joins
**File:** `src/hooks/usePurchaseOrders.ts:257`
**Query:** `.from('purchase_orders').select('*, po_approvals(*), po_line_items(*)').order(...)`
**Issues:** NO_LIMIT, SELECT_STAR, nested `po_approvals(*)` and `po_line_items(*)` fetch all columns
**Impact:** O(n x m) — grows quadratically with PO and line item count
**Fix:** Add `.limit(50)`, use explicit columns | **Status:** FIXED

### C2. useLandedCosts — unbounded list + JSONB payload
**File:** `src/hooks/useLandedCosts.ts:60`
**Query:** `.from('landed_costs').select('*').order(...)`
**Issues:** NO_LIMIT, SELECT_STAR includes large JSONB columns (lines, item_allocations)
**Fix:** Add `.limit(100)` | **Status:** FIXED

### C3. useWarehouseStock — unbounded view query
**File:** `src/hooks/useWarehouseOperations.ts:264`
**Query:** `.from('warehouse_stock_view').select(explicit_cols).order(...)`
**Issues:** NO_LIMIT on a view that can return 10K+ rows
**Fix:** Add `.limit(500)` | **Status:** FIXED

### C4. useWarehouseTransfers — unbounded + nested wildcard
**File:** `src/hooks/useWarehouseOperations.ts:310`
**Query:** `.select('*, from_warehouse:..., to_warehouse:..., transfer_items:warehouse_transfer_items(*)')`
**Issues:** NO_LIMIT, SELECT_STAR on transfer_items
**Fix:** Add `.limit(50)` | **Status:** FIXED

### C5. useStockAdjustments — 3-level join, unbounded
**File:** `src/hooks/useWarehouseOperations.ts:455`
**Query:** `.select('*, warehouses(...), inventory_brand_variants(...inventory_items(...inventory_categories(...))), stock_adjustment_approvals(...)')`
**Issues:** NO_LIMIT, 3-level join on every row
**Fix:** Add `.limit(100)` | **Status:** FIXED

### C6. useInventoryChecks — unbounded
**File:** `src/hooks/useWarehouseOperations.ts:600`
**Query:** `.from('inventory_checks').select(explicit_cols).order(...)`
**Issues:** NO_LIMIT
**Fix:** Add `.limit(100)` | **Status:** FIXED

### C7. usePurchaseOrders + useReceivals — polling doesn't pause on hidden tab
**File:** `src/hooks/usePurchaseOrders.ts:287`, `src/hooks/useReceivals.ts:99`
**Pattern:** `refetchInterval: 60_000` without `refetchIntervalInBackground: false`
**Issues:** Continues polling when tab is hidden, wastes Supabase quota
**Fix:** Add `refetchIntervalInBackground: false` | **Status:** FIXED

### C8. useReceivalEditRequests — unbounded
**File:** `src/hooks/useReceivals.ts:201`
**Fix:** Add `.limit(50)` | **Status:** FIXED

### C9. useLcLockedReceivalIds — full table scan client-side
**File:** `src/hooks/useReceivals.ts:551`
**Query:** `.from('landed_costs').select('attached_receival_ids').not('applied_at','is',null).is('voided_at',null)`
**Issues:** Fetches every applied LC to build a Map client-side
**Fix:** Create a view or add `.limit(500)` as interim | **Status:** FIXED (limit added)

### C10. usePurchaseReturns — N+1 two-query pattern
**File:** `src/hooks/usePurchaseReturns.ts:37`
**Pattern:** Query returns, then separate query for credit_notes by ID list, then client-side join
**Issues:** Two round trips + client-side join instead of PostgREST LEFT JOIN
**Fix:** Medium-term: refactor to `.select('*, credit_notes!left(*)')` | **Status:** DEFERRED

### C11. Missing index: inventory_check_assignments(check_id)
**File:** `src/hooks/useWarehouseOperations.ts:794`
**Fix:** Add composite index | **Status:** FIXED (in perf_indexes migration)

---

## Moderate Findings

### M1. usePOPayments — no limit
**File:** `src/hooks/usePurchaseOrders.ts:367`
**Fix:** Add `.limit(200)` | **Status:** FIXED

### M2. useReceivalsForLcSelector — unbounded, client-side search
**File:** `src/hooks/useReceivals.ts:423`
**Fix:** Add `.limit(500)` | **Status:** FIXED

### M3. useReceivalItemsBatch — no limit on .in() query
**File:** `src/hooks/useReceivals.ts:473`
**Fix:** Add `.limit(1000)` | **Status:** FIXED

### M4. useStartInventoryCheck — sequential inserts in loop
**File:** `src/hooks/useWarehouseOperations.ts:902`
**Fix:** Batch all inserts into single call | **Status:** DEFERRED (refactor)

### M5. useApproveCheckStep — queries all steps per approval
**File:** `src/hooks/useWarehouseOperations.ts:1052`
**Fix:** Add `.limit(100)` | **Status:** FIXED

### M6. useCompleteAssignment — 7 round trips for one action
**File:** `src/hooks/useWarehouseOperations.ts:974`
**Fix:** Create RPC | **Status:** DEFERRED (refactor)

### M7. useSubmitPOForApproval — 10+ sequential queries
**File:** `src/hooks/usePurchaseOrders.ts:576`
**Fix:** Parallelize with Promise.all() or create RPC | **Status:** DEFERRED (refactor)

### M8. Landed Costs detail — SELECT_STAR on detail queries
**File:** `src/app/(dashboard)/purchase/landed-costs/page.tsx:48`
**Fix:** Use explicit columns | **Status:** DEFERRED

### M9. Warehouse Reports API — 2000-row limits
**File:** `src/app/api/warehouse/reports/route.ts:74`
**Note:** Acceptable for PDF batch exports, but consider streaming for very large datasets
**Status:** ACCEPTABLE

---

## Realtime Channel Findings (info only — no Purchase/WH channels)

The Purchase and Warehouse modules use TanStack Query polling, not Supabase Realtime channels. The following channels exist elsewhere:

| Channel | File | Event | Filter | Severity |
|---------|------|-------|--------|----------|
| `cc-sync-${provider}` | sync-worker.ts:74 | `*` | NONE | HIGH — unfiltered on chat_messages |
| `thread-${id}` | useLiveThread.ts:178 | `*` | `conversation_id=eq.X` | MEDIUM — broad event, mitigated by row filter |
| `global-inbound-sound` | useContactCenterState.ts:121 | INSERT | `from_type=eq.customer` | OK |
| `app_settings_provider` | useProviderSetting.ts:42 | UPDATE | `key=eq.cc_provider` | OK |

These were addressed in the June 8 audit. The stock-value-live and calendar-realtime channels (flagged in June) have already been converted to polling.

---

## Indexes Added

Migration: `supabase/migrations/YYYYMMDDHHMMSS_perf_indexes.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_inventory_check_assignments_check_id ON inventory_check_assignments(check_id, created_at);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_created_at ON warehouse_transfers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created_at ON stock_adjustments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_checks_created_at ON inventory_checks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landed_costs_date ON landed_costs(date DESC);
CREATE INDEX IF NOT EXISTS idx_receivals_po_id ON receivals(po_id);
CREATE INDEX IF NOT EXISTS idx_receival_items_receival_id ON receival_items(receival_id);
```

---

## Deferred Items (Medium-Term)

These require refactoring beyond adding limits/indexes:

1. **usePurchaseReturns N+1** — Refactor to PostgREST LEFT JOIN
2. **useStartInventoryCheck** — Batch inserts instead of loop
3. **useCompleteAssignment** — Create single RPC for 7 round trips
4. **useSubmitPOForApproval** — Parallelize or create RPC
5. **useLcLockedReceivalIds** — Create dedicated view

---

## Post-Fix Results

_To be updated after fixes are deployed and Supabase Query Performance page is checked._
