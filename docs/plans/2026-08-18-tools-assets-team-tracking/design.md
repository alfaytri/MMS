# Tools & Assets — Team Assignment & Lifecycle Tracking (Design)

**Date:** 2026-08-18
**Status:** Design approved (brainstorming complete) — ready for the Phase 1 implementation plan.
**Authors:** Mohamed Ismail + Claude
**Hub location:** Top-nav **Operations** menu → new **Tools & Assets** entry (alongside Custody, Consumption, Damaged Stock).
**Builds on (do NOT rebuild):** Bulk Tools P2a/P2b (serialized `tool_asset_units`), the unified Custody & Consumption model (teams = custody locations), and the existing P&L write-off line.

> This is the module-level design covering **both phases**. The task-by-task plans live in `phase-1/plan.md` and (later) `phase-2/plan.md`. The codebase/data map needed to execute lives in `required-data.md`.

---

## 1. Goal

A **team-centric operational hub** to manage the full life of serialized tools & assets:

- Assign a serialized tool/asset to a **team**, tracked by **serial number**, with its **condition**.
- **Move** an item to another team; **give a team a new item**.
- Run **on-demand condition checks** ("monthly check"): teams as cards → open a team → its item list → mark each **Good / Bad / Under-repair**.
- Collect **Under-repair** items in a **Repair** bucket → resolve each **Repaired** or **Scrap**.
- **Scrap** posts the item's cost to the **P&L "Scrap & Defective"** line.
- Track **how many days** each item was held by each team, with a dedicated **History & Usage** page: search by **serial number** or **current team** → **item detail** showing first-assigned date, every team that held it in between, and how long each.

---

## 2. User requirements (as given, verbatim intent)

1. A page to assign teams the tools/assets and track by serial number — "this team has this item and the condition of it too."
2. Reuse the teams created in the consumption page.
3. Move an item to another team; give a team a new item.
4. Monthly check: teams as cards → click a team → list of their assigned items → click item **Good / Bad / Under-repair**.
5. If under repair → a **Repair** card where it collects → change condition to **Repaired**, or **Scrap** it if unrepairable.
6. Scrap adds to the **Scrap** line in the P&L reports.
7. Track **days used by a team**; a dedicated page to search by **serial number** or **current team** → item detail page: first-assigning date, which teams held it in between, and how long each.

---

## 3. Confirmed decisions

| Decision | Choice | Consequence |
|---|---|---|
| **Monthly check** | On-demand, timestamped | Each check is dated history; each team shows "last checked / due this month." No cron/scheduled cycle. |
| **Scrap value → P&L** | Purchase cost from the unit's **receival FIFO layer** | Reuse the existing approved-write-off → movement → P&L path. No new P&L code. |
| **Holder model** | **Team only** | The team's existing responsible person is shown for contact. No per-unit person is stored. |
| **Build order** | **Two phases** (§9) | Phase 1 ships assign+track+history on its own; Phase 2 adds checks+repair+scrap. |
| **"Bad" verdict** | **Reuse `condition='Fair'`** | NO enum change. UI button may read "Bad / Needs attention" but persists `Fair`. |
| **Hub location** | Under **Operations** nav | New route + nav entry; the Master-Data → Inventory → "Tools & Assets" catalog tab stays as-is (it manages the units; this hub operates them). |
| **Division ownership** | Tools are **division-owned**; assign/move is **same-division only** | Team picker is scoped to the unit's `division_id`. Cross-division is the rare, separate **Transfer** action (existing `rpc_transfer_tool_unit`). |

---

## 4. Data model

### 4.1 New table — `tool_unit_assignments` (the custody ledger) — **the backbone**

One row per "this unit was held by this team from X to Y." This single table answers current-holder, move-history, first-assigned, per-team usage-days, and the timeline.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid NOT NULL | FK → `tool_asset_units(id)` ON DELETE CASCADE |
| `custody_location_id` | uuid NOT NULL | FK → `warehouse_sub_containers(id)` — the **team** |
| `assigned_at` | timestamptz NOT NULL default now() | |
| `released_at` | timestamptz NULL | **NULL = currently held.** Set when moved away, returned, or scrapped |
| `release_reason` | text NULL | CHECK ∈ `moved` / `returned` / `scrapped` (NULL while open) |
| `assigned_by` | uuid NULL | actor (`user_data.id`) |
| `notes` | text NULL | |
| `created_at` | timestamptz default now() | |

**Invariant:** at most one open row per `unit_id`. Enforce with a partial unique index:
`CREATE UNIQUE INDEX uq_open_assignment ON tool_unit_assignments(unit_id) WHERE released_at IS NULL;`
Plus indexes on `unit_id`, `custody_location_id`.

