# Tools & Assets — Phase 2 (Health & Disposal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL — `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use `- [ ]` checkboxes.
> **Read first:** `../design.md` §4.2/§5.2/§6/§7/§8/§11, `../required-data.md`, `../issues.md` (ISSUE-1/2/7 — all resolved/decided), and **`phase-2/required-data.md`** (the Phase-2 data map — investigated on the live DB). This plan assumes that context.

**Goal:** On-demand condition checks ("monthly check"), a Repair bucket, and disposal — mark a team's tools **Good / Bad / Under-repair**; collect Under-repair units in a **Repair** tab; resolve each **Repaired** (back in service) or **Scrap** (retire + post cost to the P&L "Scrap & Defective" line). Layers onto the Phase-1 hub + ledger — **do not rebuild Phase 1.**

**Key decisions (locked):**
- **Scrap valuation (ISSUE-1 fork, operator 2026-08-18):** value from the unit's **receival FIFO layer** (`total_unit_cost`), recorded at purchase. **No** `average_cost` fallback, **no** manual entry. No-FIFO-layer units scrap at **zero + "no cost on record" note** (design §8, never fail). Reuse the existing write-off → movement → `v_scrap` path (no new P&L code). Staging test uses the **26 costed** units.
- **No new enums (design §4.4):** Good→`condition='Good'`, Bad→`condition='Fair'`, Under-repair→`status='maintenance'`, Repaired→`assigned`/`available`+`Good`, Scrap→`retired`+ledger `release_reason='scrapped'`. Inspection `verdict` is a `text CHECK IN ('good','bad','under_repair')`.

## Global Constraints (same as Phase 1)

- Migrations → **staging** `mwvblpgbgxipvrevkeff` via `npx supabase db push`; **mirror** into `supabase/migrations-staging/`; new-prod via guarded `psql` (`NEW_DB_URL`) at ship time only, drift-checked first.
- **Live DB is the only authority.** Before writing/extending any function, fetch its live body (`pg_get_functiondef`) and rebase. Confirm enum values + column names live before use. Sweep `pg_proc` for overloads before any DROP/CREATE.
- New table: `ENABLE ROW LEVEL SECURITY` + ≥1 policy. New RPC: `SECURITY DEFINER`, permission-checked in-body (`public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage')` — the exact expression used by the Phase-1 write RPCs), `REVOKE ALL … FROM public` + `GRANT EXECUTE … TO authenticated, service_role`.
- Rolled-back probe before + after each RPC (impersonate admin via `set_config('request.jwt.claim.sub', '<sub>', true)`; staging sub `e9dc82d6-64eb-453c-b8f5-a5a4bbc91f00`).
- Co-authorship trailer on every commit; commit only when it works; **ask before pushing** (one Vercel build per deploy).
- UI: responsive 4 breakpoints; human-readable labels; `min-h-*` layout stability; dialog standards (one scroll region, non-sticky footer — see the Phase-1 refinements); 44px touch targets; `toDbError` wrap.
- `impeccable` drives UI (product register). Don't run `next build`. Hand UI smoke to the operator.

## File Structure

**Create (DB):**
- `supabase/migrations/20260922000000_tool_unit_inspections.sql` — inspection table + RLS.
- `supabase/migrations/20260922000100_tool_inspection_repair_rpcs.sql` — `rpc_record_tool_inspection`, `rpc_resolve_tool_repair`, read RPCs.
- Mirror each into `supabase/migrations-staging/`.

**Create (TS):** `src/hooks/useToolInspections.ts`, `src/hooks/useToolRepair.ts`, `src/components/warehouse/tools-assets/RepairTab.tsx`, `.../ScrapToolDialog.tsx`, `.../InspectionVerdictButtons.tsx`.

**Modify:** `ToolsAssetsHub.tsx` (+ Repair tab), `TeamToolsDetail.tsx` (+ verdict buttons + last-checked hint), `docs/flows-registry.md`, `PROGRESS.md`, EOD.

