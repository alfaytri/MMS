# Warehouse Model v2 — Handoff Doc

**Purpose:** carries the multi-division warehouses + temp warehouses plan across the Phase 9.7 gap. Read this first when you resume the work.

---

## What's designed ✅

### Section 5 — Multi-Division Warehouses + Per-Division Sub-Containers

**Design spec:** [`docs/warehouse-model-v2-design.md`](docs/warehouse-model-v2-design.md)

**Model in one paragraph:** A warehouse belongs to a Company (not a division). Inside the warehouse, one sub-container per division holds stock. Division-scoped users see only their own division's sub-container in any warehouse; warehouse RPs see all sub-containers in warehouses they're responsible for. If a warehouse has no sub-container the user can see, the whole warehouse is hidden. Cross-division stock movements reuse `warehouse_transfers` with source/destination sub-containers.

**Migration:** 5 phases (A additive schema → B backfill → C flip writes + RLS + RPC updates → D operator UI → E drop deprecated). ~2 focused weeks total.

**Design decisions locked in:**
1. Warehouse belongs to Company, drops direct division link.
2. Receival lands straight into a sub-container (auto-created with default name `"<Warehouse> — <Division>"` if missing, operator-editable).
3. RP visibility = anyone in `warehouse_responsible_persons` sees all sub-containers in that warehouse.
4. Cross-division moves within a warehouse reuse `warehouse_transfers` (relax the `check_different_warehouses` constraint to `check_different_sub_containers`).
5. Strict isolation: warehouse with no visible sub-container is hidden entirely from that user.
6. RLS via new helper `is_sub_container_visible(sub_container_id)` — branch A `is_division_visible(sc.division_id)` OR branch B `EXISTS(warehouse_responsible_persons WHERE warehouse_id = sc.warehouse_id AND profile_id = _current_user_data_id())`.
7. Denormalized `division_id` on stock rows stays during Phase A–D as a safety net; dropped in Phase E.

---

## What's pending 🔍

### Section 4 — Temp Warehouses

**Not yet designed.** Brainstorm was interrupted at the "let's design Section 5 first" fork.

**Concept (Mohamed's verbatim):**
> Not an actual warehouse but a place where it not in warehouse, but not yet used — like site jobs. Ability to create a temp warehouse where a set of items is transferred (e.g. for a site job). When items are installed / consumed on site, user must submit confirmation images or bills to close out the temp warehouse.

**Interpretation:** a temp warehouse is a **staging area** — a job site, a van, a project holding area. Items get transferred there from a real warehouse. They sit there until consumed with proof (photos / bills). Closing out either recognizes the consumption (writes movements against the real cost basis) OR returns unused items to the source warehouse.

**Open questions to answer when we brainstorm this on the new branch:**
- Flag on `warehouses` (`is_temporary`, `parent_warehouse_id`, `closes_at`) or a separate `temp_warehouses` table?
- If a flag: does a temp warehouse have sub-containers too, or does the Section 5 model change here?
- Closeout evidence storage — new `temp_warehouse_closeouts` table with attached files (Supabase Storage), or bolt onto an existing attachment table?
- Auto-return of unconsumed items on close — one bulk transfer back to source? Per-item choice?
- Who can create / close a temp warehouse — the site's team lead, warehouse RP, both?
- Does a temp warehouse belong to one division (its parent's) or can it also span multiple?
- Does a temp warehouse need approvals to close (like adjustments do), given the consumption is destructive?
- What happens to a temp warehouse's stock if the closeout evidence gets rejected?

---

## Prerequisite before resuming this work

**Finish Phase 9.7 on the current `feature/phase-9-damaged-stock` branch first.**

Phase 9.7 shipping means:
- `/warehouse/damaged-stock` overview page (three tabs: On-hand damaged / Out for repair / Movements)
- `ReturnFromRepairDialog` invoked from Out-for-repair row action
- SendForRepairDialog wired to a "pending vendor" list within the overview
- Cleanup: set `warehouse_transfers.division_id` on damaged-repair-out transfers (leak flagged in the RLS audit — currently `NULL`, making them globally visible via `is_division_visible(NULL) = TRUE`)

After 9.7 lands and you sign off on the E2E verification, THEN we merge Phase 9 to `deploy/warehouse-shipping` and open the new branch.

---

## Clear command sequence to resume

Follow this order when you're ready to pick up warehouse-model-v2:

### Step 1 — Merge Phase 9 to `deploy/warehouse-shipping`

```bash
git checkout deploy/warehouse-shipping
git pull origin deploy/warehouse-shipping
git merge --no-ff feature/phase-9-damaged-stock -m "merge: Phase 9 — damaged stock dispositions + DN dual-ledger"
git push origin deploy/warehouse-shipping
```

If the merge is a straight fast-forward (no other commits on `deploy/warehouse-shipping` since Phase 9 branched), the `--no-ff` still preserves branch history. Adjust if there are conflicts.

### Step 2 — Cut the new branch

```bash
git checkout deploy/warehouse-shipping
git checkout -b feature/warehouse-model-v2
git push -u origin feature/warehouse-model-v2
```

### Step 3 — Kick off implementation planning for Section 5

Say to Claude: **"Start Phase A of the multi-division warehouses plan — read `docs/warehouse-model-v2-design.md` and use the writing-plans skill to draft the implementation plan for Phase A."**

Phase A is additive schema only, zero-risk, one migration. Right size for a warm-up on the new branch.

### Step 4 — When Phase A ships, resume Section 4 brainstorm

Say to Claude: **"Resume the Temp Warehouse brainstorm. Read `docs/warehouse-model-v2-handoff.md` § Section 4 Pending for context, then invoke the brainstorming skill and pick up from the open questions list."**

The brainstorming skill starts fresh — the handoff doc's open-questions list is the anchor so it doesn't wander.

---

## Guard rails

- **Do NOT start Section 4 or Section 5 work on any branch before Phase 9.7 ships.** The current damaged-side code has to stabilize first.
- **Do NOT delete this handoff file** until both Section 4 and Section 5 are complete. Even after merge, keep it around as an audit trail.
- **Do NOT edit the `docs/warehouse-model-v2-design.md` spec directly** to change the model — if a decision needs to reopen, reopen the brainstorm and re-derive.
- **Do NOT merge `feature/warehouse-model-v2` back to main before both sections are fully deployed and operator-verified** — the migration is phased for a reason.

---

## Status snapshot at time of handoff (2026-07-31)

- Current branch: `feature/phase-9-damaged-stock`
- Phase 9 tasks complete: 9.0–9.6 (DB layer + damaged-side UI shipped, verified end-to-end on staging)
- Phase 9 tasks pending: 9.7 (Damaged Stock overview + ReturnFromRepairDialog), 9.8–9.10 (DN dual-ledger), 9.11 (E2E sweep), 9.12 (Security audit)
- This branch will merge to `deploy/warehouse-shipping` once 9.7 lands (milestone gate) — user decision to defer 9.8–9.12 to a later branch if desired.
- Warehouse Model v2 spec: `docs/warehouse-model-v2-design.md` (committed, reviewed)
- Warehouse Model v2 handoff: this file
