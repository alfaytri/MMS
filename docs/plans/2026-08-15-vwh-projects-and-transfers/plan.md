# Virtual Warehouse — Projects, Milestones, Transfers & Spend Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a project split into discipline buckets (Plumbing/Electrical/Automation) under one user-entered project number, track spend per milestone inside a discipline, move stock between any two virtual sub-containers, and report consumption cost by team/project → discipline → milestone.

**Architecture:** Every discipline stays an ordinary `warehouse_sub_containers` row, so all existing stock/receival/consumption/transfer/report machinery (keyed on `sub_container_id`) keeps working. A `projects` table + `disciplines` lookup group them; a `project_milestones` table + a nullable `milestone_id` on the consumption/cogs entries tag spend. Transfers reuse `create_transfer_v2` (already sub-container-aware). The report `SUM`s cost already booked in `cogs_entries`.

**Tech Stack:** Next.js 15 App Router + TS, TanStack Query v5, shadcn/Base-UI, Supabase Postgres (RLS, SECURITY DEFINER RPCs). Spec: [`design.md`](./design.md).

## Global Constraints
- **Migrations:** author from the **live** function body (`pg_get_functiondef`), apply to **staging** (`mwvblpgbgxipvrevkeff`) via `npx supabase db push`, **mirror** every file into `supabase/migrations-staging/`, verify, then commit. Prod (new-prod `optishfnnctrhffpoywg`) is applied only on the operator's ship go-ahead.
- **Every new table:** `ENABLE ROW LEVEL SECURITY` + ≥1 policy. Division scoping mirrors the existing custody sub-container visibility (`is_division_visible` / member helpers).
- **Money/stock paths** (`rpc_post_consumption`, transfers): prove with a rolled-back `DO`-block probe under set `request.jwt.claims` before commit (observation #10 — DEFINER RPCs read `auth.jwt()`).
- **Dropdowns** show names/labels, never UUIDs; single-option selects pre-select + disable; reserve height on dynamic rows (layout-stability rule).
- **Types:** after `supabase gen types … > database.types.ts`, re-append the DBTable/DBInsert/DBUpdate/AllTables helper aliases (the CLI wipes them).
- **Commits:** two-trailer co-authorship; never commit until the operator confirms the slice works.
- One division per project; project_number unique per division.

## File structure (created / modified)
- `supabase/migrations/` (+ `migrations-staging/` mirror) — 7 new migration files (see tasks).
- `src/types/database.types.ts` — regenerated + helper aliases.
- `src/hooks/useProjects.ts` (new), `src/hooks/useDisciplines.ts` (new), `src/hooks/useProjectMilestones.ts` (new).
- `src/hooks/reports/useProjectConsumptionReport.ts` (new).
- `src/components/warehouse/projects/` (new): `ProjectsTab.tsx`, `ProjectFormDialog.tsx`, `ProjectDetail.tsx`, `MilestoneManager.tsx`.
- `src/components/warehouse/custody/` — extend the custody warehouse page to host the Projects tab.
- `src/components/consumption/*ConsumptionDialog*.tsx` — add the Milestone picker.
- `src/components/purchase/wh/WhTransferDialog.tsx` — source + destination virtual sub-container pickers.
- `src/app/(dashboard)/reports/project-consumption/page.tsx` (new).
- `src/components/master-data/PermissionTree.tsx` — `warehouse.projects.*` keys; `supabase/seeds/seed_roles.sql` — grant to the manager roles.
- `docs/flows-registry.md` — new flow rows.

---

## Phase 1 — Projects + disciplines

### Task 1.1: `disciplines` lookup table
**Files:** Create `supabase/migrations/<ts>_disciplines_table.sql` (+ mirror).

- [ ] **Step 1: Write the migration**
```sql
CREATE TABLE public.disciplines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;
CREATE POLICY disciplines_read  ON public.disciplines FOR SELECT TO authenticated USING (true);
CREATE POLICY disciplines_write ON public.disciplines FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));
INSERT INTO public.disciplines (name, sort_order) VALUES
  ('Plumbing',1),('Electrical',2),('Automation',3);
NOTIFY pgrst, 'reload schema';
```
- [ ] **Step 2: Apply + verify** — `npx supabase db push`; then `db query --linked "select name from disciplines order by sort_order"` → expect the 3 seeds; confirm RLS on (`relrowsecurity=true`).
- [ ] **Step 3: Mirror** the file into `supabase/migrations-staging/` (byte-identical).
- [ ] **Step 4: Commit** `feat(db): disciplines lookup for project splitting`.

### Task 1.2: `projects` table
**Files:** Create `<ts>_projects_table.sql` (+ mirror).

- [ ] **Step 1: Migration**
```sql
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_number text NOT NULL,
  name text NOT NULL,
  division_id uuid NOT NULL REFERENCES public.company_divisions(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  responsible_person_profile_id uuid REFERENCES public.user_data(id),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_data(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (division_id, project_number)
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_read  ON public.projects FOR SELECT TO authenticated
  USING (public.is_division_visible(division_id));
CREATE POLICY projects_write ON public.projects FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));
NOTIFY pgrst, 'reload schema';
```
- [ ] **Step 2: Verify** columns + unique + RLS via `db query`. **Step 3: Mirror. Step 4: Commit** `feat(db): projects table`.

### Task 1.3: sub-container project/discipline FKs
**Files:** Create `<ts>_sub_container_project_discipline.sql` (+ mirror).

- [ ] **Step 1: Migration**
```sql
ALTER TABLE public.warehouse_sub_containers
  ADD COLUMN project_id    uuid REFERENCES public.projects(id)    ON DELETE RESTRICT,
  ADD COLUMN discipline_id uuid REFERENCES public.disciplines(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX warehouse_sub_containers_project_discipline_uq
  ON public.warehouse_sub_containers (project_id, discipline_id)
  WHERE project_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';
```
- [ ] **Step 2: Verify** both columns nullable + partial unique index exists; confirm legacy rows unaffected (`select count(*) from warehouse_sub_containers where project_id is not null` → 0). **Step 3: Mirror. Step 4: Commit.**

### Task 1.4: project RPCs (create / add discipline / close)
**Files:** Create `<ts>_project_rpcs.sql` (+ mirror).

**Interfaces — Produces:**
- `create_project(p_project_number text, p_name text, p_division_id uuid, p_warehouse_id uuid, p_discipline_ids uuid[], p_responsible_person_profile_id uuid) → uuid` (project id)
- `add_project_discipline(p_project_id uuid, p_discipline_id uuid) → uuid` (sub_container id)
- `close_project(p_project_id uuid) → void`

- [ ] **Step 1: Migration** — all `SECURITY DEFINER, search_path=public`. `create_project`: assert `warehouse_kind='custody'` for `p_warehouse_id` (else RAISE), assert caller `is_division_member(p_division_id)`, insert `projects`, then loop `p_discipline_ids` inserting one `warehouse_sub_containers` row each (`warehouse_id`, `division_id`, `project_id`, `discipline_id`, `name = project_number || ' · ' || discipline.name`, `is_active=true`, `created_by=_current_user_data_id()`). `add_project_discipline`: guard against duplicate (partial unique handles it) + insert one sub-container. `close_project`: `RAISE` if any discipline sub-container still has stock (reuse the existing sub-container stock-check helper/pattern), else set project + sub-containers `is_active=false`. Grant EXECUTE to authenticated.
- [ ] **Step 2: Signature check** — one overload each (`pg_get_function_identity_arguments`).
- [ ] **Step 3: Rolled-back probe** — `DO` block with owner JWT: `create_project('PRJ-TEST','T',<div>,<custody wh>, ARRAY[<electrical>,<automation>], null)` → assert 1 project + 2 sub-containers created with correct project_id/discipline_id/name; `RAISE EXCEPTION 'PROBE_OK'` to roll back. Also probe the non-custody-warehouse RAISE.
- [ ] **Step 4: Mirror. Step 5: Commit** `feat(db): project create/add-discipline/close RPCs`.

### Task 1.5: regenerate types
**Files:** Modify `src/types/database.types.ts`.
- [ ] **Step 1:** `npx supabase gen types typescript --linked > src/types/database.types.ts`; re-append the 4 helper aliases. **Step 2:** `npx tsc --noEmit` → 0 errors. **Step 3: Commit** `chore(types): regen for projects/disciplines`.

### Task 1.6: projects hooks + list UI
**Files:** Create `src/hooks/useProjects.ts`, `src/hooks/useDisciplines.ts`, `src/components/warehouse/projects/ProjectsTab.tsx`, `ProjectFormDialog.tsx`; modify the custody warehouse page to add a **Projects** tab (follow the existing `<Tabs>`/`TabsContent` pattern in `master-data/warehouses/page.tsx`).

**Interfaces — Consumes:** `create_project` RPC; `projects`/`disciplines`/`warehouse_sub_containers` reads. **Produces:** `useProjects(divisionIds)`, `useDisciplines()`, `useCreateProject()`.
- [ ] **Step 1:** `useDisciplines()` — `select * from disciplines where is_active order by sort_order`. `useProjects()` — projects + their discipline sub-containers (join) + a value rollup; division-filtered via `useActiveDivision().viewDivisionIds`.
- [ ] **Step 2:** `ProjectFormDialog` — number, name, division (default active), custody-warehouse select (filter `warehouse_kind='custody'`), discipline multi-select (checkboxes from `useDisciplines`), optional RP. Submit → `create_project`. Surface raw DB errors (unique-violation → "Project number already used in this division").
- [ ] **Step 3:** `ProjectsTab` — grouped list (number, name, division short-name, discipline count, total value) + "New Project". Dropdowns show names (UUID-guard).
- [ ] **Step 4:** `npx tsc --noEmit` + `eslint` clean.
- [ ] **Step 5: Commit** `feat(warehouse): projects tab + create dialog`. Operator smoke: create PRJ with 2 disciplines → 2 sub-containers appear.

### Task 1.7: project detail (disciplines + items)
**Files:** Create `src/components/warehouse/projects/ProjectDetail.tsx`; wire from `ProjectsTab`.
- [ ] **Step 1:** Render each discipline sub-container with qty/value (reuse the existing sub-container stock view/component). "Add discipline" → `add_project_discipline`; "Close project" → `close_project` (guarded).
- [ ] **Step 2:** tsc/eslint clean. **Step 3: Commit** `feat(warehouse): project detail`. Operator smoke.

### Task 1.8: permission key + role grants
**Files:** Modify `src/components/master-data/PermissionTree.tsx` (add `warehouse.projects.view` + `.manage` under the Warehouses group); modify `supabase/seeds/seed_roles.sql` (grant to Warehouse Manager, Inventory Manager) + re-apply seed to staging.
- [ ] **Step 1:** Add the two keys to `NAV_TREE`. **Step 2:** Gate `ProjectsTab`/actions with `useHasPermission('warehouse.projects.view'/'.manage')`. **Step 3:** Add the keys to the two manager roles in `seed_roles.sql`; re-run the seed (DO-block wrapper) on staging. **Step 4:** tsc + `validatePermissionSet` (view sibling present). **Step 5: Commit.**

---

## Phase 2 — Milestones + per-milestone spend

### Task 2.1: `project_milestones` table
**Files:** Create `<ts>_project_milestones.sql` (+ mirror).
- [ ] **Step 1: Migration**
```sql
CREATE TABLE public.project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_container_id uuid NOT NULL REFERENCES public.warehouse_sub_containers(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_data(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sub_container_id, label)
);
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pm_read ON public.project_milestones FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.warehouse_sub_containers sc
                 WHERE sc.id = sub_container_id AND public.is_division_visible(sc.division_id)));
CREATE POLICY pm_write ON public.project_milestones FOR ALL TO authenticated
  USING (public._auth_user_has_permission('warehouse.projects.manage'))
  WITH CHECK (public._auth_user_has_permission('warehouse.projects.manage'));
NOTIFY pgrst, 'reload schema';
```
- [ ] **Step 2: Verify + Mirror + Commit.**

### Task 2.2: milestone_id on consumption + cogs
**Files:** Create `<ts>_consumption_milestone_id.sql` (+ mirror).
- [ ] **Step 1: Migration**
```sql
ALTER TABLE public.consumption_entries
  ADD COLUMN milestone_id uuid REFERENCES public.project_milestones(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries
  ADD COLUMN milestone_id uuid REFERENCES public.project_milestones(id) ON DELETE SET NULL;
CREATE INDEX cogs_entries_milestone_idx ON public.cogs_entries (milestone_id) WHERE milestone_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';
```
- [ ] **Step 2: Verify + Mirror + Commit.**

### Task 2.3: milestone RPCs + `rpc_post_consumption` rewrite
**Files:** Create `<ts>_milestone_rpcs_and_post_consumption.sql` (+ mirror).

**Interfaces — Produces:** `add_project_milestone(p_sub_container_id uuid, p_label text) → uuid`, `close_project_milestone(p_milestone_id uuid) → void`, and `rpc_post_consumption(… existing args …, p_milestone_id uuid DEFAULT NULL)`.
- [ ] **Step 1: Fetch the LIVE body** of `rpc_post_consumption` (`pg_get_functiondef`) → scratchpad. Do not author from memory.
- [ ] **Step 2:** Add `p_milestone_id` param (default null). Validate (when not null) it belongs to the consumed discipline sub-container: `EXISTS (project_milestones pm WHERE pm.id=p_milestone_id AND pm.sub_container_id = <the discipline sub-container used in this consumption>)` else RAISE. Stamp `consumption_entries.milestone_id` on the header insert; **copy `p_milestone_id` onto each `cogs_entries` insert** (alongside the existing `consumer_sub_container_id`/`consumer_division_id`). Everything else byte-identical.
- [ ] **Step 3:** `add_project_milestone`/`close_project_milestone` (DEFINER, permission-gated). `close` deactivates (keep history for reports).
- [ ] **Step 4: Signature check** — exactly one `rpc_post_consumption` overload with the new arg (drop the old signature explicitly if arg count changed).
- [ ] **Step 5: Rolled-back probe** — owner JWT: create project+discipline+milestone, post a consumption from the discipline with `p_milestone_id`, assert `consumption_entries.milestone_id` set AND the produced `cogs_entries.milestone_id` = it; assert the wrong-sub-container milestone RAISEs; `RAISE 'PROBE_OK'`.
- [ ] **Step 6:** Stale-name sweep (`prosrc` for renamed tables). **Step 7: Mirror. Step 8: Commit** `feat(db): milestone tag on consumption + milestone RPCs`.

### Task 2.4: regen types (milestone columns).
- [ ] `gen types` + aliases + tsc. **Commit.**

### Task 2.5: milestone UI + consumption picker
**Files:** Create `src/hooks/useProjectMilestones.ts`, `src/components/warehouse/projects/MilestoneManager.tsx`; modify the consumption dialog (`src/components/consumption/*` — read the live component first) to add a **Milestone** select.
- [ ] **Step 1:** `useProjectMilestones(subContainerId)` + `useAddMilestone`/`useCloseMilestone`. `MilestoneManager` on the discipline detail (list + add + close).
- [ ] **Step 2:** In the consumption dialog, when the consumed discipline sub-container has active milestones, show an **optional** Milestone select (labels; pre-select+disable if one). Pass `p_milestone_id` to `rpc_post_consumption`.
- [ ] **Step 3:** tsc/eslint. **Step 4: Commit.** Operator smoke: post consumption with a milestone → appears tagged.

---

## Phase 3 — Cross-container transfers (Feature 2)

### Task 3.1: verify / relax transfer guards
**Files:** (migration only if a guard blocks the flow) `<ts>_transfer_cross_container.sql`.
- [ ] **Step 1:** Fetch live `create_transfer_v2`, `dispatch_transfer`, `receive_transfer`. Confirm: (a) `from_warehouse_id = to_warehouse_id` with differing sub-containers is allowed; (b) no `warehouse_kind`/division guard blocks custody→custody or cross-division; (c) RP authorization lets source RP dispatch + destination RP receive. **Step 2:** If a guard blocks, write the minimal relaxation migration + rolled-back probe (transfer between two custody sub-containers in different warehouses/divisions → dispatch → receive; assert stock + FIFO layer moved to the destination sub-container). If nothing blocks, note "no migration needed" and skip to 3.2. **Step 3 (if migration): Mirror + Commit.**

### Task 3.2: transfer dialog — virtual source + destination pickers
**Files:** Modify `src/components/purchase/wh/WhTransferDialog.tsx` (+ its create hook).
- [ ] **Step 1:** Read the live dialog. Add/enable: source = warehouse (virtual) → sub-container picker; destination = warehouse (virtual) → sub-container picker (destination ≠ source). Pass `p_from_sub_container_id` + `p_to_sub_container_id` to `create_transfer_v2`.
- [ ] **Step 2:** Guard: destination ≠ source; show project·discipline names in the sub-container pickers (UUID-guard). **Step 3:** tsc/eslint. **Step 4: Commit.** Operator smoke: move items from one project discipline to another (incl. cross-division) → dispatch → receive; stock lands in destination.

---

## Phase 4 — Consumption / spend report (Feature 3)

### Task 4.1: `rpc_report_project_consumption`
**Files:** Create `<ts>_rpc_report_project_consumption.sql` (+ mirror).

**Interfaces — Produces:** `rpc_report_project_consumption(p_from date, p_to date, p_division_ids uuid[]) RETURNS TABLE(consumer_kind text, consumer_id uuid, consumer_name text, project_number text, discipline_name text, milestone_label text, qty int, total_cost numeric)`.
- [ ] **Step 1: Migration** — `SECURITY DEFINER, STABLE`. From `cogs_entries` where `source_type='consumption'` and `date BETWEEN p_from AND p_to` and `is_division_visible(consumer_division_id)` and (`p_division_ids IS NULL OR consumer_division_id = ANY(p_division_ids)`); LEFT JOIN `warehouse_sub_containers sc` on `consumer_sub_container_id` → resolve `sc.project_id`→`projects`, `sc.discipline_id`→`disciplines`, `sc.team_id`→team name, `cogs.milestone_id`→`project_milestones`. Group by consumer (team or project) → discipline → milestone; `milestone_label` NULL → `'Unassigned'`. Return `SUM(qty)`, `SUM(total_cost)`.
- [ ] **Step 2: Verify** on real staging data (`SUM(total_cost)` ties to a direct `cogs` sum for `source_type='consumption'`). **Step 3: Mirror + Commit.**

### Task 4.2: report hook + page
**Files:** Create `src/hooks/reports/useProjectConsumptionReport.ts`, `src/app/(dashboard)/reports/project-consumption/page.tsx`; add a nav link.
- [ ] **Step 1:** Hook calls the RPC with `ReportFilters`. Page uses `ReportFilterBar` + `ReportGroupedTable` grouped project/team → discipline → milestone, with qty + cost columns + export (follow `reports/payables/page.tsx`). Gate on `reports.view`.
- [ ] **Step 2:** tsc/eslint. **Step 3: Commit.** Operator smoke: per-team consumption qty + cost visible; project rows drill into discipline → milestone.

---

## Phase 5 — Wrap-up
- [ ] Update `docs/flows-registry.md` (Create Project, Add/Close Discipline, Add/Close Milestone, Consumption-with-milestone, Virtual sub-container transfer, Project Consumption Report).
- [ ] Security-audit-log row (new tables have RLS; RPCs DEFINER + permission-gated; report read-only).
- [ ] `PROGRESS.md` + EOD per task.
- [ ] Operator smoke of the full flow → then ship (apply migrations to new-prod + push) on go-ahead.

## Self-review notes
- **Spec coverage:** disciplines (1.1), projects (1.2–1.4,1.6–1.7), one-division/unique (1.2), milestones as consumption tag (2.1–2.3,2.5), spend-per-milestone (2.3 cogs copy + 4.1), cross-container transfer (3.1–3.2), cross-division (3.1 probe), team+project+discipline+milestone report with qty+cost (4.1–4.2), legacy left as-is (1.3 nullable), permissions (1.8). All spec sections mapped.
- **Milestone belongs to the *consumed* discipline sub-container:** Task 2.3 resolves source-vs-consumer against the live `rpc_post_consumption` body — the validation binds to whichever sub-container the consumption actually draws the discipline stock from.
- **No new cost math:** spend = `SUM(cogs.total_cost)`; milestone is a copied dimension only.
