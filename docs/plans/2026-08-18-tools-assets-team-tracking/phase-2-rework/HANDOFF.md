# HANDOFF — Tools & Assets Phase 2 REWORK (continue from here)

Continue the **Tools & Assets Phase 2 rework** in the MMS repo (`D:\MMS`), branch **`deploy/warehouse-shipping`**.

## READ FIRST (in order)
- `AGENTS.md` + memory index `C:\Users\IT\.claude\projects\D--MMS\memory\MEMORY.md` (feedback + reference files).
- `docs/plans/2026-08-18-tools-assets-team-tracking/phase-2-rework/design.md` (approved spec) and `plan.md` (13-task plan).
- The two Phase-2 flow-registry blocks in `docs/flows-registry.md`: search **"Send Tool for Repair"**, **"Return Tool from Repair"**, **"Tool Monthly Check Session"**, and the reworked **"Assign / Move / Return Tool Unit"** entry.

## CURRENT STATE (verify: `git -C /d/MMS log --oneline -16` + `git status`)
Branch `deploy/warehouse-shipping`, **44 commits ahead of origin, NOTHING pushed. NOTHING on new-prod.**

**DB — DONE on STAGING only, all rolled-back-probe-green + committed + mirrored** (`supabase/migrations/` + `migrations-staging/`). 8 migrations:
- `20260923000000` lifecycle_type New/Used/Repaired · `000100` return-destination store · `000200` serialized-tool **repair bridge** (bucket→vendor→return over `warehouse_transfers.tool_unit_id`) · `000300` **strip repair cost** from the shipped `rpc_return_damaged_from_repair` (good units at original cost) · `000400` **monthly check sessions** · `000500` **operator fix: tool in repair LEAVES the team** (close assignment `sent_for_repair` + clear custody; `get_assignable` excludes maintenance) · `000600` **operator fix: Used on RETURN not on assign** (+ re-backfill) · `000700` `rpc_set_tool_lifecycle_type` (manual override RPC).
- Types regenerated through `000700` + the 4 DBTable/DBInsert/DBUpdate/AllTables aliases re-appended.

**FRONTEND — code-complete, `tsc --noEmit` + `eslint` CLEAN, HELD UNCOMMITTED** (commit-only-when-operator-confirms). The held working-tree files (also listed by `git status`):
- **Modified:** `TeamToolsDetail.tsx` (item-grouped tree + **⋮ three-dot Set-type menu** + Return/Send-to-Repair; in-repair section removed), `RepairTab.tsx` (Awaiting-vendor Send-for-repair/Scrap + Out-for-repair Return), `ToolsAssetsHub.tsx` (Monthly Check tab), `ReturnFromRepairDialog.tsx` (Repair-Cost field removed), `ToolAssetEditDialog.tsx` (Type override), `useInventory.ts`, `useToolAssignments.ts` (return `toLocationId` + `useSetToolLifecycle`), `useToolInspections.ts`, `useToolRepair.ts` (bridge mutations + `useToolsOutForRepair`), `queryKeys.ts`, `types/database.types.ts`.
- **Deleted:** `InspectionVerdictButtons.tsx` (orphaned — inline checks moved to the check page).
- **New:** `ToolBadges.tsx`, `SendToRepairDialog.tsx`, `ReturnToolDialog.tsx`, `SendToolForRepairDialog.tsx`, `ReturnToolFromRepairDialog.tsx`, `checks/ToolCheckPage.tsx`, `checks/ToolCheckTeamPanel.tsx`, `checks/ToolCheckReport.tsx`.

**Docs — committed** (design, plan, flow-registry entries, security-audit row, PROGRESS, EOD-2026-08-18 + EOD-2026-08-19). **Task 12 done.**

## WHAT THE FEATURE DOES (all on staging)
Repair is a lifecycle: team tool → **Repair** on the row (collection confirm) → the tool **leaves the team** into the Repair bucket (awaiting vendor) → **Send for repair** (vendor + expected date) → shows in the Repair tab's **Out for repair** → **Return**: usable (→ a store you pick, type=Repaired) or writeoff (retire + **scrap→P&L**). **Repair is never charged** (stripped from the sales-return path too). **New/Used/Repaired**: New on create, **Used on return** (not on assign), Repaired after repair, + a **⋮ manual override** on the team row and in the unit editor. **Monthly Check**: a dated per-division session → team-by-team Good/Bad → finalize → **Excel/PDF report**. Returns record a **destination store**.

