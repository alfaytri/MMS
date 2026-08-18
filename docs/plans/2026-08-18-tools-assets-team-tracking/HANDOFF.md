# Handoff prompt — Tools & Assets (paste to the next account)

Continue the **Tools & Assets** module in the MMS repo (D:\MMS), branch `deploy/warehouse-shipping`.

## READ FIRST (in order)
- `AGENTS.md` + memory index `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md`
- `docs/plans/2026-08-18-tools-assets-team-tracking/design.md` (module design, both phases)
- `docs/plans/2026-08-18-tools-assets-team-tracking/issues.md` (living log — ISSUE-1..10; 1/2/7 resolved, 10 deferred)
- `docs/plans/2026-08-18-tools-assets-team-tracking/phase-1/plan.md` + `phase-1/refinements-plan.md`
- `docs/plans/2026-08-18-tools-assets-team-tracking/phase-2/required-data.md` (live-DB data map) + `phase-2/plan.md` (7 tasks)

## CURRENT STATE (verify with `git -C /d/MMS log --oneline -26` + `git status`)
Branch `deploy/warehouse-shipping`, **26 commits ahead of origin, NOTHING pushed.**

**Phase 1 (Assign & Track + refinements) — DONE.** Operator-smoked on staging. DB **on new-prod** (`optishfnnctrhffpoywg`): 5 migrations `20260920000000`–`20260921000000` applied + verified. Frontend committed but **push HELD** (operator: "push after fully done"). new-prod has **0 tool_asset_units** (Assign tree empty there until tools are received).

**Phase 2 (Health & Disposal) — DB done on STAGING, UI built + HELD.**
- **Committed + probe-green on staging** (NOT on new-prod): `20260922000000` (tool_unit_inspections table), `20260922000100` (rpc_record_tool_inspection + rpc_resolve_tool_repair + get_repair_bucket + get_team_tool_units_v2), `20260922000200` (dedicated **tools.assets.manage** repoint of the 5 hub write-RPCs + 2 RLS write-policies). Commits `56045063`, `e3317b1c`, `23eeb232`. Hooks + regenerated types committed `819634cd`.
- **HELD in working tree (uncommitted) — awaiting operator "working" on the Phase-2 re-smoke:**
  - `src/components/warehouse/tools-assets/`: `TeamToolsDetail.tsx` (v2 read + verdict buttons + "Under repair" status badge + live-refresh fix), `ToolsAssetsHub.tsx` (Repair tab + `tools.assets.view` page guard), and new `InspectionVerdictButtons.tsx`, `RepairTab.tsx`, `ScrapToolDialog.tsx`
  - `src/hooks/useToolAssignments.ts` (invalidate both `toolAssignments`+`toolInspections` so assign/move/return refresh the v2 list)
  - `src/components/layout/nav-config.ts` (nav gate `inventory.catalog.view` → `tools.assets.view`)
  - `src/components/master-data/PermissionTree.tsx` (new `ops-tools-assets` catalog node: `tools.assets.view` + `tools.assets.manage`)
- **Task 7 (docs) NOT done:** flow-registry entries for Record Inspection + Resolve Repair/Scrap; update the two existing Tools & Assets flow-registry entries' guard note (`inventory.catalog.manage` → `tools.assets.manage`); security-audit row; PROGRESS + EOD.

