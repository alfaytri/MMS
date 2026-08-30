# Phase 3a — Sales-Return COGS-Reversal Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or subagent-driven). Money-path — follow the SQL self-check + mutation-path memory rules on EVERY RPC.

**Goal:** Make **every** processed sales-return outcome reverse the original sale's COGS (and revenue) — not just good-restock — so the P&L stops overstating profit, and give the free replacement delivery a real (revenue-free) COGS.

**Accounting model (operator-confirmed 2026-08-30): FULL-LINE REVERSAL.** Every processed return reverses BOTH the sale's revenue and its COGS via a negative `cogs_entries('sale_return')` (mirrors the one correct path, `rpc_process_return_restock`); the disposition then routes the physical cost (damaged asset / scrap loss / repair). The customer cash side stays separate (credit notes).

**P&L math (from live `rpc_report_pnl`):** Revenue = `Σ(cogs_entries.qty × sale_order_line.unit_price × fx)`; COGS = `Σ(cogs_entries.total_cost)` over `source_type IN ('sale','sale_return','consumption','landed_cost','landed_cost_reversal')`; Scrap = `inventory_damaged_movements.movement_type='damaged_write_off'` + approved `write_off` stock-adjustments. So a negative `cogs_entries('sale_return')` (qty<0, total_cost<0) reverses revenue AND cost together.

**Tech Stack:** Supabase Postgres RPCs (psql-applied migrations), no frontend changes (return UI already calls these RPCs).

**Spec:** [docs/plans/2026-08-29-consumption-sales-returns-warranty-design.md](2026-08-29-consumption-sales-returns-warranty-design.md) §3, §5.3.

## Global Constraints