## NEXT STEPS (in order)
1. **Wait for the operator's staging re-smoke** of the held frontend. Key checks: a tool sent to repair **disappears from its team** + shows in the Repair tab; a freshly-created+assigned tool stays **New** and only flips **Used on return**; the **⋮ Set-type** menu on the team row works; **write off a costed tool → P&L "Scrap & Defective" rises**; Damaged Stock → Return-from-Repair has **no** Repair-Cost field; Monthly Check → report Excel/PDF. Grant `tools.assets.view`+`manage` (or Owner); one division selected for the check. Do NOT self-drive the browser.
2. **On "working": commit the held frontend** — ONE commit, co-author trailer:
   `feat(tools-assets): Phase 2 rework UI — repair lifecycle, monthly check page, lifecycle type + manual override`
   Stage ONLY the tools-assets rework files above (NOT `docs/inventory-reorg/reorg_apply.py`, NOT `skill-observations/`).
3. **Guarded new-prod apply (ASK FIRST)** of the 8 `20260923*` migrations via `psql` + `NEW_DB_URL` (from `supabase/.temp/migrate.env`, `psql` at `C:\Program Files\PostgreSQL\18\bin\psql.exe`). **Drift-check each live object FIRST** — especially `20260923000300` which **RE-BASES the shipped `rpc_return_damaged_from_repair`** (fetch new-prod's live body, confirm it matches the staging base before overwriting), and `000500`/`000600` which rebase `rpc_send_tool_*`/`rpc_assign_tool_unit_to_team`/`rpc_return_tool_unit`/`get_repair_bucket`/`get_assignable_tool_units`. Post-apply verify + rolled-back probe (new-prod admin sub `ef36d9ca-421d-4d6d-adcd-895ae2d733de`). new-prod has **0 tool units** so the re-backfills are no-ops there. Grant `tools.assets.view`/`manage` to the new-prod role(s) if not already.
4. **Push (ASK FIRST)** — one push = one Vercel prod build; hand prod smoke to the operator.
5. **Deferred → ISSUE-10:** "Show tools (N)" collapsible on `/warehouse/custody` team cards. Also optional follow-up: also surface tool out-for-repair rows on the **Damaged Stock page** (currently they live only in the Tools & Assets Repair tab — a deliberate low-risk choice; `useOutForRepair` inner-joins `warehouse_transfer_items` which tool transfers don't have).

## KEY GOTCHAS
- **`db query --linked`** (staging, token auth): one statement; the JSON serializer drops FROM-less scalar SELECTs (use row-returning); it surfaces only the final ERROR — **embed probe results in a terminal `RAISE EXCEPTION`** and run rolled-back. Inline multi-line dollar-quoted DO blocks get mangled — **write the SQL to a file and run `db query --linked -f <path>`** (Windows path with forward slashes). Fetch bodies: `SELECT pg_get_functiondef('public.fn(argtypes)'::regprocedure) AS def` piped to `node` reading stdin, slicing first `{`…last `}`.
- **Probe impersonation:** `PERFORM set_config('request.jwt.claim.sub', '<sub>'::text, true);` — staging admin sub `e9dc82d6-64eb-453c-b8f5-a5a4bbc91f00`. Use `_current_user_data_id()` for `requested_by`-type columns (the jwt sub is the auth id, NOT the `user_data.id`).
- **new-prod = `psql` only** (multi-statement migrations; `db query --file` hits `42601`). `NEW_DB_URL` in `supabase/.temp/migrate.env`.
- **Regenerate types:** `npx supabase gen types typescript --linked > src/types/database.types.ts` then re-append the 4 `DBTable/DBInsert/DBUpdate/AllTables` aliases (CLI wipes them).
- **Mirror every migration** into `supabase/migrations-staging/`. **Co-author trailer** (Mohamed Ismail + Claude Sonnet 4.6) via HEREDOC on every commit. **Commit only when the operator confirms working. ASK before new-prod and before pushing; one push per deploy.**
- 2 PRE-EXISTING failures in `src/lib/permissions.test.ts` (vestigial) — unrelated; do NOT fix.
- `cwd` persists across Bash calls — use absolute paths or `git -C /d/MMS`.

## FIRST ACTION
`git -C /d/MMS status` + `git log --oneline -16`, confirm the 8 staging migrations + the held frontend, then hand the operator the smoke checklist above and wait for "working" — or if already smoked, commit the held frontend (step 2) and proceed. Do NOT push or touch new-prod without explicit go-ahead.