## NEXT STEPS (in order)
1. **Wait for operator staging re-smoke** of Phase 2 UI + the dedicated permission. Do NOT self-drive the browser. Checklist: role editor shows Operations → Tools & Assets (View/Manage) → grant them (or use Owner/system-admin) → nav entry appears → assign updates live → Good/Bad/Repair (Repair → amber "Under repair" badge + shows in Repair tab) → Repair tab: Repaired returns to service; **Scrap a COSTED tool → P&L "Scrap & Defective" rises by its cost**. ⚠️ Tell them: the permission migration is already on staging, so a non-admin role must be granted `tools.assets.manage` or hub actions return "not authorized" (that's the gate, not a bug).
2. **On "working": commit the 8 held files** (co-author trailer; commit-only-when-working). Suggested: one `feat(tools-assets): Phase 2 UI` commit + one `feat(perms): dedicated tools.assets.* wiring` commit.
3. **Task 7 docs** (flow-registry + security-audit + PROGRESS + EOD), isolated docs commit.
4. **Guarded new-prod apply of the 3 Phase-2 migrations** (ASK FIRST). Drift-check new-prod live objects before each: `20260922000200` CREATE-OR-REPLACEs the Phase-1 assign/move/return RPCs — confirm new-prod's live bodies are the current `inventory.catalog.manage` versions before replacing. Apply via `psql` with `NEW_DB_URL` (multi-statement → psql, not `db query`). Post-apply verify (table+RLS, RPCs, gates = tools.assets.manage, no anon) + a rolled-back probe (impersonate new-prod admin `ef36d9ca-421d-4d6d-adcd-895ae2d733de`). **Then grant `tools.assets.view`+`tools.assets.manage` to the relevant new-prod role(s)** (Owner/system-admin bypasses).
5. **Push (ASK FIRST)** — one push of all ~26+ commits = ONE Vercel prod build; hand prod smoke to the operator. Then Phase-2 = shipped.
6. **Deferred:** ISSUE-10 (a "Show tools (N)" collapsible on `/warehouse/custody` team cards via `get_team_tool_units`) — separate change after this ships.

## KEY DECISIONS / GOTCHAS
- **Scrap→P&L mechanism (locked):** `rpc_resolve_tool_repair(..,'scrap')` closes the ledger row (`release_reason='scrapped'`) + retires the unit, then inserts a qty-1 `write_off` `stock_adjustments` row (status `pending_approval`) + `PERFORM public.approve_stock_adjustment_inventory(id, name)` → books the `inventory_stock_movements` row (`movement_type='adjustment'`, `reference_type='adjustment'`, FIFO `unit_cost`, `sub_container_id`) that `rpc_report_pnl` reads into `v_scrap`. Savepoint-guarded → no-cost/insufficient-stock units still retire at zero, never fail. **Do NOT use `apply_adjustment`** — it's the legacy `inventory_adjustments` path (movement_type `adjustment_out`), not the v_scrap feed.
- **Valuation (operator-decided):** cost from the unit's receival FIFO layer (`receival_item_id → receival_items(brand_variant_id, sub_container_id)` → `fifo_cost_layers`); no average-cost fallback, no manual entry; legacy no-layer units scrap at zero + note. Only 26/1326 staging units are costed; new-prod tools (all future) are costed via receival.
- **Permission model:** hub gated on `tools.assets.view` (nav + page guard) / `tools.assets.manage` (5 write RPCs + 2 RLS write policies). `_user_has_permission` bypasses for `is_system_admin`. `rpc_transfer_tool_unit` (Master-Data catalog transfer) stays on `inventory.catalog.manage` — it's not a hub action.
- **db query --linked (staging, token auth):** one-line SQL only; its JSON serializer DROPS columns for FROM-less scalar-subquery SELECTs → use row-returning queries; it surfaces only the final ERROR, so embed probe results in a terminal `RAISE EXCEPTION 'RESULTS ... %', ...` and end rolled-back probes that way. Fetch function bodies with `... "SELECT pg_get_functiondef('public.fn(args)'::regprocedure) AS def;" | node -e "<parse rows[0].def>"`.
- **new-prod:** `psql` (`C:\Program Files\PostgreSQL\18\bin\psql.exe`) with `NEW_DB_URL` from `supabase/.temp/migrate.env` (ready direct-host conn string). **Staging direct psql fails** — `STAGING_DB_PASSWORD` has URL-special chars; use `PGPASSWORD` env or just `db query --linked`.
- **cwd trap:** the Bash tool's cwd persists across calls; a stray `cd` breaks later relative paths → use absolute paths or `git -C /d/MMS`.
- **Regenerate types:** `npx supabase gen types typescript --linked > src/types/database.types.ts` then re-append the 4 `DBTable/DBInsert/DBUpdate/AllTables` aliases (CLI wipes them). Client is typed `<Database>`, so new RPC names must be regenerated in.
- **2 PRE-EXISTING test failures** in `src/lib/permissions.test.ts` (missing "Calendar" group + `ALL_PERMISSIONS≠PERMISSION_GROUPS`) — the vestigial `permissions.ts` catalog; unrelated to this work; **do NOT fix**.
- Mirror every migration into `supabase/migrations-staging/`. Co-author trailer on every commit (Mohamed Ismail + Claude). Commit only when the operator confirms working. **Ask before new-prod and before pushing; one push per deploy.**

## FIRST ACTION
`git -C /d/MMS status` + `git -C /d/MMS log --oneline -26`, then either (a) if the operator has already smoked Phase 2 → commit the held files + do Task 7; or (b) hand the operator the Phase-2 re-smoke checklist above and wait for "working". Do not push or touch new-prod without explicit go-ahead.
