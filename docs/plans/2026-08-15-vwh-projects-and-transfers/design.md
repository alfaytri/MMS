# Virtual Warehouse — Projects (Disciplines + Milestones), Cross-Container Transfers, Spend Report

**Date:** 2026-08-15
**Status:** Design — approved in brainstorming, pending spec review → implementation plan.

Three related features on the virtual-warehouse (custody) module:

1. **Projects → disciplines → milestones** — a project (a shared, user-entered project number) splits into **discipline** buckets (Plumbing, Electrical, Automation, …), each holding its own set of items; inside a discipline, **milestones** (user-labelled — number or text+number) let you **track spend per milestone**.
2. **Cross-container sub-container transfers** — move items from any virtual-warehouse sub-container to any *other* virtual sub-container (a different project / discipline / warehouse) through the existing transfer flow.
3. **Project consumption / spend report** — actual consumption cost broken down by **team/project → discipline → milestone (sub-discipline)**.

---

## Current model (verified against the live DB)

- **Warehouses** carry `warehouse_kind` ∈ `custody | general | repair` (+ `is_virtual`). Custody + repair are the virtual ones. Warehouses have **no** `division_id`.
- **A "project" today = one `warehouse_sub_containers` row** under a custody warehouse (`id, warehouse_id, division_id, name, is_active, team_id, responsible_person_profile_id, created_by`). **No project number, no grouping** of several sub-containers into one project.
- **Transfers already model sub-container → sub-container.** `warehouse_transfers` has `from_sub_container_id` + `to_sub_container_id`; `warehouse_transfer_items` has `sub_container_id`. `create_transfer_v2(…, p_from_sub_container_id, p_to_sub_container_id)` already accepts both ends; `dispatch_transfer` / `receive_transfer` move stock + FIFO cost by `sub_container_id`. Only auto-pick guards exist — no block on custody→custody or cross-warehouse.
- **Consumption cost** is booked in `cogs_entries` (`source_type='consumption'`, `consumption_id`, `consumer_sub_container_id`, `consumer_division_id`, `qty`, `total_cost`), posted by `rpc_post_consumption`; the header is `consumption_entries` (`source_sub_container_id`, `consumer_sub_container_id`, `division_id`, …). So spend is already attributable per sub-container; a milestone is just one more dimension on that.

**Implication:** Feature 1 is real schema + UI work; Feature 2 is mostly UI exposure + verification; Feature 3 reuses cost already booked.

---

## Decisions (locked in brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Disciplines | **Fixed, shared, admin-managed list** (Plumbing, Electrical, Automation, …) |
| 2 | Project number | **User-entered** (unique per division) |
| 3 | Division scope | **One division per project**; disciplines + milestones inherit it |
| 4 | Cross-container move flow | **Reuse the existing Transfers flow** (dispatch → receive + RP rules) |
| 5 | Existing custody sub-containers | **Left as-is** — only *new* projects use the discipline/milestone structure (new FK columns stay NULL on legacy rows) |
| 6 | Cross-division transfers (Feature 2) | **Allowed**, through the normal transfer flow |
| 7 | Milestones | **A cost tag on consumption** — discipline holds the stock; consumption is tagged with a milestone; spend-per-milestone = tagged consumption cost. No pre-allocating stock per milestone |
| 8 | Budgets / financials | **Actual spend report only** — no planned budgets / variance in this scope |

---

## Feature 1 — Projects → disciplines → milestones

### Data model (Approach A — projects table + discipline sub-containers)

Chosen over "just add columns to sub_containers" so every discipline stays an ordinary `warehouse_sub_container` and **all existing machinery (stock, movements, receivals, consumption, transfers, reports — all keyed on `sub_container_id`) keeps working unchanged**. Project + milestone are grouping/tagging on top.

**New table `disciplines`** (managed lookup): `id`, `name text unique`, `sort_order int`, `is_active bool`, `created_at`. Seed: Plumbing, Electrical, Automation. RLS: read for authenticated; write behind the manage permission.

