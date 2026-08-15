# Multi-Division Purchase Order — Phase 2

**Date:** 2026-08-15
**Status:** Receiving routing **DONE + DB-verified on staging**. Money-out attribution (Option B) **DONE + DB-verified on staging** (migration `20260824000500`) — see §2.

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

**Money-out (payables + payment-side P&L) — now attributes per division (Option B, report-only).**

Implemented in migration `20260824000500` with one source of truth for the split ratio:

- **`_po_division_weights(po_id)`** (SECURITY INVOKER, `REVOKE`d from anon/authenticated) — returns each division's share of the PO's line value (`SUM(po_line_items.total_price)` grouped by `division_id`, weights sum to exactly 1). Returns no rows when the PO has no usable line-division breakdown → callers fall back to the header division.
- **`rpc_report_accounts_payable`** — expands each bill into one row per division via `CROSS JOIN LATERAL`, allocating `amount`/`paid` pro-rata by weight. The rounding **residual is assigned to the largest-weight slice** so the per-division rows tie back to the bill total to the cent. Visibility + `p_division_ids` now key on the **allocated** division, so a mixed bill's Trading slice is visible to a Trading viewer (previously pinned to the header division only). Bills with no breakdown (manual, single-division, legacy) emit one row exactly as before.
- **`rpc_report_pnl`** — `v_fx` (realized FX, both bases) and cash-basis `cash_out` split purchase payments across the PO's divisions by the same weights; incoming (sales) payments and non-PO payments keep header attribution. Accrual revenue/COGS and scrap are unchanged (already physical-/sale-driven).
- **`rpc_report_pnl_fx_detail`** (migration `20260824000600`) — the drill-down behind the P&L "Exchange Gain / Loss" line splits the same way (a foreign-currency purchase payment on a mixed PO becomes one row per division, amounts + FX pro-rata), so `SUM(net_fx)` in the dialog reconciles with the P&L `fx_net` under any division filter. Adds `division_id`/`division_name` columns (dialog gains a Division column; verified `SUM(net_fx)` = P&L `fx_net` = −25,147.70 on real staging data).

**Deliberate boundary — the Cash report (`rpc_report_cash`) is NOT split.** It is a running-balance cash ledger (whole payments, one sequential balance); slicing a single real cash outflow into fractional per-division lines would corrupt the balance. Whole-payment attribution to the PO header division is the correct treasury view there. Per-division cost allocation lives in the aggregation reports (AP + P&L), which are done.

**No bill or payment row is written differently** — storage is untouched; only the reads expand. Grand totals are preserved by construction (weights sum to 1); with a division filter, each division sees exactly its share.

**Verified on staging (rolled-back probes, owner JWT context):**
- 3-division synthetic bill 100.00 → rows 33.34 / 33.33 / 33.33 (residual on largest), `SUM(amount)=100.00`, `SUM(paid)=40.00`.
- Real PO-2026-08-007, one 5000.00 bill (2000.00 paid) → Maintenance 2659.19 / Kitchen 2340.81 (`SUM=5000.00`); paid 1063.67 / 936.33 (`SUM=2000.00`).
- Filtering to one division returns that division's single slice.
- P&L `cash_out` (NULL filter) equals a direct un-split SUM of visible outgoing payments — split preserves the grand total.

### Rejected alternative
- **(A) Split the bill per division at creation** (one `bills` row per division): cleanest data but changes the bills UX + schema and touches the write path. Rejected in favour of report-only (B) — same reporting fidelity, zero write-path risk.

## 3. Per-division / split approval — OUT OF SCOPE
Approval is amount-tier based and division-agnostic; splitting one PO's approval across divisions adds significant workflow complexity for little value. Not planned.

## Ship state — SHIPPED TO PROD
- Migrations `20260824000400` (receiving) + `20260824000500` (money-out attribution) + `20260824000600` (FX drill-down split) applied to **staging AND new-prod** (both `db push`-recorded + mirrored) + object-verified on new-prod. Frontend `tsc`+eslint clean.
- Commits `08bec1a8`/`fc6c12bb` (receiving) + `8ac1f5b5`/`c2336b6a` (money-out) pushed to `deploy/warehouse-shipping` (`57014f76..c2336b6a`) → Vercel prod rebuild.
- Recommended post-ship operator smoke: open **Reports → Accounts Payable** with a bill on a multi-division PO and confirm one row per division, per-division subtotals, and a grand total matching the bill; open the P&L FX drill-down and confirm it still sums to the `fx_net` line.
