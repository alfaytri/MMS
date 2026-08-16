# Virtual Warehouse Projects — Overnight Run Smoke Checklist

> Built autonomously overnight (2026-08-16) on branch `feature/vwh-projects` (off `deploy/warehouse-shipping`, **unpushed**). Everything below is **staging-only** (`mwvblpgbgxipvrevkeff`). Nothing is on new-prod. Each item was verified as far as it can be **without a human login** (tsc/eslint, migrations applied to staging, rolled-back DB probes, report data-tie checks); the **click-through UI steps here still need your eyes** — that's what this list is for.
>
> Log in on staging as **Owner** (it holds `warehouse.projects.view` + `.manage`, so the tab is visible — the page has no system-admin bypass, visibility is by explicit key).

---

## Phase 1 — Projects + disciplines (commits `cc552d85`, `31c4da65`, `4da002d2`)

**Where:** Master Data → Warehouses → **Projects** tab.

1. **Tab visible** — the Projects tab appears for Owner (and Accountant / Brand Manager / field_rp / inventory_manager / Purchase Manager). A role WITHOUT `warehouse.projects.view` should NOT see it.
2. **Create a project** — New Project → enter a number + name; Division defaults to the active division; the **Custody Warehouse** select lists only custody warehouses (single option is pre-selected + disabled); tick **2 disciplines** (e.g. Electrical + Automation); optionally pick a responsible person → **Create**. Expect success; the project appears in the list with **discipline count = 2** and **Total Value QR 0.00**.
3. **Two sub-containers created** — open the project (click the row): each discipline shows as a bucket named `"{number} · {discipline}"` with 0 items/qty/value. (Or confirm two new sub-containers on the custody warehouse.)
4. **Duplicate guard** — try creating another project with the **same number in the same division** → expect the inline error **"Project number already used in this division"** (not a generic failure).
5. **Add discipline** — in the detail, Add Discipline → the picker lists only disciplines **not already on the project**; add one → a new bucket appears. (If all disciplines are already added, the control shows a hint instead.)
6. **Close project (guarded)** — with all buckets empty, Close Project → confirm → project closes. (Later, once a discipline holds stock, Close should be **blocked** with **"Cannot close a project while its disciplines still hold stock"**.)
7. **Dropdown / layout checks** — every select shows **names, never UUIDs**; selecting a value doesn't shift surrounding rows; the create dialog footer stays put while the body scrolls.
8. **Permission-negative** — a role with `warehouse.projects.view` but NOT `.manage` should see the tab + list but have **no** New Project / Add Discipline / Close buttons.

**Verified autonomously (no login needed):** DB tables/RPCs/types (prior session, re-confirmed live); `create_project` / `add_project_discipline` / `close_project` signatures + `close_project`'s stock+permission guard read from the live catalog; tsc + eslint clean; 9/9 rollup unit tests; per-project value rollup sourced from `warehouse_sub_container_totals`; no unscoped `warehouse_stock_view` read on tab mount (conditional-mount verified); staging grant applied (Owner confirmed holds the keys).

---

## Phase 2 — Milestones + per-milestone spend (commits `2b1a60c0`, `df0d76f9`, `ae2575fd`, `48d57f8c`, `29e151b7`)

**Where:** the project detail dialog (Projects tab → click a project) and the consumption dialog.

1. **Add a milestone** — in a discipline bucket's MilestoneManager, type a label (e.g. "M1") → Add → it appears in the list. Adding the same label again → friendly "A milestone with that label already exists on this discipline".
2. **Close a milestone** — click the close (lock) icon → confirm → it leaves the active list (history kept). A **view-only** role (no `warehouse.projects.manage`) sees the list but **no** add field / close buttons.
3. **Consume WITH a milestone** — New Consumption → consumer type **custody** → pick a consumer sub-container that is a **discipline bucket with active milestones** → an optional **Milestone** select appears defaulting to **"No milestone"** → pick a milestone → post. Expect success; the consumption is tagged.
4. **Consume WITHOUT a milestone** — same flow but leave "No milestone" → posts fine (nothing tagged).
5. **No picker when N/A** — consume from a discipline bucket that has **no** milestones → no Milestone picker shown. Switch consumer type to **internal** → no Milestone picker. Switch the consumer sub-container after picking a milestone → the selection resets (no stale milestone).
6. *(Optional DB-cross-check, or just trust the report):* the tagged consumption's cost shows under its milestone in the Project Consumption report (Phase 4).