**New table `projects`**: `id`, `project_number text`, `name text`, `division_id → company_divisions`, `warehouse_id → warehouses` (must be custody — enforced in the create RPC), `is_active bool`, `responsible_person_profile_id → user_data` (null), `created_by`, `created_at/updated_at`. **Unique `(division_id, project_number)`.** RLS: division-visible (mirror custody helpers); write behind the manage permission.

**`warehouse_sub_containers` — two new nullable columns:** `project_id → projects` and `discipline_id → disciplines`; **partial unique** `(project_id, discipline_id) where project_id is not null` (one sub-container per discipline per project). A **discipline bucket = a `warehouse_sub_containers` row** with both set, `division_id` = the project's, `name` composed `"{project_number} · {discipline_name}"` (display resolves from FKs — UUID-guard respected). Legacy rows keep both NULL (Decision 5).

### Milestones (sub-disciplines) + spend tracking

**New table `project_milestones`**: `id`, `sub_container_id → warehouse_sub_containers` (the **discipline bucket** it belongs to), `label text` (user-entered — number or text+number, e.g. `"M1"`, `"Phase 2 - 200"`), `sort_order int`, `is_active bool`, `created_by`, `created_at/updated_at`. **Unique `(sub_container_id, label)`.** RLS: division-visible via the parent sub-container; write behind the manage permission.

