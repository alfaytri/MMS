# Tools & Assets — Phase 2 Rework (Repair Integration · Check Sessions · Lifecycle Type · Team View)

> **Status:** Design approved (operator, 2026-08-18). Supersedes parts of `../phase-2/` **before Phase 2 ships to prod** — the standalone inline Good/Bad/Repair verdict buttons and the standalone Scrap-from-bucket model are replaced/extended here. Phase-2 DB currently lives on **staging only**; this rework lands on staging on top of it, and the whole thing ships to new-prod in **one** guarded apply at the end.

## Goal

Rework the not-yet-shipped Phase 2 (Health & Disposal) into the operator's real workflow:

1. **Repair is a lifecycle, integrated with Damaged Stock** — a tool goes team → Repair bucket (awaiting vendor) → out for repair (via the existing vendor send/return machinery) → back to a store (Repaired) or scrapped (→ P&L). **Repair is never charged** — cost is stripped from every repair flow.
2. **Lifecycle type** — every unit is **New / Used / Repaired**, tracked automatically.
3. **Monthly check is its own page** — a formal, dated **check session** per division, team-by-team, exportable to **PDF + Excel**.
4. **Team tool view** — a tree (not a flat table), showing each unit's condition + when assigned + tools currently in repair; returns record **where the tool went**.

## Prod / sequencing (locked)

- Build + operator-smoke **everything on staging first**. **One** clean guarded new-prod apply at the very end, gated on explicit go-ahead. Nothing touches new-prod during this rework.
- Every migration mirrored into `supabase/migrations-staging/`. Live DB is the only authority — fetch each live body (`pg_get_functiondef`) before rewriting; confirm enums/columns live; sweep `pg_proc` for overloads; rolled-back probe before + after each RPC.

## Locked decisions (from the brainstorming Q&A, 2026-08-18)

| # | Decision |
|---|---|
| 1 | Prod: staging-first, single apply at end. |
| 2 | Repair cost stripped **everywhere** — tools **and** the shipped sales-return damaged-repair path. |
| 3 | Repair is **two-stage**: collect → Repair bucket (*awaiting vendor*) → send to a specific vendor. |
| 4 | On **Return**, operator picks a **destination store**; it is stamped on history and shown ("Returned to X — date"). |
| 5 | Lifecycle type is **automatic** (received→New, first-assigned→Used, repaired-usable→Repaired) **+ manual override** on the unit editor. |
| 6 | Monthly check is a **formal session** that tracks progress (X of Y checked). |
| 7 | Team tool surface becomes a **view (tree)**; Good/Bad checking moves to the check page; **Send-to-Repair stays on the view** (repairs happen mid-month). |
| 8 | **Replacement is a separate action** — Send-to-Repair never bundles a replacement; if the team needs one, that's a normal Assign afterward. |
| 9 | A repaired-usable original returns **to a store (available pool)**; the team keeps whatever replacement it was given. |
| 10 | The check records **condition only (Good/Bad)** per unit — no repair-sending from the check page. |
| 11 | The check report lists **only the tools actually checked** in the session: item, serial, type, condition, inspection date. |

---

## A. Repair lifecycle + Damaged-Stock integration

### Unit state machine

```
In service (assigned, with a team)
   │  Send to Repair  →  confirm "Have you collected this tool?"
   ▼
Awaiting vendor  (status='maintenance', in the Repair bucket, NO open repair transfer)
   │  Send for repair  →  pick vendor + expected-return date (existing SendForRepairDialog)
   ▼
Out for repair   (status='maintenance', open damaged_repair_out transfer w/ tool_unit_id; shows in Damaged Stock → Out for Repair)
   │  Return from repair  (existing ReturnFromRepairDialog, cost field removed)
   ├─ Usable    → Available, lifecycle_type=Repaired, returned to a store the operator picks
   └─ Write-off → Retired  + scrap→P&L (the existing write-off → approve_stock_adjustment_inventory path)
```

