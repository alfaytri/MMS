# Multi-Division Purchase Order — Phase 2

**Date:** 2026-08-15
**Status:** Receiving routing **DONE + DB-verified on staging** (uncommitted-pushed — see below). Money-out attribution **designed, deferred for review**.

Phase 2 covers the three items Phase 1 deferred. This documents what was built and what was deliberately left for review.

## 1. Per-division receiving routing — ✅ DONE (staging, DB-probe-verified)

**Problem:** receiving is one sub-container (one division) per pass. Phase 1 forced the sub-container to equal the PO **header** division, so a mixed PO could only receive its primary-division lines.

**Built:**
- **`create_and_approve_receival`** (migration `20260824000400`): the destination sub-container may now be in **any** of the PO's `division_ids` (not just the header); and **per-line routing** is enforced — every PO line received in a pass must belong to the chosen sub-container's division, else it raises. Multi-division POs require an explicit sub-container (auto-pick only for single-division). The item loop (FIFO layers, stock, movements) is unchanged.
- **`PoReceiveTab`**: sub-container filter widened to the PO's division set; the chosen bin's division locks non-matching lines ("Other division", muted, excluded from submit); required-sub-container + operator note for multi-division POs. Per-line division badges (from Phase 1) show which division each line is.

**Model:** a mixed PO is received **one pass per division** — pick that division's warehouse/sub-container, receive its lines, repeat. Verified: Kitchen-line→Maintenance-bin is blocked; Maintenance-line→Maintenance-bin succeeds.

## 2. Financial attribution

**Stock-/inventory-driven reports auto-attribute per division** once receiving routes each line to its own division's sub-container — no code change needed. Verified against the live report bodies:
- `rpc_report_product_cost` — groups by `warehouse_sub_containers.division_id` (the FIFO layer's bin). ✅
- `rpc_report_revenue_cogs` — by consumption-entry division. ✅
- `rpc_report_pnl` — inventory / write-off side by sub-container division. ✅

**Money-out (payables + payment-side P&L) still attributes by the PO/bill header** — NOT per line:
- `rpc_report_accounts_payable` keys on `supplier_bills.division_id` (one division per bill).
- `rpc_report_pnl` purchase side keys on `po.division_id` for payments.

So a mixed PO's **bill/payments** land under its primary division in AP and the P&L purchase line.

### Recommendation for money-out per-division attribution (DEFERRED — money-path, review first)
This was **not** implemented overnight because it changes displayed financials and touches the bills/payments money-path, which must be browser-verified with a real login before shipping. Two options for review:
- **(A) Split the bill per division** at bill creation: when a bill covers a multi-division PO, create one `supplier_bills` row per division (amount = sum of that division's line values). AP + P&L then attribute correctly with no report change. Cleanest, but changes the bills UX + schema expectations.
- **(B) Allocate in the report only:** leave one bill; have `rpc_report_accounts_payable` (and the P&L purchase CTE) expand a multi-division PO's bill into per-division rows, allocating amount/paid/due pro-rata by line value (`po_line_items.total_price` grouped by `division_id`). No bill-write change; report-only. Lower write risk, but the allocation logic must be exact (rounding, partial payments).

Recommendation: **(B)** for reporting fidelity without disturbing the bills money-path, implemented as a separate reviewed slice.

## 3. Per-division / split approval — OUT OF SCOPE
Approval is amount-tier based and division-agnostic; splitting one PO's approval across divisions adds significant workflow complexity for little value. Not planned.

## Ship state
- Migration `20260824000400` applied to **staging** + mirrored. Frontend `tsc`+eslint clean.
- **Committed locally, NOT pushed** — awaiting morning review before it deploys to prod (Phase 1 is already on prod). New-prod does NOT yet have `20260824000400`.