- **Verification:** no vitest. Per RPC: `pg_get_functiondef` BEFORE (baseline is stale) → `CREATE OR REPLACE` from the live body → **rolled-back psql probe** proving the compensating `cogs_entries` nets the original to zero (or to scrap) for that exact disposition → then apply. Single overload; verify columns/enums exist; caller-grep after.
- **Migrations:** each `.sql` to BOTH `supabase/migrations/` AND `supabase/migrations-staging/`; apply psycopg2 to **staging** + **new-prod**; record `schema_migrations`. Next versions from `20260831000700`.
- **`source_type` is text** — `sale_replacement` needs no `ALTER TYPE`. **`movement_type` is the `stock_movement_type` enum** — do NOT invent new stock-movement values; the scrap movement is `damaged_write_off` in `inventory_damaged_movements` (its own type), emitted by the existing damaged path (verify, don't double).
- **No historical backfill** (forward-fix only — spec §7).
- **Do NOT regress the sales good-restock path** or the physical disposition handling — only ADD the COGS reversal that's missing. Per-path probes cover both.
- **Commits:** one local commit per task, both co-author trailers. Do NOT push (operator batches; money-path wants a staging smoke first).

---

### Task 1: Shared reversal helper + wire into restock-as-damaged

**Files:** Create `supabase/migrations/20260831000700_reverse_sale_cogs_helper_and_restock_damaged.sql` (+ staging mirror).
**Reference (fetch live):** `_record_inventory_disposition(uuid,text,numeric,uuid,uuid,text,uuid)` — the `restock_as_damaged` recorder (`supabase/migrations/20260819430000_damaged_writeoff_division_write_path.sql:309`); `rpc_process_return_restock` negative-cogs loop is the template.

**Interfaces:**
- Produces: `public._reverse_sale_cogs_for_return(p_return_id uuid, p_brand_variant_id uuid, p_qty numeric) RETURNS numeric` (returns total cost reversed). Consumed by Tasks 1–3.

- [ ] **Step 1: Write the helper.** SECURITY DEFINER, `search_path=public`. Mirror `rpc_process_return_restock` lines 128–188 BUT **no re-layer** (damaged/scrapped units don't re-enter sellable stock) — only the negative `cogs_entries`:
  - Resolve the return's `source_id` (sale_order) + `division_id` + `return_number` from `so_po_returns`.
  - Guard: `sum(qty)` of original `cogs_entries` (source_type='sale', sale_order_id=source_id, variant, qty>0) ≥ p_qty (else RAISE — can't reverse more than sold).
  - Loop the original sale cogs (ORDER BY date,unit_cost,id), chunk against p_qty, INSERT `cogs_entries(brand_variant_id, sale_delivery_id, sale_order_id, qty=-chunk, unit_cost, total_cost=-(chunk*unit_cost), date=current_date, source_type='sale_return', division_id=coalesce(return.div, cogs.div), notes='Reversed by return '||return_number||' (disposition)')`. Accumulate reversed cost. RAISE if unmatched remainder.
  - REVOKE anon; GRANT authenticated.
- [ ] **Step 2: Wire into `restock_as_damaged`.** Fetch the live `_record_inventory_disposition` body; in the `restock_as_damaged` branch (after the physical damaged-asset handling), add `PERFORM public._reverse_sale_cogs_for_return(p_return_id, p_brand_variant_id, p_qty);` — but ONLY when the return is sale-sourced (`so_po_returns.source_type='sale_order'`; consumption handled in 3b). `CREATE OR REPLACE` the whole function verbatim + this line.
- [ ] **Step 3: Apply staging + rolled-back probe.** Pick (or synthesize in-tx) a sale delivery with COGS + a return line dispositioned restock-as-damaged; capture `Σ total_cost` of the sale's cogs for the variant; call the recorder; assert a new negative `cogs_entries('sale_return')` exists summing to `-(qty × unit_cost)` and that net COGS for that variant dropped by that much; confirm the damaged-asset rows still created (no regression). ROLLBACK.
- [ ] **Step 4: Apply new-prod. Step 5: Commit** (`feat(returns): reverse sale COGS on restock-as-damaged (+ shared helper)`).

---

### Task 2: Write-off at return — reverse COGS + scrap the loss

**Files:** Create `20260831000800_return_writeoff_cogs_reversal.sql` (+ mirror).
**Reference:** `rpc_record_inventory_disposition(uuid,uuid,jsonb)` write_off branch (`supabase/migrations/20260802000500_rpc_send_for_repair.sql:459`).

- [ ] **Step 1: Fetch live body.** Confirm the write_off branch already books the physical scrap into `inventory_damaged_movements` as `damaged_write_off` (the P&L Scrap source). If it does NOT, add it; if it DOES, do not duplicate.
- [ ] **Step 2: Add the COGS reversal.** In the write_off branch, `PERFORM public._reverse_sale_cogs_for_return(p_return_id, <variant>, <qty>)` for sale-sourced returns. Result: the sale line reverses (−rev −cost) AND the scrap loss lands on the P&L Scrap line — the cost is recognized once, in the right place.
- [ ] **Step 3: Apply staging + rolled-back probe.** Disposition a return line write_off; assert (a) negative `cogs_entries('sale_return')` nets the sale, (b) a `damaged_write_off` `inventory_damaged_movements` row exists for the qty (Scrap line will read it), (c) no double scrap. ROLLBACK. **Step 4: new-prod. Step 5: Commit** (`feat(returns): reverse COGS + scrap on write-off return`).

---

### Task 3: Send-for-repair / return-from-repair — reverse COGS on leaving "sold"

**Files:** Create `20260831000900_return_repair_cogs_reversal.sql` (+ mirror).
**Reference:** `rpc_send_damaged_for_repair(uuid,uuid,uuid,date,text,uuid)` + `rpc_return_damaged_from_repair(uuid,text,numeric,numeric,numeric,text)` (`supabase/migrations/20260810000100_phase_e_rpc_rewrites.sql:677,838`).

- [ ] **Step 1: Fetch both live bodies.** Determine WHERE the unit "leaves sold state" for a **return-sourced** repair (send-for-repair from a return disposition) — that's where the reversal belongs, ONCE (not on both send and return).
- [ ] **Step 2: Add the reversal at send-for-repair** (when the source is a sale return): `PERFORM _reverse_sale_cogs_for_return(...)`. Return-from-repair re-enters the repaired good at original+amortized-repair cost (existing behaviour) with **no re-expense** until resale — assert no double count. Guard so non-return repairs (damaged-stock-originated, no sale) are untouched.
- [ ] **Step 3: Apply staging + rolled-back probe** (reversal once on send; no second reversal on return; repaired-good cost intact). **Step 4: new-prod. Step 5: Commit** (`feat(returns): reverse sale COGS when a returned unit goes to repair`).

---

### Task 4: Replacement delivery — book cost, no phantom revenue

**Files:** Create `20260831001000_partial_replacement_cogs.sql` (+ mirror).
**Reference:** `rpc_create_partial_replacement(uuid,uuid,jsonb,jsonb,jsonb)` (`supabase/migrations/20260810000100_phase_e_rpc_rewrites.sql:465`); `rpc_report_pnl(date,date,text,uuid[],uuid[])`.

- [ ] **Step 1: Fetch live bodies.** Confirm the replacement today bypasses `complete_delivery_inventory` (ships with no COGS) and the original returned unit reverses via its disposition (Tasks 1–3 now cover that).
- [ ] **Step 2: Book the replacement's cost (revenue-free).** In `rpc_create_partial_replacement`, for each replacement line: `deduct_fifo_layers` from the shipping warehouse/sub, emit `inventory_stock_movements('sale_delivery')` (or the existing delivery movement) for the negative qty, decrement `stock_level`, and INSERT a **cost-only** `cogs_entries(qty=+qty, unit_cost, total_cost=+cost, source_type='sale_replacement', sale_order_id, division_id, notes)`. `sale_replacement` is COGS-counted but revenue-free.
- [ ] **Step 3: P&L — recognise the replacement cost with zero revenue.** `CREATE OR REPLACE rpc_report_pnl` from the live body: add `'sale_replacement'` to the `source_type IN (...)` set (line ~142) AND force its revenue to 0 — `revenue = CASE WHEN ce.source_type='sale_replacement' THEN 0 ELSE ce.qty * COALESCE(sol.unit_price,0) * COALESCE(so.exchange_rate,1) END`. COGS unchanged (its `total_cost` counts). Keeps cost visible without phantom revenue.
- [ ] **Step 4: Apply staging + rolled-back probe.** Create a partial replacement; assert (a) a positive cost-only `cogs_entries('sale_replacement')` exists, (b) FIFO deducted + stock_level dropped for the replacement, (c) `rpc_report_pnl` over the window shows the replacement cost in COGS but **0 revenue** for it, (d) the original returned unit's reversal (from its disposition) is present. ROLLBACK. **Step 5: new-prod. Step 6: Commit** (`feat(returns): book replacement COGS with no revenue (+ P&L sale_replacement)`).

---

### Task 5: Docs + whole-flow probe

- [ ] **Step 1: One consolidated rolled-back probe** exercising all four dispositions on real/synthesised returns, asserting net COGS + P&L revenue/cogs/scrap move exactly as the model predicts.
- [ ] **Step 2:** flows-registry (extend the return-disposition flows: "reverses sale COGS via `_reverse_sale_cogs_for_return`"); PROGRESS In-Progress + Security Audit row; EOD. Commit (`docs: Phase 3a sales-return COGS reversal`).
- [ ] **Step 3: Operator smoke (hand off)** on staging: run a real return through each outcome (restock-damaged, write-off, repair, replacement) and confirm the P&L Revenue/COGS/Scrap move correctly before new-prod sign-off / push.

## Self-Review

- **Coverage (§3 holes):** restock-as-damaged (T1), write-off + scrap (T2), send/return repair (T3), replacement no-COGS + original-not-reversed (T4). Good-restock untouched (already correct). Closure-invariant hardening (spec §5.3 optional) deferred — note in PROGRESS.
- **Model:** full-line reversal via `_reverse_sale_cogs_for_return` (confirmed); replacement is the one cost-only case (`sale_replacement`, revenue 0). Consumption returns (3b) will reuse the helper with a consumption variant.
- **Types/names:** `_reverse_sale_cogs_for_return(uuid,uuid,numeric)` defined T1, called T1–T3; `sale_replacement` written T4, read by `rpc_report_pnl` T4 (text source_type — no enum add). Reversal writes `source_type='sale_return'` (already in the P&L set + used by good-restock).
- **Risk:** highest — production return RPCs. Every task gates on a rolled-back per-path probe + a staging smoke before new-prod. **Replacement-revenue nuance to sanity-check at smoke:** full-line reversal of the original unit means a replacement shows −revenue on the original line; if the operator expects the sale to fully stand on a like-for-like swap, revisit T4's original-reversal (easy to gate).