**Consumption gains a milestone dimension (the cost tag), mirroring the existing denormalization pattern:**
- `consumption_entries` += `milestone_id uuid null → project_milestones(id)` (the operator's choice at posting — source of truth).
- `cogs_entries` += `milestone_id uuid null` (copied from the consumption header when `rpc_post_consumption` writes the cost lines — same way `consumer_sub_container_id` / `consumer_division_id` are already copied there — so the spend report is a plain `SUM`, no join gymnastics).
- **`rpc_post_consumption`** += `p_milestone_id` param: validate it belongs to the consumed discipline sub-container, stamp the header, copy onto each cogs line. **Nullable** — consuming with no milestone stays valid (teams, or disciplines without milestones → "Unassigned" in reports).

**Spend per milestone** = `SUM(cogs_entries.total_cost) where source_type='consumption' and milestone_id = X`. No new cost math — reuses cost already booked per consumption.

### RPCs (SECURITY DEFINER, division-guarded)
- **`create_project(p_project_number, p_name, p_division_id, p_warehouse_id, p_discipline_ids uuid[], p_responsible_person_profile_id)`** — validate custody warehouse + number unique in division; insert `projects`; insert one discipline sub-container per discipline (division inherited, name composed).
- **`add_project_discipline(p_project_id, p_discipline_id)`** — add a discipline (new sub-container) to a project.
- **`add_project_milestone(p_sub_container_id, p_label)`** / **`close_project_milestone(p_milestone_id)`** — manage milestones under a discipline (close only when no cost is tagged, or just deactivate for tagging while keeping history).
- **`close_project(p_project_id)`** — deactivate the project + archive its discipline sub-containers **only if empty** (mirror the existing sub-container archive guard).

### UI
- **Projects** surface on the custody warehouse (a "Projects" tab/page): list (number, name, division, discipline count, total value) + **New Project** (number, name, division, custody warehouse, tick disciplines).
- **Project detail**: each discipline (sub-container) with its items/qty/value and its **milestones** (add / rename / close). Drill into a discipline reuses the existing sub-container stock view.
- **Consumption dialog**: when the consumed discipline sub-container has milestones, show a **Milestone** picker (labels; optional).
- Discipline/milestone pickers show **names/labels** (UUID-guard); single-option selects pre-select + disable (layout-stability rule).

### Permissions
- Read via custody visibility (`custody.view` + per-warehouse grants).
- Manage projects / disciplines / milestones: **`warehouse.projects.manage`** (new `NAV_TREE` key), granted to Warehouse Manager + Inventory Manager + admins in the new role catalogue. *(Exact key naming finalized in the plan.)*

### Migration
- Legacy custody sub-containers untouched (Decision 5). New columns nullable; no backfill.

---

## Feature 2 — Move items between virtual sub-containers

**Already supported at the data layer** (`create_transfer_v2` takes both from/to sub-containers; dispatch/receive move stock + FIFO cost by `sub_container_id`; no hard block on custody→custody or cross-warehouse).

**Change (flow enablement, ~no schema):**
- **UI:** in the transfer dialog, allow **source** = any virtual sub-container and **destination** = any *other* virtual sub-container — across warehouses/projects/disciplines (two cascading pickers; destination ≠ source).
- **Flow:** existing lifecycle — request → **dispatch** (source RP) → **receive** (destination RP) + shortfall/shrinkage disposition. So Electrical (PRJ-014) → Automation (PRJ-014), or to another project's discipline.
- **Cross-division (Decision 6):** allowed. Because reports attribute by the sub-container's division, receiving into a different-division sub-container **moves the value to that division automatically** (existing stock-movement + FIFO machinery carries it) — no report change.
- **Guards to verify in the plan:** confirm `create_transfer_v2` allows `from_warehouse_id = to_warehouse_id` with differing sub-containers (intra-warehouse discipline→discipline) and that RP authorization spans source-dispatch + destination-receive across virtual warehouses. Relax only what blocks the above.

---

## Feature 3 — Project consumption / spend report

- **New report `rpc_report_project_consumption(p_from date, p_to date, p_division_ids uuid[])`** (SECURITY DEFINER, `is_division_visible`-scoped) returning consumption cost from `cogs_entries` (`source_type='consumption'`) grouped hierarchically: **consumer (team or project) → discipline → milestone (sub-discipline)**, with qty + total cost.
  - **Team** consumers (legacy custody, no discipline/milestone) roll up at the team level.
  - **Project** consumers roll up project → discipline → milestone; consumption with no `milestone_id` shows under **"Unassigned"**.
  - Resolution: `cogs.consumer_sub_container_id` → `warehouse_sub_containers` (→ `project_id`/`discipline_id`/`team_id`) → `projects` / `disciplines`; `cogs.milestone_id` → `project_milestones`.
- **UI:** a report page reusing `ReportFilterBar` + `ReportGroupedTable` (grouped by project → discipline → milestone) with export. Gated by the existing reports permission (`reports.view` / `consumption.cost.view`).
- Reuses cost already booked — **no new cost writes**.

---

## Out of scope (YAGNI)
- **Planned budgets / budget-vs-actual** (Decision 8 — actual spend only; planned budgets can come later).
- Contract linkage to projects.
- Discipline/milestone-level approval chains (transfers + consumption use existing flows).
- Nesting beyond project → discipline → milestone.
- Auto project numbers (user-entered per Decision 2).
- Touching legacy custody sub-containers.

## Migrations
**Feature 1:**
1. `disciplines` table + seed + RLS.
2. `projects` table + unique `(division_id, project_number)` + RLS.
3. `warehouse_sub_containers` add `project_id` + `discipline_id` + partial unique index.
4. `project_milestones` table + unique `(sub_container_id, label)` + RLS.
5. `consumption_entries` add `milestone_id`; `cogs_entries` add `milestone_id`.
6. `create_project` / `add_project_discipline` / `add_project_milestone` / `close_project_milestone` / `close_project` RPCs; **rewrite `rpc_post_consumption`** to accept + record `milestone_id` (sourced live via `pg_get_functiondef`).
7. Project value rollup view/RPC.
8. `NAV_TREE` + role grants for `warehouse.projects.*`.

**Feature 3:** `rpc_report_project_consumption`.

**Feature 2:** expected **no migration** (UI + verification); a small guard relaxation only if the plan finds one blocking the flow.

Every new table gets RLS + ≥1 policy (security checklist). All migrations mirrored to `supabase/migrations-staging/`. `rpc_post_consumption` is a money/stock path — verify with a rolled-back probe (per project SQL rules).

## Flow registry
Add: **Create Project (+ disciplines)**, **Add/Close Discipline**, **Add/Close Milestone**, **Post Consumption with milestone tag** (extends the existing consumption flow), **Sub-container → Sub-container Transfer (virtual)**, **Project Consumption Report** — cross-linked to the existing custody / consumption / transfer flows.