**Derivations (no extra tables needed):**
- **Current team** = the open row for the unit.
- **Move to another team** = in ONE transaction: `UPDATE … SET released_at=now(), release_reason='moved' WHERE unit_id=? AND released_at IS NULL;` then `INSERT` a new open row for the new team.
- **Usage-days per team** = `SUM(COALESCE(released_at, now()) − assigned_at)` grouped by `custody_location_id`.
- **Item timeline** = all rows for the unit ordered by `assigned_at`.

### 4.2 New table — `tool_unit_inspections` (monthly-check history) — **Phase 2**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `unit_id` | uuid NOT NULL | FK → `tool_asset_units(id)` |
| `custody_location_id` | uuid NULL | the team holding it at check time (snapshot) |
| `inspected_at` | timestamptz NOT NULL default now() | |
| `inspected_by` | uuid NULL | actor |
| `verdict` | text NOT NULL | CHECK ∈ `good` / `bad` / `under_repair` |
| `notes` | text NULL | |

"Last checked" per team/unit = `MAX(inspected_at)`. "Due this month" = no inspection with `inspected_at` in the current calendar month.

### 4.3 Denormalized pointer on `tool_asset_units`

Add `current_custody_location_id uuid NULL` (FK → `warehouse_sub_containers(id)`), kept in sync by the assign/move/scrap RPCs. The **ledger is the source of truth for history**; this pointer only makes "list a team's items" a fast, indexed query.

**Division rule (important):** a unit may only be assigned/moved to a team in its **own** `division_id`. Tools are division-owned and mostly stay within their division; the assign/move team picker is **scoped to the unit's division**, and the RPCs assert `team.division_id = unit.division_id`. The pointer never silently changes the unit's division. Changing a unit's division is the **separate, rare Transfer** action (existing `rpc_transfer_tool_unit`, gated by `inventory.catalog.manage`) — and because a unit can't be held by a team in a division it no longer belongs to, a cross-division transfer must first **release any open team assignment** (or be blocked while the unit is assigned). See §7 and `issues.md` ISSUE-8.

### 4.4 No new enums

Reuse `public.tool_condition` (`New` / `Good` / `Fair` / `Maintenance`) and `public.tool_status` (`available` / `assigned` / `maintenance` / `retired`). Mapping in §6.

---

## 5. Surfaces (UI) — Operations → Tools & Assets

A new operational page with **three tabs**:

### 5.1 Teams tab
- **Team cards** (grid, responsive → single column on phone): team name, division, item count, "last checked."
- Click a card → **team detail**: the team's assigned items (serial #, item name, brand, condition, status).
- Per-item actions: **Move to another team** (same division — picker scoped to the unit's division), **Assign a new item** to this team (from that division's available units). *(Phase 1)*
- Per-item **verdict buttons**: Good / Bad / Under-repair. *(Phase 2 — layered onto the same team detail)*

### 5.2 Repair tab *(Phase 2)*
- A bucket/column of every unit with `status='maintenance'` (Under-repair).
- Per item: **Repaired** (→ back in service, condition Good) or **Scrap** (→ retired + P&L write-off).

### 5.3 History & Usage tab *(Phase 1)*
- **Search** by serial number **or** current team.
- **Item detail page**: first-assigned date, full team-by-team timeline with per-stint durations, total days per team, current holder + the team's responsible person.

**UI rules (mandatory):** fully responsive across the 4 breakpoints; team/type pickers use side-by-side cascade selects (never flyouts); all displayed values are human-readable labels (never raw UUIDs); dynamic-height regions get fixed `min-h-*` for layout stability; dialogs follow the project dialog standards (sticky footer, scroll, 1,000,000 number formatting).

---

## 6. Lifecycle vocabulary (status + condition mapping)

| User's word | Persisted as | Where it shows |
|---|---|---|
| In service | `status` = `available` (unassigned) or `assigned` (held by a team) | Teams tab |
| **Good** verdict | `condition` = `Good` | check button |
| **Bad** verdict | `condition` = `Fair` *(reused — no enum add)* | check button (label "Bad / Needs attention") |
| **Under-repair** | `status` = `maintenance` | Repair tab |
| **Repaired** | `status` back to `assigned`, `condition` = `Good` | Repair tab resolve |
| **Scrap** | `status` = `retired` + ledger row closed (`release_reason='scrapped'`) + P&L write-off | Repair tab resolve |

---

## 7. Flows / RPCs

All new RPCs: `SECURITY DEFINER`, permission-gated in-body, `REVOKE ALL … FROM public` + explicit `GRANT EXECUTE … TO authenticated, service_role`. Each writes the ledger + denormalized pointer atomically and logs an `activity_log` row.