**Verified autonomously:** migrations applied + mirrored + object-verified (table/columns/RLS/index/RPCs, single 8-arg `rpc_post_consumption` overload, all EXECUTE revoked from PUBLIC); the money-path rewrite is byte-faithful to the live body (only the 4 intended edits) and a rolled-back JWT probe proved the milestone lands on the consumption header **and every** cogs layer row, wrong-bucket + internal+milestone both rejected, and a plain 7-arg consumption still works with milestone NULL. tsc/eslint/vitest clean; opus-reviewed (one anon-execute Critical found + fixed).

---

## Phase 3 — Cross-container transfers (commit `2456160d`; no migration needed)

**Where:** Master Data → Warehouses → Transfers → **New Transfer**.

1. **Custody warehouses are now selectable** as transfer source and destination (they were previously hidden).
2. **Discipline → discipline, same project** — source = a project's Electrical bucket, destination = that project's Automation bucket; pick sub-containers; add items; dispatch (as the source warehouse RP) → receive (as the destination warehouse RP). Stock lands in the destination bucket. (Same-warehouse two-bucket move: one RP may dispatch + receive.)
3. **Cross-project / cross-warehouse / cross-division** — move from one project's discipline to a different project's discipline (incl. a different division). After receive, the value is attributed to the destination sub-container's division automatically.
4. **Destination ≠ source** is enforced (can't pick the same bucket for both).

**Verified autonomously:** live introspection of `create_transfer_v2` / `dispatch_transfer` / `receive_transfer` — zero guards block custody→custody, cross-division, or same-warehouse-different-sub moves (only auto-pick guards, bypassed when a sub-container is passed explicitly, which the dialog does); the sub-container→sub-container path (both pickers, dest≠source guard, RPC args, `{project}·{discipline}` labels) was already fully wired. Change = make custody warehouses selectable. tsc/eslint clean.

---

## Phase 4 — Project consumption / spend report (commits `1b262ac2`, `24b422bd`)

**Where:** Reports → **Project Consumption** (`/reports/project-consumption`).

1. **Report renders** — pick a date range covering some consumption. Rows are grouped by **consumer** (team or project); each row shows **Discipline**, **Milestone** (or "Unassigned"), **Qty**, **Total Cost**. Per-consumer subtotals + a grand total.
2. **Filters** — date range + division multiselect drive the data.
3. **Export** — the Export ▾ menu produces Excel + PDF with the same grouping.
4. **Permission-negative** — a role without `reports.view` and without `consumption.cost.view` sees neither the nav link nor the page (Lock screen).
5. **Milestone breakdown** — a consumption you tagged with a milestone in Phase 2 shows its cost under that milestone label within its project→discipline consumer band.

**Verified autonomously:** report RPC applied + mirrored; tie-back proven — the report's joins reproduce the direct custody-consumption cogs sum (1829.34 over 10 rows) with no loss/duplication; RPC division-gating matches `is_division_visible`; EXECUTE revoked from PUBLIC; executes under both no-JWT and JWT. tsc/eslint clean.

**Note (design deviation, for your call):** the report uses **single-level grouping** (consumer band + discipline/milestone as columns) because the shared `ReportGroupedTable` has no multi-level nesting. The design's literal "project → discipline → milestone" 3-level nested table would need a new table component — left as an optional follow-up. The RPC returns rows sorted consumer→discipline→milestone so they read hierarchically within each band.

---

## What I could NOT verify (needs your login)
Everything above marked "Verified autonomously" was checked via tsc/eslint, migrations applied to staging, rolled-back DB probes, and report tie-backs. The **numbered click-through steps** (actual UI rendering, toast wording, layout, real multi-user dispatch/receive) need a human session and are what this checklist is for. Nothing was browser-tested.
