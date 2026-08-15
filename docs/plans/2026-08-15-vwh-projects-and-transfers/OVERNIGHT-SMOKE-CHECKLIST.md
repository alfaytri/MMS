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