---

## Task 1: `tool_unit_inspections` table

**Files:** `supabase/migrations/20260922000000_tool_unit_inspections.sql` (+ mirror)

- [ ] **Step 1: Confirm live enums + the release_reason CHECK** — `npx supabase db query --linked` (one-line): `tool_condition` = New/Good/Fair/Maintenance; `tool_status` = available/assigned/maintenance/retired; confirm `tool_unit_assignments.release_reason` CHECK already allows `'scrapped'` (added `20260920000000`).
- [ ] **Step 2: Write the migration** (mirror `tool_unit_assignments` RLS + the Phase-1 perm expression exactly):

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.tool_unit_inspections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id             uuid NOT NULL REFERENCES public.tool_asset_units(id) ON DELETE CASCADE,
  custody_location_id uuid REFERENCES public.warehouse_sub_containers(id),   -- team at check time (snapshot)
  inspected_at        timestamptz NOT NULL DEFAULT now(),
  inspected_by        uuid,
  verdict             text NOT NULL CHECK (verdict IN ('good','bad','under_repair')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tool_unit_inspections_unit ON public.tool_unit_inspections (unit_id, inspected_at DESC);
ALTER TABLE public.tool_unit_inspections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY tui_select ON public.tool_unit_inspections FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY tui_write ON public.tool_unit_inspections FOR ALL TO authenticated
    USING (public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage'))
    WITH CHECK (public._user_has_permission(public._current_user_data_id(), 'inventory.catalog.manage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;
```
> Confirm the perm expression byte-matches the Phase-1 policy `tua_ledger_write` (copy from its live body).

- [ ] **Step 3: Apply to staging** (`db push`); **Step 4: verify** columns (8) + RLS `t` + both policies + index; **Step 5:** rolled-back insert probe (valid verdict OK; `verdict='x'` rejected by CHECK). **Step 6:** mirror + commit `feat(db): tool_unit_inspections table + RLS`.

---

## Task 2: record-inspection + read RPCs

**Files:** `supabase/migrations/20260922000100_tool_inspection_repair_rpcs.sql` (+ mirror) — this file also holds Task 3's resolve-repair RPC.

**Produces:**
- `rpc_record_tool_inspection(p_unit_id uuid, p_verdict text, p_notes text DEFAULT NULL) RETURNS uuid` — insert inspection (snapshot `custody_location_id = unit.current_custody_location_id`, `inspected_by = _current_user_data_id()`), then apply §6: `good`→`condition='Good'`; `bad`→`condition='Fair'`; `under_repair`→`status='maintenance'` (leave `condition`). Permission-gated.
- `get_repair_bucket(p_division_ids uuid[] DEFAULT NULL) RETURNS TABLE(unit_id, item_name, serial_number, brand, division_id, division_name, current_team_id, current_team_name, last_inspected_at)` — units with `status='maintenance'`, division-scoped (via `tool_asset_units.division_id`), not retired.
- `get_team_tool_units_v2(p_team_id uuid)` OR extend the Phase-1 `get_team_tool_units` to add `last_inspected_at` + `inspection_due boolean` (no inspection in the current calendar month). **Prefer a NEW RPC** (`get_team_tool_units` return-shape change would need DROP+CREATE + a hook update — acceptable, but a v2 avoids touching the Phase-1 read); decide at build.

- [ ] **Step 1:** confirm `_current_user_data_id()` + `_user_has_permission` signatures live (used by Phase-1). **Step 2:** write the RPCs (LANGUAGE plpgsql for record/resolve; sql STABLE for reads). **Step 3:** `db push`. **Step 4:** rolled-back probe (impersonate admin): record `good`/`bad`/`under_repair` on a test unit → assert condition/status transitions + a row inserted; `get_repair_bucket` returns the `maintenance` unit. **Step 5:** grants (no anon). **Step 6:** commit with Task 3 (same migration file) — see Task 3.

---

## Task 3: resolve-repair (Repaired / Scrap→P&L)

**Files:** same migration `20260922000100`.

**Produces:** `rpc_resolve_tool_repair(p_unit_id uuid, p_outcome text, p_notes text DEFAULT NULL) RETURNS void` — `p_outcome IN ('repaired','scrap')`, permission-gated.
- **repaired:** `condition='Good'`; `status = CASE WHEN current_custody_location_id IS NOT NULL THEN 'assigned' ELSE 'available' END`.
- **scrap (design §8, ISSUE-1/2 resolutions):** in ONE txn —
  1. Close the open ledger row (`released_at=now(), release_reason='scrapped'`) + `status='retired'` + `current_custody_location_id=NULL`.
  2. Resolve the unit's stock position: `receival_item_id → receival_items(brand_variant_id, sub_container_id)`; cost from `fifo_cost_layers` (`brand_variant_id, receival_id`).
  3. **If** a `brand_variant_id`+`sub_container_id` resolve **and** stock exists to write off: post a **qty-1 `write_off`** via the existing path so it books an `inventory_stock_movements` row (FIFO-valued) that `rpc_report_pnl` reads into `v_scrap`. **Else** (no receival link / no cost): retire only, post **zero value**, set a `notes` marker "no cost on record" — **never fail the scrap.**
  4. Must **not hard-fail** if qty stock at the sub-container is already 0/short (ISSUE-2 drift guard) — retire + warn.

- [ ] **Step 1 (MANDATORY): fetch the write-off applier live bodies FIRST** — `pg_get_functiondef` for `create_stock_adjustment_v2`, `apply_adjustment`, `action_stock_adjustment_step`, `force_approve_stock_adjustment`. Decide the atomic reuse: prefer **insert an `approved` `stock_adjustments` write-off row + call `apply_adjustment(id)`** (skips the human approval chain + notification fan-out) IF `apply_adjustment` books the movement + `deduct_fifo_layers` + stock update on its own; else `create_stock_adjustment_v2` + `force_approve_stock_adjustment`. **Do not duplicate P&L logic** — call the existing applier. Record the chosen path in `../issues.md`.
- [ ] **Step 2:** write `rpc_resolve_tool_repair` reusing the chosen applier. Guard every external assumption (stock present, layer present) with graceful fallbacks.
- [ ] **Step 3:** `db push`.
- [ ] **Step 4: rolled-back probes (impersonate admin), on the 26 COSTED units:**
  - **scrap-with-cost:** pick a costed, non-retired unit → `rpc_resolve_tool_repair(u,'scrap')` → assert: unit `retired` + ledger row closed `scrapped` + pointer NULL; a new `inventory_stock_movements` adjustment/write_off row for its `(brand_variant, sub_container)` with `unit_cost>0`; `warehouse_stock_summary.qty` −1; FIFO `remaining_qty` −1. **Then `RAISE EXCEPTION 'rollback probe'`.**
  - **P&L delta:** wrap a `rpc_report_pnl` call before/after the scrap inside the same rolled-back txn → assert `v_scrap` increased by the unit cost (division-scoped). Roll back.
  - **scrap-no-cost:** temporarily null a unit's `receival_item_id` in-txn (or pick a no-link unit) → scrap → assert retired + **no** movement + a "no cost" note; no exception. Roll back.
  - **repaired:** a `maintenance` unit → `rpc_resolve_tool_repair(u,'repaired')` → `status` back to assigned/available + `condition='Good'`. Roll back.
  - **gate:** non-manager (unset jwt claim) → `not authorized`.
- [ ] **Step 5:** grants (no anon) for both Task-2 + Task-3 RPCs. **Step 6:** mirror + commit `feat(db): tool inspection + repair/scrap RPCs (scrap reuses write-off → v_scrap)`.

---

## Task 4: Regenerate types + hooks

**Files:** `src/types/database.types.ts` (regen + re-append the 4 helper aliases — CLI wipes them); `src/hooks/useToolInspections.ts`, `src/hooks/useToolRepair.ts`.

- [ ] Regenerate types (`npx supabase gen types typescript --linked`), re-append `DBTable/DBInsert/DBUpdate/AllTables`. **Step 2:** write the two hooks mirroring `useToolAssignments.ts` (createClient import, `toDbError`, `queryKeys.toolAssignments` invalidation + a new `queryKeys.toolInspections` group): `useRecordInspection`, `useResolveRepair`, `useRepairBucket(divisionIds?)`, and (if v2 read) `useTeamToolUnitsV2`. **Step 3:** `tsc --noEmit` + `eslint` clean. **Step 4:** commit `feat(hooks): tool inspection + repair hooks`.

---

## Task 5: Teams tab — verdict buttons + last-checked

**Files:** `src/components/warehouse/tools-assets/TeamToolsDetail.tsx` (+ `InspectionVerdictButtons.tsx`).

- [ ] Add per-row **Good / Bad / Under-repair** buttons (label Bad as "Bad / Needs attention"; persists `condition='Fair'`) calling `useRecordInspection`. Show `last_inspected_at` + a "due this month" badge per row (from the v2 read). Under-repair moves the unit into the Repair tab (status `maintenance`). Layout-stable (fixed row height); optimistic invalidate. **Step 2:** `tsc`/`eslint`. **Step 3:** commit `feat(tools-assets): inspection verdict buttons + last-checked on team detail`.

---

## Task 6: Repair tab + Scrap dialog

**Files:** `ToolsAssetsHub.tsx` (add tab), `RepairTab.tsx`, `ScrapToolDialog.tsx`.

- [ ] Add a **Repair** tab (§5.2) beside Teams / History & Usage — a bucket of `status='maintenance'` units (`useRepairBucket`, division-scoped via top bar), grouped by division (mirror the Teams-tab grouping). Per unit: **Repaired** (→ `useResolveRepair('repaired')`) and **Scrap** (opens `ScrapToolDialog`). Scrap dialog: confirm + notes; shows the resolved cost (or "no cost on record") before confirming; fixed-size, one scroll region, non-sticky footer (Phase-1 refinement pattern). **Step 2:** `tsc`/`eslint`. **Step 3:** commit `feat(tools-assets): Repair tab + Scrap dialog (repaired/scrap→P&L)`.

---

## Task 7: Docs, security audit, guarded ship

- [ ] Flow-registry: add **Record Tool Inspection**, **Resolve Tool Repair (Repaired/Scrap)** entries (cross-link `[[Assign / Move / Return Tool Unit (team custody)]]`, `[[Create Stock Adjustment]]`, `[[Tool Unit Custody History & Usage]]`). **Step 2:** security-audit row (new table RLS, DEFINER RPCs revoke public/gate manage, error handling, layout stability). **Step 3:** PROGRESS + EOD. **Step 4:** operator staging smoke (verdict flow → repair bucket → repaired; scrap a costed unit → confirm P&L Scrap line rises by the cost, unit retired, stock −1; scrap a no-cost unit → retires at zero + note). **Step 5 (ASK FIRST):** guarded new-prod apply of the 2 migrations (drift-check first) + post-apply probes; then push the batched commits (one Vercel build).

---

## Self-review
1. **Coverage:** monthly check ✔ (T2/T5), Repair bucket ✔ (T6), Repaired ✔ (T3/T6), Scrap→P&L ✔ (T3/T6, reuse write-off), zero-value edge ✔ (T3), FIFO/unit sync ✔ (T3 via applier + retire).
2. **No new P&L code / no new enums** — reuse `apply_adjustment` path; §6 uses existing enums.
3. **Live-DB first** — applier bodies fetched before the scrap RPC; enums/columns confirmed before DDL; overload sweep before any DROP.
4. **Test scope** — scrap probes run on the 26 costed units; zero-value path probed separately; all rolled back.
5. **Ship discipline** — staging → operator smoke → guarded new-prod → one push, gated on go-ahead.
