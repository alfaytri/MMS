# Tools & Assets — Phase 2 Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Read first:** `design.md` (this folder) — the approved spec. Also `../phase-2/plan.md` (the base this reworks), `../design.md`, and the flow-registry entries [[Send Damaged for Repair]] / [[Return Damaged from Repair]] / [[Assign / Move / Return Tool Unit (team custody)]].

**Goal:** Rework the not-yet-shipped Phase 2 into the operator's real workflow — repair as a cost-free lifecycle integrated with Damaged-Stock vendor send/return, New/Used/Repaired tracking, a formal monthly check-session page with PDF/Excel report, and a team tool tree view with return-destinations.

**Architecture:** Additive DB migrations on top of the staging-only Phase-2 objects, plus **one** modification to a shipped money-path RPC (`rpc_return_damaged_from_repair`, cost strip). Serialized tools plug into the existing `warehouse_transfers` repair machinery through **thin sibling RPCs keyed by `tool_unit_id`** — the sales-return disposition/qty machinery is left intact. Frontend reworks the Tools & Assets hub (team tree view, repair bucket → vendor send, check-session page) and edits the shared `ReturnFromRepairDialog`.

**Tech Stack:** Next.js (this repo's fork — read `node_modules/next/dist/docs/` before touching routing), Supabase Postgres (RPC-first, RLS), React Query, Tailwind (4 breakpoints), shadcn/ui, server-side Excel/PDF export (`/api/reports/excel`, `/api/reports/pdf`).

## Global Constraints

- **Migrations → staging** `mwvblpgbgxipvrevkeff` via `npx supabase db push`; **mirror** every `.sql` into `supabase/migrations-staging/` in the same commit. **No new-prod** until the whole rework is operator-smoked and the operator gives an explicit go-ahead (then a single guarded `psql` apply, drift-checked first).
- **Live DB is the only authority.** Before writing/extending any function, fetch its live body (`SELECT pg_get_functiondef('public.<fn>(<argtypes>)'::regprocedure)`) and rebase on it. **Never paste plan SQL verbatim** — verify column names, FKs, and enum values live first. Sweep `pg_proc` for overloads before any DROP/CREATE.
- **Enums (confirm live before use):** `tool_condition` = New/Good/Fair/Maintenance · `tool_status` = available/assigned/maintenance/retired · `tool_unit_assignments.release_reason` CHECK currently allows moved/returned/scrapped.
- **Every new RPC:** `SECURITY DEFINER SET search_path = public`, permission-gated in-body with `public._user_has_permission(public._current_user_data_id(), 'tools.assets.manage')`, `REVOKE ALL … FROM public` + `GRANT EXECUTE … TO authenticated, service_role` (no anon). **Every new table:** `ENABLE ROW LEVEL SECURITY` + ≥1 policy (read authenticated; write gated `tools.assets.manage`).
- **Rolled-back probe before + after each RPC change** — impersonate admin via `SELECT set_config('request.jwt.claim.sub','<sub>',true);` then run the mutation and `RAISE EXCEPTION 'rollback probe: <results>'` so nothing persists. Staging admin sub `e9dc82d6-64eb-453c-b8f5-a5a4bbc91f00`; new-prod admin sub `ef36d9ca-421d-4d6d-adcd-895ae2d733de`. `db query --linked` surfaces only the final ERROR — embed probe results in the RAISE text; use row-returning SELECTs (the JSON serializer drops FROM-less scalar SELECTs).
- **Types:** after any schema change, `npx supabase gen types typescript --linked > src/types/database.types.ts`, then **re-append** the 4 `DBTable/DBInsert/DBUpdate/AllTables` helper aliases (the CLI wipes them).
- **Commit discipline:** co-author trailer on every commit (Mohamed Ismail + Claude Sonnet 4.6, via HEREDOC). **DB tasks** commit after `db push` + probe-green + mirror. **Frontend tasks** build + `tsc --noEmit` + `eslint` clean, then **hold** — commit only after the operator confirms the staging smoke ("working"). **Do not run `next build`.** Hand UI smoke to the operator; `impeccable` drives UI work.
- **UI:** responsive at all 4 breakpoints; human-readable labels (no raw UUIDs in any Select — resolve via `.find()`); `min-h-*` layout stability; dialog standards (one scroll region, non-sticky footer, full-screen on mobile); ≥44px touch targets; wrap DB errors with `toDbError` (surface the real Postgres message).
- **2 pre-existing failures** in `src/lib/permissions.test.ts` are unrelated — do NOT fix.

## File Structure

**Create (DB migrations — mirror each into `supabase/migrations-staging/`):**
- `supabase/migrations/20260923000000_tool_lifecycle_type.sql` — Task 1
- `supabase/migrations/20260923000100_tool_return_destination.sql` — Task 2
- `supabase/migrations/20260923000200_tool_repair_bridge.sql` — Task 3 (3a+3b, one file)
- `supabase/migrations/20260923000300_strip_repair_cost.sql` — Task 4
- `supabase/migrations/20260923000400_tool_check_sessions.sql` — Task 5

**Create (TS hooks):** `src/hooks/useToolRepair.ts` (extend), `src/hooks/useToolChecks.ts` (new), `src/hooks/useReturnDestinations.ts` (new).

**Create (components):** `src/components/warehouse/tools-assets/SendToRepairDialog.tsx`, `.../ReturnToolDialog.tsx`, `.../SendToolForRepairDialog.tsx`, `.../checks/ToolCheckPage.tsx`, `.../checks/ToolCheckTeamPanel.tsx`.

**Modify:** `TeamToolsDetail.tsx` (→ tree view, remove inline Good/Bad, add Return/Send-to-Repair), `RepairTab.tsx` (awaiting-vendor → Send-for-repair), `ToolsAssetsHub.tsx` (+ Checks tab/route), `ToolAssetEditDialog.tsx` (lifecycle override), `ReturnFromRepairDialog.tsx` (remove Repair Cost), the Damaged-Stock overview read + component (show tool rows), `docs/flows-registry.md`, `PROGRESS.md`, EOD.

---

## Task 1: Lifecycle type — New / Used / Repaired

**Files:** Create `supabase/migrations/20260923000000_tool_lifecycle_type.sql` (+ mirror).

**Produces:** enum `tool_lifecycle_type ('new','used','repaired')`; `tool_asset_units.lifecycle_type` (NOT NULL DEFAULT 'new'); `rpc_assign_tool_unit_to_team` advances `new→used` on assign; `get_team_tool_units_v2` + `get_assignable_tool_units` return `lifecycle_type`.

- [ ] **Step 1 — confirm live state:** `db query --linked` (one-line): assert enum `tool_status`/`tool_condition` values; fetch the live body of `rpc_assign_tool_unit_to_team(uuid,uuid,text)` and `get_team_tool_units_v2(uuid)` via `pg_get_functiondef` — you will rebase on these.
- [ ] **Step 2 — write the migration:** in one `BEGIN…COMMIT`:
  - `CREATE TYPE public.tool_lifecycle_type AS ENUM ('new','used','repaired');`
  - `ALTER TABLE public.tool_asset_units ADD COLUMN lifecycle_type public.tool_lifecycle_type NOT NULL DEFAULT 'new';`
  - **Backfill (staging test data only; new-prod has 0 units):** `UPDATE public.tool_asset_units u SET lifecycle_type='used' WHERE lifecycle_type='new' AND EXISTS (SELECT 1 FROM public.tool_unit_assignments a WHERE a.unit_id=u.id);`
  - **Rebase** `rpc_assign_tool_unit_to_team` from its live body — add, right after the `UPDATE public.tool_asset_units SET current_custody_location_id=…` block: `UPDATE public.tool_asset_units SET lifecycle_type='used' WHERE id=p_unit_id AND lifecycle_type='new';` (only advance from new; never touch used/repaired). Keep the `tools.assets.manage` gate + grants byte-identical.
  - **DROP + CREATE** `get_team_tool_units_v2(uuid)` and `get_assignable_tool_units(uuid,text)` from their live bodies, adding `lifecycle_type` to the returned columns (return-shape change requires DROP first — sweep `pg_proc` for a single overload first). Re-apply REVOKE/GRANT.
- [ ] **Step 3 — apply:** `npx supabase db push`.
- [ ] **Step 4 — probe (rolled back):** impersonate admin; pick a `new`, unassigned unit → `rpc_assign_tool_unit_to_team(unit, team)` → assert `lifecycle_type='used'`; count backfilled rows; `get_team_tool_units_v2(team)` returns `lifecycle_type`. `RAISE EXCEPTION 'probe: used=%, backfilled=%', …`.
- [ ] **Step 5 — mirror + commit:** copy the file into `migrations-staging/`; `feat(db): tool lifecycle_type New/Used/Repaired + auto-used on assign`.

---

## Task 2: Return destination

**Files:** Create `supabase/migrations/20260923000100_tool_return_destination.sql` (+ mirror).

**Produces:** `tool_unit_assignments.returned_to_location_id uuid NULL REFERENCES warehouse_sub_containers(id)`; `rpc_return_tool_unit(p_unit_id, p_notes, p_to_location_id)` stamps it, sets the unit's `current_custody_location_id` to that store + `status='available'`; `get_return_destinations(p_division_id)` read; `get_tool_unit_timeline` shows returned-to; `get_team_tool_units_v2` unchanged.

- [ ] **Step 1 — confirm live:** fetch live bodies of `rpc_return_tool_unit(uuid,text)` and `get_tool_unit_timeline(uuid)`. Confirm the custody model: is a "store" a `warehouse_sub_containers` row (non-team) or a warehouse? Decide the FK target from the live custody data (`SELECT id,name,warehouse_id,division_id FROM warehouse_sub_containers LIMIT 20;`). Confirm which sub-containers are "teams" vs "stores" (teams are the ones with tool assignments / consumption custody).
- [ ] **Step 2 — write the migration:**
  - `ALTER TABLE public.tool_unit_assignments ADD COLUMN returned_to_location_id uuid REFERENCES public.warehouse_sub_containers(id);`
  - **Rebase** `rpc_return_tool_unit` → new signature `(p_unit_id uuid, p_notes text DEFAULT NULL, p_to_location_id uuid DEFAULT NULL)`. On return: close the open ledger row setting `released_at=now(), release_reason='returned', returned_to_location_id=p_to_location_id, notes=COALESCE(p_notes,notes)`; set the unit `current_custody_location_id = p_to_location_id, status='available'`. Keep the `tools.assets.manage` gate. **Overload guard:** the old 2-arg version and the new 3-arg version differ by a defaulted param — Postgres treats defaulted params as one function, so `CREATE OR REPLACE` with the 3-arg signature replaces cleanly; verify there is exactly one `rpc_return_tool_unit` in `pg_proc` after.
  - Add `get_return_destinations(p_division_id uuid)` STABLE DEFINER → non-team stores in that division (or all, per Step-1 finding), returning `id, name` (human-readable). REVOKE public + grant authenticated/service_role.
  - **DROP+CREATE** `get_tool_unit_timeline` from its live body adding the returned-to location name to release rows.
- [ ] **Step 3 — apply:** `db push`.
- [ ] **Step 4 — probe (rolled back):** return a held unit to a store → assert ledger `returned_to_location_id` set + unit `current_custody_location_id=store, status='available'`; `get_return_destinations(div)` returns rows with names. `RAISE EXCEPTION`.
- [ ] **Step 5 — mirror + commit:** `feat(db): tool return destination (returned_to_location_id + rpc_return_tool_unit p_to_location_id)`.

---

## Task 3: Tool repair bridge (send-to-bucket · send-for-repair · return-from-repair)

**Files:** Create `supabase/migrations/20260923000200_tool_repair_bridge.sql` (+ mirror).

**Produces:**
- `warehouse_transfers.tool_unit_id uuid NULL REFERENCES tool_asset_units(id)`.
- `tool_unit_assignments.release_reason` CHECK extended to allow `'sent_for_repair'`.
- `rpc_send_tool_to_repair_bucket(p_unit_id, p_notes) RETURNS void` — collection-confirmed: close the open team assignment (`release_reason='sent_for_repair'`), clear `current_custody_location_id`, set `status='maintenance'`.
- `rpc_send_tool_for_repair(p_unit_id, p_repair_vendor_id, p_expected_return_date, p_notes) RETURNS uuid` — insert a `warehouse_transfers(transfer_kind='damaged_repair_out', status='in_transit', tool_unit_id, repair_vendor_id, from_warehouse_id, to_warehouse_id=vendor.virtual_warehouse_id, expected_return_date, division_id)`; **no** damaged-stock ledger writes. Returns the transfer id.
- `rpc_return_tool_from_repair(p_transfer_id, p_outcome, p_to_location_id, p_notes) RETURNS void` — `p_outcome ∈ {usable, writeoff}`. **usable:** unit `status='available', condition='Good', lifecycle_type='repaired', current_custody_location_id=p_to_location_id`; transfer `status='received', received_at=now()`. **writeoff:** unit retired + the existing scrap→P&L write-off (insert `write_off` `stock_adjustments` pending_approval + `PERFORM approve_stock_adjustment_inventory(id, actor)`, savepoint-guarded — mirror `rpc_resolve_tool_repair`'s scrap block from its live body); transfer `status='received'`.
- `get_repair_bucket` refined: only `status='maintenance'` units with **no** open `warehouse_transfers` repair-out row (awaiting-vendor); add `lifecycle_type`.
- Damaged-Stock overview read extended to **union in** tool repair transfers (`tool_unit_id IS NOT NULL`) showing item + serial.

- [ ] **Step 1 — fetch live bodies FIRST:** `pg_get_functiondef` for `rpc_resolve_tool_repair` (copy its scrap block verbatim as the writeoff basis), `get_repair_bucket`, `rpc_send_damaged_for_repair` (to copy the exact `warehouse_transfers` column set + vendor→`virtual_warehouse_id` lookup), and the Damaged-Stock overview read (find it: `grep -rn "damaged_repair_out" supabase/migrations` + `pg_get_functiondef` on the overview fn). Confirm `warehouse_transfers` columns + `repair_vendors.virtual_warehouse_id` live.
- [ ] **Step 2 — write the migration** (one txn): the column + CHECK extension (drop+add the named CHECK constraint), then the 3 RPCs + refined `get_repair_bucket` + extended overview read, all gated `tools.assets.manage`, REVOKE public + grant. Guard every join `tool_unit_id IS NULL` (bulk) vs `NOT NULL` (tool) so tool transfers never enter the bulk damaged path.
- [ ] **Step 3 — apply:** `db push`.
- [ ] **Step 4 — probes (rolled back, on staging test units):**
  - **collect:** an assigned unit → `rpc_send_tool_to_repair_bucket` → assignment closed `sent_for_repair`, unit `maintenance`, pointer NULL, appears in `get_repair_bucket`.
  - **send:** that unit → `rpc_send_tool_for_repair(u, vendor, date)` → a `damaged_repair_out` transfer with `tool_unit_id=u`; unit now **absent** from `get_repair_bucket`; present in the overview read as a tool row with its serial.
  - **return usable:** `rpc_return_tool_from_repair(t,'usable',store)` → unit `available`+`Good`+`repaired`+at store; transfer `received`.
  - **return writeoff:** `rpc_return_tool_from_repair(t,'writeoff')` → unit `retired`; exactly one `inventory_stock_movements` write-off booked (v_scrap) at the unit's FIFO cost; transfer `received`. (no-cost unit → retired at zero + NOTICE, no fail.)
  - Embed all assertions in one `RAISE EXCEPTION`.
- [ ] **Step 5 — mirror + commit:** `feat(db): serialized-tool repair bridge (send-to-bucket/vendor/return) over warehouse_transfers`.

---

## Task 4: Strip repair cost (shipped `rpc_return_damaged_from_repair`)

**Files:** Create `supabase/migrations/20260923000300_strip_repair_cost.sql` (+ mirror).

**Produces:** `rpc_return_damaged_from_repair` no longer amortizes `p_repair_cost` into returned good units' FIFO cost and no longer stamps `warehouse_transfers.repair_cost`. Good units return at their **original** unit cost. `p_repair_cost` param kept (accepted, ignored, default 0) for one release. Applies to **all** callers (sales-return damaged items too).

- [ ] **Step 1 — fetch the LIVE body** of `rpc_return_damaged_from_repair(...)` via `pg_get_functiondef` (staging now; new-prod at ship time — they may differ). Identify the exact lines that (a) compute `unit_cost = original_unit_cost + (p_repair_cost / p_qty_good)` and (b) set `warehouse_transfers.repair_cost`.
- [ ] **Step 2 — rebase:** `CREATE OR REPLACE` from the live body with ONLY those two spots changed — good-unit `unit_cost = original_unit_cost` (drop the repair-cost term), and stamp `repair_cost = 0` (or drop the assignment) on the transfer. Everything else (writeoff branch, division_id, movements, grants, `SET search_path`) byte-identical. Confirm a single overload.
- [ ] **Step 3 — apply:** `db push`.
- [ ] **Step 4 — probe (rolled back):** create/locate a `damaged_repair_out` in_transit transfer with a known original unit cost; call `rpc_return_damaged_from_repair(t,'good',qty,0, 999, notes)` with a non-zero `p_repair_cost=999` → assert the new `fifo_cost_layers` row's `unit_cost == original_unit_cost` (NOT +999) and the return transfer `repair_cost` is 0/unset. `RAISE EXCEPTION 'probe: layer_cost=%, expected=%', …`.
- [ ] **Step 5 — mirror + commit:** `feat(db): strip repair cost from return-from-repair (never charged; good units at original cost)`.

---

## Task 5: Monthly check sessions

**Files:** Create `supabase/migrations/20260923000400_tool_check_sessions.sql` (+ mirror).

**Produces:**
- `tool_check_sessions(id, division_id, initiated_by, initiated_at, status text CHECK IN ('in_progress','completed'), completed_at, notes)` — RLS on, `tcs_select` authenticated read, `tcs_write` gated `tools.assets.manage`.
- `tool_unit_inspections.session_id uuid NULL REFERENCES tool_check_sessions(id)`.
- `rpc_initiate_tool_check_session(p_division_id) RETURNS uuid` — one open (`in_progress`) session per division (guard: raise if one exists).
- `rpc_record_tool_inspection` extended with `p_session_id uuid DEFAULT NULL` (rebase live body; verdict `good/bad` maps condition Good/Fair as today; stamp `session_id`).
- `rpc_finalize_tool_check_session(p_session_id) RETURNS void` — set `completed`, `completed_at=now()`.
- `get_tool_check_session_progress(p_session_id)` → `{checked, total}` (total = units currently held by the division's teams; checked = distinct units with an inspection in this session).
- `get_open_tool_check_session(p_division_id)` → the open session or none.
- `get_tool_check_session_report(p_session_id)` → per checked unit: `item_name, serial_number, lifecycle_type, condition, inspected_at` + session `division_name, initiated_at`.

- [ ] **Step 1 — confirm live:** fetch `rpc_record_tool_inspection(uuid,text,text)` live body (rebase target); confirm `tool_unit_inspections` columns.
- [ ] **Step 2 — write the migration** (one txn): table + RLS + 2 policies + the `session_id` column + the 5 RPCs + rebased `rpc_record_tool_inspection`. Gate writes `tools.assets.manage`; reads DEFINER/STABLE; REVOKE public + grant.
- [ ] **Step 3 — apply:** `db push`.
- [ ] **Step 4 — probe (rolled back):** initiate for a division → session `in_progress`; a 2nd initiate raises; record a `good` check with `p_session_id` → inspection linked + condition Good; `get_..._progress` returns checked=1,total=N; finalize → `completed`; report returns the 1 checked row with lifecycle_type + condition + date. `RAISE EXCEPTION`.
- [ ] **Step 5 — mirror + commit:** `feat(db): tool monthly check sessions + progress + report RPC`.

---

## Task 6: Regenerate types + hooks

**Files:** Modify `src/types/database.types.ts`; extend `src/hooks/useToolRepair.ts`, `src/hooks/useToolInspections.ts`; create `src/hooks/useToolChecks.ts`, `src/hooks/useReturnDestinations.ts`.

**Interfaces produced (later tasks consume these):**
- `useReturnDestinations(divisionId)` → `{ id, name }[]`.
- `useSendToolToRepairBucket()` → mutate `{ unitId, notes? }`.
- `useSendToolForRepair()` → mutate `{ unitId, vendorId, expectedReturnDate, notes? }`.
- `useReturnToolFromRepair()` → mutate `{ transferId, outcome:'usable'|'writeoff', toLocationId?, notes? }`.
- `useReturnToolUnit()` (extend existing) → mutate now `{ unitId, toLocationId, notes? }`.
- `useInitiateCheckSession()`, `useRecordCheck()` (`{ unitId, verdict:'good'|'bad', sessionId }`), `useFinalizeCheckSession()`, `useOpenCheckSession(divisionId)`, `useCheckProgress(sessionId)`, `useCheckReport(sessionId)`.

- [ ] **Step 1:** regenerate types (`npx supabase gen types typescript --linked > src/types/database.types.ts`) then **re-append** the 4 `DBTable/DBInsert/DBUpdate/AllTables` aliases.
- [ ] **Step 2:** write the hooks mirroring the existing `useToolAssignments.ts`/`useToolInspections.ts` (createClient import, `toDbError`, React-Query keys). Add a `queryKeys.toolChecks` group. Every mutation invalidates the right namespaces (assignments + inspections + checks + the damaged-overview key for repair mutations).
- [ ] **Step 3:** `npx tsc --noEmit` + `npx eslint src/hooks/useTool*.ts src/hooks/useReturnDestinations.ts` — both clean.
- [ ] **Step 4 — commit:** `feat(hooks): tool repair-bridge, return-destination, and check-session hooks + regenerated types`.

---

## Task 7: Team tool view → tree + Return(destination) + Send-to-Repair(collection)

**Files:** Modify `TeamToolsDetail.tsx`; create `SendToRepairDialog.tsx`, `ReturnToolDialog.tsx`. **Invoke `impeccable` for this UI.**

**Consumes:** `useReturnDestinations`, `useSendToolToRepairBucket`, `useReturnToolUnit` (Task 6); `get_team_tool_units_v2` now returns `lifecycle_type` (Task 1).

- [ ] **Step 1 — tree view:** replace the flat `<table>` with a **category → item → unit** tree (mirror `AssignToolUnitDialog`'s `buildAssignTree` grouping). Each unit row shows: serial, **lifecycle type** badge (New/Used/Repaired), **condition**, and **when assigned** (`assigned_at`, human date). Fix the item-name wrap — `min-w-0` + `truncate` with a `title`. Remove the inline **Good/Bad** buttons (checks live on the check page now). Keep per-unit **Move**, **Return**, **Send to Repair** actions. Add a distinct **"In repair"** sub-section listing this team's units currently awaiting-vendor / out-for-repair (from a small read — reuse `get_repair_bucket` filtered client-side by originating team, or add a `team_id` filter arg; decide at build).
- [ ] **Step 2 — SendToRepairDialog:** confirm dialog — *"Have you collected this tool from the team?"* + optional notes → `useSendToolToRepairBucket`. On success toast + invalidate. Dialog standards (mobile full-screen, one scroll region, non-sticky footer).
- [ ] **Step 3 — ReturnToolDialog:** a Select of **return destinations** (`useReturnDestinations(team.divisionId)`, human-readable names, single-option pre-picked + disabled) + optional notes → `useReturnToolUnit({unitId, toLocationId, notes})`.
- [ ] **Step 4:** `tsc --noEmit` + `eslint` clean. **HOLD — hand to operator for staging smoke.** On "working": commit `feat(tools-assets): team tool tree view + return-destination + send-to-repair (collection confirm)`.

---

## Task 8: Repair bucket → Send-for-repair + Damaged-Stock shows tools + cost-free return

**Files:** Modify `RepairTab.tsx`, `ReturnFromRepairDialog.tsx`, the Damaged-Stock Out-for-Repair component; create `SendToolForRepairDialog.tsx`. **Invoke `impeccable`.**

**Consumes:** `useSendToolForRepair`, `useReturnToolFromRepair`, `useRepairVendors` (existing); refined `get_repair_bucket` (Task 3); overview read now unions tool rows (Task 3).

- [ ] **Step 1 — RepairTab (awaiting-vendor):** each bucket unit gets two actions — **Send for repair** → opens `SendToolForRepairDialog` (vendor Select from `useRepairVendors` — human-readable names; expected-return **calendar** DatePicker, not a text list; optional notes) → `useSendToolForRepair`; and a direct **Scrap** → confirm dialog → `useResolveRepair({unitId, outcome:'scrap'})` (the existing Phase-2 `rpc_resolve_tool_repair` scrap→P&L path) for an obviously-dead tool that shouldn't take a vendor round-trip. The Phase-2 **Repaired**-from-bucket button is removed (superseded by vendor return-usable).
- [ ] **Step 2 — Damaged-Stock Out-for-Repair:** the list now includes tool repair rows (serial shown; bulk rows keep `—`). For a **tool** row, **Return from Repair** routes to `useReturnToolFromRepair` (outcome usable/writeoff + destination store for usable); for a bulk row it keeps the existing `useReturnFromRepair`. Branch on the row's `tool_unit_id`.
- [ ] **Step 3 — ReturnFromRepairDialog:** **remove the Repair Cost input** entirely (both tool + bulk paths). Outcome + qty (bulk) / outcome + destination (tool). Never send a repair cost.
- [ ] **Step 4:** `tsc`/`eslint` clean. **HOLD for operator smoke.** On "working": commit `feat(tools-assets): repair-bucket vendor send + tools in Damaged-Stock out-for-repair + cost-free return`.

---

## Task 9: Monthly check page (session)

**Files:** Create `checks/ToolCheckPage.tsx`, `checks/ToolCheckTeamPanel.tsx`; modify `ToolsAssetsHub.tsx` (add a **Checks** tab or a nested route — read `node_modules/next/dist/docs/` before adding routing). **Invoke `impeccable`.**

**Consumes:** `useOpenCheckSession`, `useInitiateCheckSession`, `useRecordCheck`, `useFinalizeCheckSession`, `useCheckProgress` (Task 6).

- [ ] **Step 1 — page shell:** pick a **division** (default the active division); if an open session exists show it, else an **Initiate check** button → `useInitiateCheckSession`. Show a **progress** header ("X of Y tools checked", `min-h` stable) from `useCheckProgress`.
- [ ] **Step 2 — team cards:** list the division's teams as cards (mirror `TeamsTab` grouping); a card opens `ToolCheckTeamPanel` — the team's held units, each with **Good / Bad** controls → `useRecordCheck({unitId, verdict, sessionId})`. Checked units show a ✓ + their new condition (layout-stable rows).
- [ ] **Step 3 — finalize:** a **Finalize check** button → `useFinalizeCheckSession`; afterwards the page shows the completed session + the export menu (Task 10).
- [ ] **Step 4:** `tsc`/`eslint` clean. **HOLD for operator smoke.** On "working": commit `feat(tools-assets): monthly check-session page (initiate → team-by-team → finalize)`.

---

## Task 10: Check report — PDF + Excel (server-side)

**Files:** Modify `checks/ToolCheckPage.tsx` (export menu); reuse `/api/reports/excel` + `/api/reports/pdf`. Read `reference_report_excel_export` memory first (client exceljs 404s — export MUST be server-side).

**Consumes:** `useCheckReport(sessionId)` → rows `{ item_name, serial_number, lifecycle_type, condition, inspected_at }` (Task 5).

- [ ] **Step 1:** build the report payload (title = division + session date; columns **Item · Serial No · Type · Current Condition · Inspection Date**) and POST it to the existing server-side Excel + PDF routes (mirror `exportReportToExcel`'s payload shape). Add an export menu (Excel + PDF) on a completed session, with pending/toast feedback (mirror `ReportExportMenu`).
- [ ] **Step 2:** `tsc`/`eslint` clean. **HOLD for operator smoke** (download both formats; verify the 5 columns + only-checked rows). On "working": commit `feat(tools-assets): tool check report — server-side Excel + PDF`.

---

## Task 11: Lifecycle type — display + manual override

**Files:** Modify `ToolAssetEditDialog.tsx` (manual override), and any serialized-unit tables/badges that should show the type. **Invoke `impeccable`.**

**Consumes:** `tool_asset_units.lifecycle_type` (Task 1).

- [ ] **Step 1:** add a **New/Used/Repaired** Select to the serialized unit editor (human-readable labels; single-option pre-picked pattern; default from the loaded row via `.find()` — never a raw enum leak) writing `lifecycle_type`. Show the type as a badge on the serialized unit rows + the team tree (Task 7 already renders it from the read).
- [ ] **Step 2:** `tsc`/`eslint` clean. **HOLD for operator smoke.** On "working": commit `feat(tools-assets): lifecycle type badge + manual override on the unit editor`.

---

## Task 12: Docs — flow-registry, security audit, PROGRESS, EOD

**Files:** Modify `docs/flows-registry.md`, `PROGRESS.md`, `EOD/EOD-YYYY-MM-DD.md`.

- [ ] **Step 1 — flow-registry:** **rework** the two Phase-2 entries ([[Record Tool Inspection (condition check)]] → now the check-session flow; [[Resolve Tool Repair (Repaired / Scrap → P&L)]] → now the repair-bridge/return flow) and add **Send Tool to Repair (team → bucket → vendor)**, **Return Tool from Repair (usable/writeoff)**, **Tool Monthly Check Session** entries; cross-link [[Send Damaged for Repair]] / [[Return Damaged from Repair]] and add a note on those two that **repair cost is now stripped** (Task 4). Reference migrations `20260923000000`–`000400`.
- [ ] **Step 2 — security-audit row** in PROGRESS: new tables RLS (`tool_check_sessions`), DEFINER RPCs gated `tools.assets.manage` + revoke public, the cost-strip on a shipped RPC (money-path — probe-proven), error handling (`toDbError`, savepoint-guarded scrap), layout stability.
- [ ] **Step 3 — PROGRESS + EOD** per the mandatory protocols (Completed bullet + In Progress update; EOD numbered task).
- [ ] **Step 4 — commit (docs only, isolated):** `docs: Tools & Assets Phase 2 rework — flow-registry + security-audit + PROGRESS`.

---

## Task 13: Guarded ship (ASK FIRST — do not run unprompted)

- [ ] **Step 1 — operator staging smoke of the whole rework** (team tree + return-destination; send-to-repair → bucket → vendor → Damaged-Stock out-for-repair → return usable/writeoff; a costed writeoff raises the P&L Scrap line; a sales-return damaged item returns with **no** cost bump; check session → report PDF+Excel; New/Used/Repaired transitions). Wait for "working".
- [ ] **Step 2 — guarded new-prod apply (explicit go-ahead required):** for each of `20260923000000`–`000400`, **drift-check the live new-prod objects FIRST** (esp. `rpc_return_damaged_from_repair` + `rpc_assign_tool_unit_to_team` + `rpc_return_tool_unit` + `get_*` reads — fetch new-prod live bodies, confirm they match the staging base each migration rebased on), apply via `psql` + `NEW_DB_URL`, then post-apply verify + rolled-back probe (new-prod admin sub `ef36d9ca-…`). Grant `tools.assets.view`/`manage` to the new-prod role(s) if not already.
- [ ] **Step 3 — push (explicit go-ahead required):** one push = one Vercel prod build; hand prod smoke to the operator.

---

## Self-Review

**1. Spec coverage** (each design section → task):
- A. Repair lifecycle + Damaged-Stock integration → Tasks 3, 8 (+ 2 for the store destination). Cost strip → Task 4 + 8-Step-3. ✔
- B. Lifecycle type New/Used/Repaired → Task 1 (auto) + Task 11 (manual/display). ✔
- C. Monthly check session + PDF/Excel → Tasks 5, 9, 10. ✔
- D. Team tree view + return destination + word-wrap → Tasks 2, 7. ✔
- 5 migrations → Tasks 1–5 one-to-one. ✔
- Non-goals honored (no barcode, no cost reporting, no forced swap-back, bulk tools untouched). ✔

**2. Placeholder scan:** two deliberate build-time decisions are flagged inline, not left blank — the return-destination FK target (Task 2 Step 1 resolves it against live custody data) and the "In repair" team filter (Task 7 Step 1). Both have a concrete resolution path. No `TBD`/`TODO`/"add error handling".

**3. Type consistency:** hook names in Task 6's Interfaces block match their consumers in Tasks 7–11 (`useSendToolForRepair`, `useReturnToolFromRepair`, `useRecordCheck`, etc.). RPC names match `design.md`'s DB summary and the Task 1–5 Produces blocks (`rpc_send_tool_to_repair_bucket`, `rpc_send_tool_for_repair`, `rpc_return_tool_from_repair`, `rpc_initiate_tool_check_session`, `rpc_finalize_tool_check_session`, `get_tool_check_session_report`). `p_outcome` values are `usable`/`writeoff` everywhere.

**Risks restated:** Task 4 edits a shipped money-path RPC (highest blast radius — live-rebase + probe both DBs); Task 3's tool transfers must never enter the bulk damaged path (guard every join on `tool_unit_id`).