- **Repair bucket** — a default, always-present, **division-scoped** bucket (no team/division to create). It lists units that are *awaiting vendor* — `status='maintenance'` with **no** open repair transfer. Once sent to a vendor, the unit leaves the bucket and appears in Damaged Stock → Out for Repair.
- **Send to Repair** (team view, available any time): pops *"Have you collected this tool from the team?"*. On confirm → close the open team assignment (`release_reason='sent_for_repair'` — **a new value the ledger's `release_reason` CHECK must be extended to allow**), clear the custody pointer, set `status='maintenance'`. Unit lands in the Repair bucket.
- **Send for repair** (from the bucket): reuse `SendForRepairDialog` — pick an existing repair vendor + expected-return date. Writes the same `warehouse_transfers(transfer_kind='damaged_repair_out')` record, keyed by `tool_unit_id`.
- **Return from repair**: reuse `ReturnFromRepairDialog` with the **Repair Cost field removed**. Outcome ∈ {usable, writeoff}. Usable → Available + lifecycle Repaired + returned-to store (operator picks). Writeoff → retire + scrap→P&L.

### The serialized-tool bridge (the one architecture choice — approved)

The shipped `rpc_send_damaged_for_repair` / `rpc_return_damaged_from_repair` are built around **sales-return dispositions** (`return_line_inventory_dispositions`) and **bulk brand-variant qty** — neither of which a serialized tool has. Rather than bolt a serialized-unit branch onto those money-path RPCs (high risk), add **thin sibling RPCs for tools** that write the **same** transfer kind so tools surface in the **same** Out-for-Repair list and reuse the **same** dialogs, keyed by `tool_unit_id`:

- `rpc_send_tool_for_repair(p_unit_id, p_repair_vendor_id, p_expected_return_date, p_notes)` — writes `warehouse_transfers(transfer_kind='damaged_repair_out', tool_unit_id, repair_vendor_id, status='in_transit', expected_return_date, division_id)`. **Does not** touch `inventory_damaged_stock`/layers (tools aren't in the damaged qty ledger). The transfer row is the record of location.
- `rpc_return_tool_from_repair(p_transfer_id, p_outcome, p_notes)` — `p_outcome ∈ {usable, writeoff}`. Usable → unit Available + `lifecycle_type='repaired'` + `current_custody_location_id = <chosen store>`; closes the transfer `status='received'`. Writeoff → unit retired + the existing scrap→P&L write-off path; closes the transfer.
- `rpc_send_tool_to_repair_bucket(p_unit_id, p_notes)` — the collection-confirmed step: closes the team assignment (`release_reason='sent_for_repair'`), sets `status='maintenance'`.

The Damaged-Stock overview read is extended to **union in** tool repair transfers (`tool_unit_id IS NOT NULL`), displaying the tool's item + **serial** (bulk rows have no serial).

**Scrap direct from the bucket** (operator decision, 2026-08-18): an obviously-dead unit can be **scrapped straight from the Repair bucket** without a vendor round-trip — reuses the Phase-2 `rpc_resolve_tool_repair(unit,'scrap')` → P&L write-off path. So the bucket offers **Send for repair** *and* **Scrap**. The Phase-2 *Repaired*-from-bucket action is dropped (superseded by vendor return-usable).

### Cost strip (touches the shipped sales-return path)

- `rpc_return_damaged_from_repair` — **modified**: stop amortizing `p_repair_cost` into the returned good units' FIFO cost, and stop stamping `warehouse_transfers.repair_cost`. Good units return at their **original** unit cost. This applies to **all** callers (sales-return damaged items too), per decision #2.
- `ReturnFromRepairDialog` — remove the **Repair Cost** input. Keep the `p_repair_cost` parameter accepted-but-ignored (default 0) for one release so an older client can't break, then drop it in a later cleanup. The `warehouse_transfers.repair_cost` column stays (nullable, unused) — dropping it is a separate cleanup.
- **Blast radius:** this is a shipped money-path RPC on both DBs. Rewrite from the **live body** (drift-checked), rolled-back probe proving good units now return at original cost, on staging then (at ship time) new-prod.

---

## B. Lifecycle type — New / Used / Repaired

- New column `tool_asset_units.lifecycle_type` — enum `tool_lifecycle_type` = `('new','used','repaired')`, `NOT NULL DEFAULT 'new'`. **Separate axis** from `condition` (Good/Fair) — a unit can be *Used + Good*. Both appear in the check report.
- **Auto-transitions:**
  - Received / created → `new` (default).
  - First assignment to a team → `used` (in `rpc_assign_tool_unit_to_team`: if currently `new`, set `used`). Only advances forward — never `repaired`→`used`.
  - Return-usable from repair → `repaired` (in `rpc_return_tool_from_repair`).
- **Manual override** in the serialized unit editor (`ToolAssetEditDialog`): a New/Used/Repaired select (human-readable, single-option pre-picked pattern). For corrections only.
- **Staging backfill:** existing units default to `new`; a one-time backfill sets any unit with a current or historical assignment to `used`. new-prod has 0 units, so the backfill is staging-test-data only.

---

## C. Monthly check — dedicated page + formal session

### Data

- New table `tool_check_sessions(id, division_id, initiated_by, initiated_at, status ['in_progress'|'completed'], completed_at, notes)` — RLS enabled, read authenticated, write gated `tools.assets.manage`.
- `tool_unit_inspections` gains `session_id uuid NULL REFERENCES tool_check_sessions(id)` — a check recorded during a session links to it (ad-hoc inspections keep `session_id = NULL`).

### Flow (new route, e.g. `/warehouse/tools-assets/checks` or a Checks tab)

1. **Initiate check** for a division → creates a `tool_check_sessions` row (`in_progress`). One open session per division at a time (guard).
2. Page shows that division's **team cards** with a **progress count** — "X of Y tools checked" (Y = units currently held by the division's teams; X = distinct units with an inspection in this session).
3. Open a team → its held tools, each with a **Good / Bad** control. Recording writes a `tool_unit_inspections` row (`session_id`, verdict) and applies the condition map (good→`condition='Good'`, bad→`condition='Fair'`). **No** repair-sending here.
4. **Finalize** → `status='completed'`, `completed_at=now()`. Report becomes available (can also preview before finalize).

### Report (PDF + Excel)

- Read RPC `get_tool_check_session_report(p_session_id)` → one row **per checked unit**: item name, serial, `lifecycle_type`, `condition` (current), `inspected_at`.
- Export **server-side** (reuse the existing `/api/reports/excel` + `/api/reports/pdf` payload routes — client-side exceljs 404s in this build). Columns: **Item · Serial No · Type · Current Condition · Inspection Date**. Header carries the division name + session date.

---

## D. Team tool view

- Replace the flat table in `TeamToolsDetail` with a **tree** (mirrors the assign picker's category → item → unit shape): each unit shows **condition** + **when assigned** (`assigned_at`). Add a distinct **"In repair"** section listing this team's units that are currently *awaiting vendor* or *out for repair* (so the team's tools are never invisibly "gone").
- **Actions** on the view: **Move**, **Return** (now opens a small dialog to pick a **destination store**), **Send to Repair** (collection-confirm). The inline **Good/Bad** buttons are removed (they live on the check page now).
- **Return destination:** `tool_unit_assignments.returned_to_location_id uuid NULL REFERENCES warehouse_sub_containers(id)` (or the store's warehouse — decided at build against the live custody model). `rpc_return_tool_unit` gains `p_to_location_id`, stamps it on the closed ledger row, and sets the unit's `current_custody_location_id` to that store (status `available`). History/timeline shows "Returned to <store> — <date>".
- **Word-wrap fix:** the Item cell currently wraps — constrain it (truncate with title, or `whitespace-nowrap` + `min-w-0` column) so long names don't break the row.

---

## DB change summary (staging-first, mirrored, one prod apply at end)

| # | Migration (new file) | What |
|---|---|---|
| 1 | `…_tool_lifecycle_type.sql` | enum `tool_lifecycle_type` + `tool_asset_units.lifecycle_type` col + staging backfill. |
| 2 | `…_tool_assignment_return_destination.sql` | `tool_unit_assignments.returned_to_location_id` + `rpc_return_tool_unit` gains `p_to_location_id`. |
| 3 | `…_tool_repair_bridge_rpcs.sql` | `warehouse_transfers.tool_unit_id` col; extend `tool_unit_assignments.release_reason` CHECK to allow `'sent_for_repair'`; `rpc_send_tool_to_repair_bucket`, `rpc_send_tool_for_repair`, `rpc_return_tool_from_repair`; extend the Damaged-Stock overview read to union tool repair rows; refine `get_repair_bucket` to exclude out-for-repair units; auto-`used` in `rpc_assign_tool_unit_to_team`; auto-`repaired` in the tool return. |
| 4 | `…_strip_repair_cost.sql` | **modify** `rpc_return_damaged_from_repair` (live-body rebase) — no repair-cost amortization / no `repair_cost` stamp; good units at original cost. |
| 5 | `…_tool_check_sessions.sql` | `tool_check_sessions` table + RLS/policies; `tool_unit_inspections.session_id`; `get_tool_check_session_report`; session initiate/finalize + record-with-session RPCs. |

All new RPCs: `SECURITY DEFINER`, gated `tools.assets.manage`, `REVOKE … FROM public` + grant `authenticated, service_role`. New tables: RLS on + ≥1 policy.

## Non-goals / out of scope

- No barcode/QR scanning for checks.
- No repair-cost **reporting** (cost is gone, not relocated).
- No forced swap-back of a replacement when the original returns.
- ISSUE-10 (Show-tools collapsible on `/warehouse/custody`) stays deferred.
- Bulk (qty-tracked) tools are unaffected — this is serialized-unit lifecycle only.

## Risks

- **Cost strip on a shipped RPC** (`rpc_return_damaged_from_repair`) — must rebase on the live body of each DB and prove with a rolled-back probe that good units return at original cost before and after. Highest-blast-radius change here.
- **Serialized ↔ transfer bridge** — tool repair transfers must not be mistaken for bulk damaged transfers by the overview/return machinery; guard every join on `tool_unit_id IS NULL` vs `NOT NULL`.
- **Enum/column drift** — new-prod carries Phase-2 objects only via the final apply; drift-check each object at ship time.