| RPC | Phase | Writes |
|---|---|---|
| `rpc_assign_tool_unit_to_team(unit, team, notes)` | 1 | **asserts `team.division_id = unit.division_id`**; opens a ledger row; sets pointer + status `assigned` |
| `rpc_move_tool_unit_to_team(unit, to_team, notes)` | 1 | **asserts same division**; closes open row (`moved`) + opens new row; updates pointer |
| `rpc_return_tool_unit(unit, notes)` | 1 | closes open row (`returned`); pointer → NULL, status `available` |
| `rpc_record_tool_inspection(unit, verdict, notes)` | 2 | inserts inspection; applies condition/status per §6 |
| `rpc_resolve_tool_repair(unit, outcome, notes)` | 2 | `repaired` → status `assigned`+condition `Good`; `scrap` → §8 |

The new RPCs **do not change division** — that stays with the existing `rpc_transfer_tool_unit` (owning-division change, rare, `inventory.catalog.manage`-gated). Because a unit can't be held by a team outside its division, `rpc_transfer_tool_unit` must be extended to **release any open team assignment first** (close the ledger row, clear the pointer) or refuse while the unit is assigned — see `issues.md` ISSUE-8.

Permission gate: a new `tools.assignments.manage` (or reuse `inventory.catalog.manage` — decide in the plan). Read-side may be gated by a per-hub view permission consistent with Custody.

---

## 8. Scrap → P&L (Phase 2)

Scrapping a unit, in one transaction:

1. Close its open ledger row (`release_reason='scrapped'`), set `tool_asset_units.status='retired'`, clear the pointer.
2. Resolve the unit's **cost** from its **receival FIFO layer** (`tool_asset_units.receival_item_id` → the layer's `unit_cost`).
3. Post a **qty-1 write-off through the existing `stock_adjustments` (type `write_off`) → approved → `inventory_stock_movements`** path, so `rpc_report_pnl` reads it into the **"Scrap & Defective"** line at real cost. Same ledger the damaged write-offs already use.

**Edge cases (handle explicitly):**
- **No receival link** (hand-created unit, no FIFO layer): scrap still retires the unit, but posts **zero value** with a visible "no cost on record" note. Do not fail the scrap.
- **FIFO/unit-count sync:** the write-off deducts 1 from the layer; confirm the serialized-unit count and layer qty stay consistent.

---

## 9. Phasing

### Phase 1 — Assign & Track (ships value alone)
- Migration: `tool_unit_assignments` ledger + partial unique index + indexes; `tool_asset_units.current_custody_location_id` pointer.
- RPCs: assign / move / return.
- Hooks + Operations nav entry + route.
- **Teams tab**: team cards + team detail (item list + Move + Assign-new).
- **History & Usage tab**: search (serial / current team) + item detail timeline + per-team usage-days.

### Phase 2 — Health & Disposal
- Migration: `tool_unit_inspections`.
- RPCs: record-inspection, resolve-repair (incl. scrap → P&L write-off).
- **Teams tab**: add verdict buttons (Good / Bad / Under-repair) + "last checked / due this month."
- **Repair tab**: bucket + Repaired / Scrap.
- Scrap → P&L wiring + edge cases.

Each phase = its own spec section → plan → build, following the PROGRESS / flow-registry / security-checklist / EOD ritual.

---

## 10. Non-goals (YAGNI)

- No scheduled/cron monthly cycle — on-demand checks only.
- No per-unit person accountability — team-only holding.
- No fixed-asset depreciation ledger — scrap posts carrying cost, nothing more.
- **Bulk-mode** tool categories already flow to P&L scrap via the normal qty write-off — not re-handled here (serialized units are the whole subject).
- No customer sale of tools — the existing SO exclusion stands.

---

## 11. Technical risks / to verify when planning

1. **Serialized-tool stock plumbing for the write-off:** confirm serialized tool items carry the brand-variant + sub-container stock rows the `stock_adjustments` path expects, or choose an alternate posting (direct movement against the FIFO layer). Pin this down **before** Phase 2.
2. **FIFO layer qty vs. unit count** must stay in sync when a unit is scrapped.
3. **Division alignment on assign/move** must play nicely with the existing `rpc_transfer_tool_unit` and the `guard_tool_unit_division_write` trigger (which requires `inventory.catalog.manage` on any `division_id` change) — the new RPCs are `DEFINER`, so verify the gate holds.
4. **`assigned_to` (legacy person field):** decide whether the hub leaves it untouched (recommended) or nulls it — it is independent of team holding.

---

## 12. Project rules to honor (every task)

- Migrations → **staging** (`mwvblpgbgxipvrevkeff`) via CLI **and** new-prod (`optishfnnctrhffpoywg`) via the guarded flow; mirror every `.sql` into `supabase/migrations-staging/`.
- Commit co-authorship trailer (both authors); commit only when the user confirms it works; batch pushes and ask before deploying.
- Update `PROGRESS.md` (start + completion), the EOD file, and `docs/flows-registry.md` (in the shipping commit).
- Run the module security checklist (Secrets / RLS / Auth gate / Error handling / Layout stability) and record it.
- New tables get RLS + policies. New RPCs revoke public + gate in-body.
- Hand UI smoke to the operator; don't drive the browser or commit speculative visual fixes.
