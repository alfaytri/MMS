# Virtual Warehouse Projects — Resume Handoff (state as of 2026-08-16)

> Self-contained brief to resume this feature in a fresh session. Authoritative
> spec + task list: [`design.md`](./design.md) + [`plan.md`](./plan.md). This file
> records **what is already built** (verified against the live staging DB
> `mwvblpgbgxipvrevkeff` on 2026-08-16) so you don't re-discover it.

## Phase shape (matches plan.md exactly)
| Phase | Scope | Tasks | Status |
|---|---|---|---|
| 1 | Projects + disciplines | 1.1–1.8 (8) | **DB + types DONE; UI + permission PENDING** |
| 2 | Milestones + per-milestone spend | 2.1–2.5 (5) | **NOT STARTED** |
| 3 | Cross-container transfers | 3.1–3.2 (2) | **NOT STARTED** (engine exists) |
| 4 | Consumption/spend report | 4.1–4.2 (2) | **NOT STARTED** |
| 5 | Wrap-up (registry, audit, docs, ship) | — | **NOT STARTED** |

Everything below is **staging-only**. Nothing for this feature is on new-prod.

## Phase 1 — detailed status
**DONE (migrations applied to staging + mirrored):**
- `20260824000700_disciplines_table.sql` — `disciplines` table (exists + RLS). Seeded `Plumbing/Electrical/Automation`.
- `20260824000800_projects_table.sql` — `projects` table (exists + RLS; `UNIQUE(division_id, project_number)`).
- `20260824000900_sub_container_project_discipline.sql` — `warehouse_sub_containers.project_id` + `.discipline_id` (both present, nullable; partial unique index on non-null `project_id`).
- `20260824001000_project_rpcs.sql` — 3 DEFINER RPCs, live signatures verified:
  - `create_project(p_project_number text, p_name text, p_division_id uuid, p_warehouse_id uuid, p_discipline_ids uuid[], p_responsible_person_profile_id uuid)` → project id
  - `add_project_discipline(p_project_id uuid, p_discipline_id uuid)` → sub_container id
  - `close_project(p_project_id uuid)` → void
- Task 1.5 types: `projects`/`disciplines` present in `src/types/database.types.ts`.

**PENDING:**
- **1.6** — `src/hooks/useProjects.ts` + `useDisciplines.ts`, `src/components/warehouse/projects/ProjectsTab.tsx` + `ProjectFormDialog.tsx`, Projects tab on the custody warehouse page. (No project hooks/components exist yet — grep-confirmed.)
- **1.7** — `ProjectDetail.tsx` (disciplines + items, add-discipline, close-project).
- **1.8** — `warehouse.projects.view`/`.manage` keys in `PermissionTree.tsx` (NAV_TREE) — **not present yet** (grep = 0); grant to Warehouse Manager + Inventory Manager in `supabase/seeds/seed_roles.sql` + re-seed staging.

> Note: the `disciplines`/`projects`/`project_milestones` RLS **write** policies gate on `warehouse.projects.manage`, which no role holds until 1.8. The 3 DEFINER RPCs bypass RLS, so create/add/close already work via RPC; only direct-table writes are locked until 1.8 seeds the permission.

## Phase 2 — nothing built (verified absent on staging)
- `project_milestones` table — **MISSING** (create per plan Task 2.1).
- `consumption_entries.milestone_id` — **absent**; `cogs_entries.milestone_id` — **absent** (Task 2.2).
- `rpc_post_consumption` — **exists, DEFINER, does NOT reference milestone yet**. Task 2.3 rewrites it (fetch the LIVE body via `pg_get_functiondef` first — do NOT author from memory) to add `p_milestone_id uuid DEFAULT NULL`, validate it belongs to the consumed discipline sub-container, stamp `consumption_entries.milestone_id`, and **copy it onto each `cogs_entries` insert**.
- Milestone RPCs `add_project_milestone`/`close_project_milestone` — not created.

## Phase 3 — engine exists, UI not wired
- `create_transfer_v2` — **exists, DEFINER**. Task 3.1 = fetch live body of `create_transfer_v2`/`dispatch_transfer`/`receive_transfer` and confirm no guard blocks custody→custody / cross-division / same-warehouse-different-sub-container; write a relaxation migration only if a guard blocks (else "no migration needed").
- Existing transfer hook lives in `src/hooks/useWarehouseOperations.ts`; dialog to extend = `src/components/purchase/wh/WhTransferDialog.tsx` (Task 3.2: source + destination virtual sub-container pickers, pass `p_from_sub_container_id` + `p_to_sub_container_id`).

## Phase 4 — nothing built
- `rpc_report_project_consumption(p_from date, p_to date, p_division_ids uuid[])` — **MISSING** (Task 4.1). Sums `cogs_entries.total_cost` where `source_type='consumption'`, grouped consumer(team|project)→discipline→milestone; `milestone_label` NULL → `'Unassigned'`. **No new cost math** — milestone is a copied dimension.
- Report page `src/app/(dashboard)/reports/project-consumption/page.tsx` (Task 4.2) — follow `reports/payables/page.tsx` (`ReportFilterBar` + `ReportGroupedTable`), gate on `reports.view`.

## Locked decisions / gotchas
- **One division per project**; `project_number` unique per division.
- Each discipline is an ordinary `warehouse_sub_containers` row → all existing stock/receival/consumption/transfer/report machinery keeps working unchanged. Legacy sub-containers keep `project_id/discipline_id = NULL`.
- Milestone belongs to the **consumed** discipline sub-container (validate against whichever sub-container the consumption draws from — resolve against the live `rpc_post_consumption` body).
- Spend = `SUM(cogs.total_cost)`; milestone is a copied tag, not new math.
- Custody-warehouse assertion: `create_project` requires the target warehouse be `warehouse_kind='custody'`.

## Environment + workflow (unchanged)
- **Staging (linked, migration target):** `mwvblpgbgxipvrevkeff`. New-prod: `optishfnnctrhffpoywg` (creds in gitignored `supabase/.temp/migrate.env` as `NEW_DB_URL`) — apply only on operator ship go-ahead.
- **Migration workflow:** author from the live body → create `supabase/migrations/<ts>_*.sql` → `npx supabase db push` (staging) → **mirror byte-identical into `supabase/migrations-staging/`** → verify → commit (two-trailer co-authorship; don't commit until the operator confirms the slice works).
- **`npx supabase db query --linked "<sql>"`** works for single statements (multi-statement fails `42601`). For multi-statement files use **`psql`** at `C:\Program Files\PostgreSQL\18\bin\psql.exe` (`psql "$NEW_DB_URL" -f file.sql`; staging URL = same host/creds with ref `mwvblpgbgxipvrevkeff`, password in `migrate.env` `STAGING_DB_PASSWORD`).
- **DEFINER RPCs read `auth.jwt()`** — prove money/stock paths with a rolled-back `DO` block under `set_config('request.jwt.claims', …)` (see the tau-probe pattern used for the tool_asset_units fix).
- After `gen types`, re-append the 4 `DBTable`/`DBInsert`/`DBUpdate`/`AllTables` helper aliases (CLI wipes them).
- Recommended execution: `superpowers:subagent-driven-development` (fresh subagent per task + review between), per plan.md header.

## Immediate next step
**Task 1.6** — build `useProjects`/`useDisciplines` hooks + the Projects tab + `ProjectFormDialog` on the custody warehouse page (`src/app/(dashboard)/master-data/warehouses/page.tsx` hosts the tabs). All DB dependencies (tables, RPCs, types) are already in place on staging.
