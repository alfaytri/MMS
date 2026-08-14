# Multi-Division Purchase Order — Phase 1 Design

**Date:** 2026-08-15
**Branch:** `deploy/warehouse-shipping`
**Status:** Approved (design); plan to follow.

## Problem

A PO is currently locked to a single division: `purchase_orders.division_id` holds one value, the Create-PO "Division" picker sets it, the item cascade only offers items that one division can use, and **all** access (see/create/edit/delete) is gated on that one division via RLS. To buy items for more than one division from the same supplier you must create separate POs.

**Goal:** one PO whose **line items can each belong to a different division** (same supplier, one order). Approved once, received per-item into the right division's stock.

## Owner-confirmed decisions

1. **Visibility:** a mixed PO is visible to anyone who can see **any** of its line-divisions.
2. **Approval:** **one** chain for the whole PO by amount tier + role — unchanged (division does not drive approvers today).
3. **Scope:** **Phase 1 core only** — create, store, visibility, receiving display, PO detail/list. Per-division financial reporting / AP attribution is a separate **Phase 2**.

## Current-state facts (verified against live staging)

- `purchase_orders.division_id uuid NULL`; **`po_line_items` has no division column** (15 cols; lines carry `brand_variant_id`, qty, price, `fifo_layers`, …).
- `rpc_create_purchase_order(p_payload jsonb)` — **SECURITY DEFINER**, inserts `po_line_items`, already reads a header `division_id` from the payload. No separate update/amend RPC exists → **edits are direct table writes** (RLS-gated).
- RLS: 4 `purchase_orders` policies (`division_scope_select/insert/update/delete`) all use `is_division_visible(division_id)`.
- `is_division_visible(uuid)`: returns **true when the arg is NULL**; else true for owner/accountant (narrowed by active division) or when the division is in the caller's JWT `division_ids` (narrowed by active division). `auth.jwt()` reflects the **caller** even inside a SECURITY DEFINER function.
- Approval routing (`rpc_build_po_approval_steps`, `advance_po_approval_tier`, `po_approval_action`) keys off `workflow='po'` + role + `approval_level` (amount tier) — **no division dependency**.
- Receiving: `receival_items` rows each carry `po_line_item_id` + `sub_container_id` (the destination) — receiving is **already per-item**. `create_inventory_receival(p_mode, p_warehouse_id, …, p_sub_container_id)`. Warehouses are company-scoped (`warehouses.company_id`), division→warehouse mapping is separate.
- Items are **not** owned by one division: `inventory_items.shared_with_division_ids uuid[]`; accessibility is stock-ownership (a sub-container with the division's `division_id`) OR shared-to-division (`useCascadeAccessibleItems`). So a line's division is a **deliberate operator choice**, not derivable from the item alone.

## Design

### Data model
- **`po_line_items.division_id uuid NULL REFERENCES company_divisions(id)`** — each line's division. Backfilled from the parent PO's header `division_id`. Required for new lines (enforced in RPC + UI); nullable in the column for legacy rows.
- **`purchase_orders.division_ids uuid[] NOT NULL DEFAULT '{}'`** — the distinct set of line divisions; the source of truth for visibility. Backfilled = distinct non-null line divisions.
- **`purchase_orders.division_id`** (header) is **kept** as the **primary** division (creator's active division, else the first line's division) so existing single-division reads/reports keep working. For a single-division PO, `division_ids = [division_id]`.

### Visibility (RLS)
- Re-add helper **`is_any_division_visible(p uuid[])`** = `EXISTS (SELECT 1 FROM unnest(p) d WHERE is_division_visible(d))` (was dropped in `20260815010500`; `STABLE SECURITY DEFINER`, `search_path=public`).
- Repoint the 4 `purchase_orders` policies to **`is_any_division_visible(division_ids) OR is_division_visible(division_id)`**:
  - Single-division PO: `division_ids=[X]` → same behavior as today.
  - Mixed PO: visible to a viewer of any element of `division_ids` (respecting the active-division narrowing already inside `is_division_visible`).
  - Legacy null-division PO: `division_ids={}` → array check is false, but `is_division_visible(NULL)=true` keeps it visible-to-all exactly as today. **No visibility regression.**
- INSERT/UPDATE `WITH CHECK`: same expression. The DEFINER create RPC additionally enforces per-division access in-body (RLS is bypassed during the RPC's own inserts).

### Create RPC (`rpc_create_purchase_order`)
- `p_payload.line_items[]` gains **`division_id`** per line.
- Body (sourced live via `pg_get_functiondef`, minimally changed):
  1. For each line: `division_id` required; assert `is_division_visible(line.division_id)` for the caller → else `RAISE` a clear message.
  2. Insert `po_line_items.division_id`.
  3. Compute `v_division_ids = distinct(non-null line divisions)`; set `purchase_orders.division_ids`.
  4. Set header `division_id` = the payload's `division_id` if it's in the set, else the first line's division (primary).
- Fully back-compatible: a single-division payload behaves as today.

### Create UX (`create-po` page, `PoLineItemsEditor`, `CascadeInventorySelector`)
- Replace the single header **Division** picker with a **per-line Division selector** (the caller's accessible divisions, grouped by company as today).
- Each line's item cascade filters to items that **line's** division can use — reuse `useCascadeAccessibleItems(lineDivisionId)` (currently keyed to the active division).
- A new line defaults its division to the current line's / active division for fast same-division entry. Single-division users: division auto-set, selector hidden (unchanged UX).
- `buildPayload` emits per-line `division_id`. Validation: every line needs an item **and** a division.
- Header keeps a compact read-out of the PO's division set ("Maintenance, Trading").

### Display (PO detail, orders list, edit-PO)
- PO detail + edit-PO: a **division badge per line**; header shows the division set.
- Orders list: with array RLS a mixed PO already appears for viewers of any involved division; add a **Scope/Division** cell ("Multi" or the single division's short-name). The existing division filter keeps working.
- Edit-PO: per-line division editable; direct-write path relies on the array RLS + re-computes `division_ids` on save (via a lightweight trigger — see below).

### Keeping `division_ids` in sync
- A **`BEFORE INSERT OR UPDATE` trigger is not enough** (it can't see child rows). Instead: the create RPC sets `division_ids` directly; for **edit** (direct writes to `po_line_items`), add an **`AFTER INSERT/UPDATE/DELETE ON po_line_items` trigger** that recomputes the parent `purchase_orders.division_ids` from its lines. This keeps the denormalized set correct no matter which path mutates lines.

### Receiving
- The receive-against-PO surface shows each line's **division** so the operator routes it to the correct warehouse/sub-container; **soft warning** if the chosen sub-container's division differs from the line's division. No structural change (receiving is already per-item). Hard validation deferred (Phase 2 / follow-up).

### Approval — unchanged
- One chain by amount tier + role. No change to `rpc_build_po_approval_steps` / `advance_po_approval_tier` / `po_approval_action`.

## Out of scope (Phase 2)
- Per-division spend / payables / P&L attribution; AP split across divisions; per-division budgets.
- Per-division / split approval.
- Vendor-facing PDF (division is internal — not shown to the supplier).
- Hard warehouse↔division validation at receiving (Phase 1 warns only).

## Risks & mitigations
- **Visibility regression on legacy null POs** → mitigated by keeping `OR is_division_visible(division_id)` in the policy.
- **`division_ids` drift on edit** → the `po_line_items` AFTER trigger recomputes it.
- **RPC access bypass** (DEFINER) → the RPC asserts `is_division_visible` per line before inserting.
- **`useCascadeAccessibleItems` currently active-division-scoped** → parameterize by a passed division id without changing consumption flows (add an optional arg; default = active division).

## Testing
- **Silent:** `tsc`; `db push` to staging; re-pull changed function bodies + policies; RLS DO-block probes — a user whose JWT has only Trading sees a `[Maintenance,Trading]` PO, a user with neither does not, owner sees all; rolled-back `rpc_create_purchase_order` write-path with a 2-division payload (asserts per-line `division_id` stored + `division_ids` = both); `po_line_items` trigger recompute proven by a rolled-back delete.
- **Operator/browser smoke:** create a Maintenance+Trading PO; confirm per-line division + header set; verify cross-division visibility by switching the active division; receive lines into the correct warehouses.
