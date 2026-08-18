# Open Issues / Risks / Decisions — Tools & Assets module

**Living log.** Append new issues as they surface during planning or coding — this is the cross-account/cross-session memory. Mark items `RESOLVED` (with how) rather than deleting them. Read this before writing any migration or RPC.

**Severity:** 🔴 blocker · 🟠 must-decide-before-coding-the-affected-part · 🟡 minor/confirm.
**Status:** OPEN · RESOLVED · DECIDED.

---

### ISSUE-1 — Serialized-tool stock plumbing for the scrap write-off 🔴
**Status:** OPEN — **Phase 2 blocker.**
**Discovered:** 2026-08-18 (design).
**Description:** Scrap must post a qty-1 write-off through `stock_adjustments → inventory_stock_movements` so it hits P&L `v_scrap` (design §8). That path operates on **brand-variant + sub-container stock rows**. It is not yet confirmed that serialized `type='tools'` items carry those rows (they have FIFO layers via receival, but may not have `warehouse_stock_summary` / brand-variant stock the adjustment path expects).
**Impact:** If the plumbing isn't there, the scrap→P&L posting can't reuse the existing path as-is; we'd need an alternate posting (direct movement against the unit's FIFO layer) or a small new disposal ledger.
**Next action (before Phase 2 planning):** live-DB check — for a real serialized tool item, confirm presence/shape of `inventory_item_brand_variants`, `warehouse_stock_summary`, and the FIFO layer from `receival_item_id`. Decide the posting mechanism from what exists.

### ISSUE-2 — FIFO layer qty vs. serialized unit count must stay in sync on scrap 🟠
**Status:** OPEN.
**Discovered:** 2026-08-18 (design).
**Description:** Receiving a tool creates a FIFO layer of qty N and spawns N units. Scrapping one unit should deduct 1 from the layer (for value) AND retire 1 unit, keeping count == remaining layer qty.
**Next action:** trace `create_tool_units_on_receival_layer` + `deduct_fifo_layers`; make the scrap RPC deduct both atomically; add a rolled-back probe.

### ISSUE-3 — Division alignment on assign/move vs. `guard_tool_unit_division_write` 🟡
**Status:** DECIDED (2026-08-18) — **assign/move no longer changes `division_id`.**
**Description:** Original concern: aligning `division_id` on assign would trip the BEFORE-UPDATE guard (`20260827000200`) that requires `inventory.catalog.manage`. Superseded by the **same-division rule** (design §4.3): the hub's assign/move keep the unit in its own division and never write `division_id`, so the guard is never hit by these RPCs. The guard only concerns the cross-division Transfer path — see ISSUE-8.
**Residual:** for the Transfer path, still confirm the guard's permission check reads the **invoker**, not the `SECURITY DEFINER` — verify with a rolled-back allowed/blocked probe.

### ISSUE-4 — Legacy `assigned_to` (person) field semantics 🟡
**Status:** OPEN — decision needed.
**Description:** `tool_asset_units.assigned_to` (a person) is independent of team holding. The hub is team-only.
**Options:** (a) **leave untouched** (recommended — no data loss, the Master-Data unit dialog keeps editing it); (b) null it on team-assign. `ToolAssetUnitEditDialog` still edits it when `status='assigned'`.
**Next action:** default (a); revisit only if it confuses the UI.

### ISSUE-5 — Exact Operations route group + nav registration 🟡
**Status:** OPEN — locate.
**Description:** New hub lives under the Operations menu. Custody (`/warehouse/custody`) is the model; nav/permission tree is `NAV_TREE` (`PermissionTree.tsx`).
**Next action:** open the Custody route + the Operations nav definition; mirror the router group + nav entry.

### ISSUE-6 — Permission key for the hub 🟡
**Status:** OPEN — decide.
**Options:** new `tools.assignments.manage` (clean separation, needs role wiring) vs. reuse `inventory.catalog.manage` (already gates `tool_asset_units` writes, zero setup).
**Next action:** decide in Phase 1 plan; lean toward reuse for the write RPCs unless the operator wants a separate role.

### ISSUE-7 — Placeholder (unconfirmed-serial) units 🟡
**Status:** OPEN — decide UI behavior.
**Description:** Received tools spawn as `is_placeholder=true` with auto serial `<sku>-NNN` until confirmed via `rpc_confirm_tool_serial`. This is normal, valid data (not junk).
**Next action:** decide whether the hub can assign a placeholder unit to a team, or requires a confirmed serial first. Recommend allowing assignment but surfacing an "unconfirmed serial" badge.

### ISSUE-8 — Cross-division Transfer must release an open team assignment 🟠
**Status:** OPEN.
**Discovered:** 2026-08-18 (design — operator constraint: tools are division-owned and mostly stay put).
**Description:** The hub's assign/move is **same-division only** (design §4.3). Changing a unit's owning division is the existing `rpc_transfer_tool_unit`. But once the ledger exists, a unit can be **held by a team** (open `tool_unit_assignments` row) whose `division_id` is the unit's current division. If the unit is transferred to another division while still assigned, the open assignment would point at a team in the wrong division — an inconsistent state.
**Options:** (a) **extend `rpc_transfer_tool_unit`** to close the open assignment (`release_reason='moved'`/new `division_transfer`) + clear `current_custody_location_id` in the same txn; or (b) **block the transfer** while the unit is assigned (force a Return first).
**Next action:** decide in Phase 1 (the ledger ships in Phase 1, so the interplay must be handled then even though cross-division transfer is rare). Lean toward (a) auto-release for fewer operator steps; add a rolled-back probe. Also note: the Master-Data `ToolUnitTransferDialog` is the current UI entry point for `rpc_transfer_tool_unit`.

### ISSUE-9 — All tool units currently have NULL division_id 🔴
**Status:** DECIDED 2026-08-18 → **(A) establish-on-assign.** `rpc_assign` done + probe-green (COALESCE sets division from the team when NULL; cross-division stays blocked once a unit is divisioned). **REMAINING for Task 4:** `get_assignable_tool_units` must return `division_id = p_division_id OR division_id IS NULL`.
**Discovered:** 2026-08-18 (Task 2 probe, staging live DB).
**Description:** All **1,326** `tool_asset_units` on staging have `division_id = NULL` — the column (added `20260827000000`) was never backfilled. Consequences for Phase 1: (1) the strict same-division assign guard blocks EVERY assignment (NULL is distinct from any team division); (2) `get_assignable_tool_units(p_division_id)` filters `division_id = p_division_id`, so it returns **zero** units for any team → the Assign dialog would be empty.
**Decision (operator):**
- **(A) Establish-on-assign** [recommended, the only practical option]: assigning a NULL-division unit to a team **sets** the unit's division to that team's division. `get_assignable_tool_units` returns unassigned units where `division_id = p_division_id OR division_id IS NULL`. Divisions populate organically as tools are assigned. Once a unit has a division, the same-division rule applies to moves as designed.
- **(B) Require pre-set division**: the operator must set each unit's division first (tool editor / a bulk backfill) before it can be assigned. No clear per-unit division source exists today, so this needs a backfill mechanism first.
**Next action:** ✅ `rpc_assign_tool_unit_to_team` implemented (establish-on-assign). TODO in Task 4: make `get_assignable_tool_units` include NULL-division units so the Assign dialog isn't empty. Operator should be aware: as tools get assigned, their divisions populate from the teams — no separate backfill needed.
