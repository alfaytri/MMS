# Bulk Tools — Design

**Date:** 2026-08-15
**Status:** Draft — pending operator review (decisions locked; 3 open questions below)
**Sequenced after:** [Item→Division Assignment](../2026-08-15-item-division-assignment/design.md) (shipped 2026-08-15). Bulk tools become a qty type, so they inherit that feature's assignment / per-division pool / transfer / category-overlay behavior.

---

## 1. Problem

A **tool** can only be tracked **serialized** today — one `tool_asset_units` row per physical unit (serial, condition, status, `assigned_to` a person, expiry). There is no bulk/quantity option, so low-value or consumable-style tools (bits, blades, gloves) can't be tracked as *"we have N of these."* Tools are also excluded from the whole qty machinery: the cascade picker skips them (`isFilterable = type !== 'tools'` in `useCascadeAccessibleItems`), they have no brand-variants / FIFO / per-division stock pools, and they live in a separate [`ToolsAssetsView`](../../../src/components/services/inventory/ToolsAssetsView.tsx).

## 2. Goals

- Add a **per-category tracking mode**: **Serialized** (current) or **Bulk**.
- A **bulk tool = the full consumables machinery**: *item · brand · origin → qty on hand*, via `inventory_items` + `inventory_item_brand_variants` + `fifo_cost_layers` + per-division sub-container stock + PO / receiving / consumption / transfers — exactly like a Consumable.
- Bulk tools **join the Phase-1 item→division model**: Assigned divisions, per-division pools, transfer-only movement, and the per-division category overlay.
- **Serialized tools also become division-scoped**: add `division_id` to `tool_asset_units` + a unit-level transfer path (a unit moves between divisions, not just between people).

## 3. Non-goals

- No change to how serialized units track condition / status / `assigned_to` — division is **added**, not a replacement.
- No change to the qty machinery itself — bulk tools reuse it unchanged.
- A tool that is *both* serialized and bulk is not a goal — that's two categories / two items.

## 4. Decisions (locked with operator, 2026-08-15)

1. **Mode is per CATEGORY** — each tool category is Serialized or Bulk; all its items follow.
2. **Serialized units are division-scoped too** — `tool_asset_units.division_id` + unit transfer.
3. **Bulk = full consumables machinery** (brand/origin/qty/FIFO/pools).
4. **Sequenced after assignment** (now shipped).

## 5. Current model (verified against live DB, 2026-08-15)

- `tool_asset_units(id, item_id, serial_number, brand, condition, status, expiry, assigned_to, created_at, receival_item_id, is_placeholder)` — **no `division_id`**.
- `inventory_categories` — **no `tool_tracking_mode` column**.
- `inventory_categories.type` enum includes `tools`.
- `ToolsAssetsView` renders tool categories as asset-unit rows; the cascade picker excludes `type='tools'`.

## 6. New model

### 6.1 Tracking mode (per category)

- Add `inventory_categories.tool_tracking_mode` enum `('serialized','bulk')`, **default `'serialized'`** (only meaningful when `type='tools'`; ignored for the other three types).
- **Switchable behind a guard** — a category can flip serialized↔bulk later, but the conversion is guarded: blocked (or requiring an explicit migration) while the category holds asset units or qty stock, so nothing is orphaned; an empty category switches freely. (Decision Q2.)

### 6.2 Bulk tools = a qty type

- Bulk-tool categories' items flow through the **same path as Consumables**: brand-variants, FIFO cost layers, per-division sub-container stock, PO lines, receiving, consumption, transfers.
- **Picker gate change:** `useCascadeAccessibleItems`'s `isFilterable = type !== 'tools'` becomes *"filterable unless it's a **serialized** tool category"* — bulk tool categories are included (they're qty).
- Bulk tools opt into the **Phase-1 assignment model** — Assigned divisions checklist, per-division pools, transfer-only movement, and the per-division category overlay (extend the overlay's allowed set to **Products / Spare-parts / Consumables / Bulk-tools**; serialized tools stay excluded).
- `ToolsAssetsView` renders **serialized** categories as unit rows (current) and **bulk** categories as qty rows (item / brand / origin / qty), like the inventory list.
- PO / receiving / consumption line editors accept bulk-tool lines (they already accept the qty types; the gate change surfaces bulk tools there).

### 6.3 Serialized tools become division-scoped

- Add `tool_asset_units.division_id uuid → company_divisions`.
- Add a **unit-level transfer** path (move a unit's `division_id`; keep `assigned_to` — division owns, person holds).
- Existing units' `division_id` starts **null** — the operator sets each unit's division; no inference from stock or assignment. (Decision Q1.)

## 7. Behavioral changes

| Surface | Serialized tool | Bulk tool |
|---|---|---|
| Cascade picker (PO/receival/consume) | excluded (asset-tracked) | **included** — qty, assignment-gated (buy) / owned-stock-gated (consume) |
| ToolsAssetsView | unit rows (serial/condition/status/person) | **qty rows** (item/brand/origin/qty) |
| PO / receiving | units created via the receival asset flow (unchanged) | qty lines like consumables |
| Division | `tool_asset_units.division_id` + unit transfer | per-division pool + transfer (Phase-1 model) |
| Category overlay | n/a | inherits Phase-1 overlay (allowed set extended to include bulk tools) |

## 8. Phasing

- **P2a — Bulk tool qty path:** `tool_tracking_mode` column + default; picker-gate change; `ToolsAssetsView` bulk-category qty rows; PO/receiving/consumption acceptance; bulk tools in the assignment + overlay model.
- **P2b — Serialized-unit division-scoping:** `tool_asset_units.division_id` + backfill + unit-transfer RPC/flow.

Each phase ships independently; P2a delivers the headline "bulk tools" value.

## 9. Migration / cutover

1. Add `tool_tracking_mode` (default `serialized` → **zero behavior change** for existing tool categories).
2. Operator flips specific tool categories to `bulk`.
3. Relax the picker gate + `ToolsAssetsView` render to honor the mode.
4. Extend the Phase-1 overlay allowed set to include bulk tools.
5. (P2b) Add `tool_asset_units.division_id` + backfill + unit transfer.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| A category ends up with both asset units and qty stock | Lock mode once the category is populated (§6.1). |
| Double-counting a tool that's "both" | Not supported — it's two categories/items; documented. |
| Serialized backfill picks a wrong division | Q1 — pick a deterministic, reviewable source; backfill in a rolled-back-verified migration. |
| Bulk tools miss a type-specific behavior elsewhere | Audit every `type === 'tools'` / `!== 'tools'` branch (23 files found earlier) during planning; each must decide serialized-only vs mode-aware. |

## 11. Resolved decisions (operator, 2026-08-15)

- **Q1 — Serialized units' `division_id` backfill:** **Leave null** — existing units start unassigned; the operator sets each unit's division. No inference from stock location or assignment.
- **Q2 — Mode switching after items exist:** **Allowed behind a guard/migration** — a tool category can switch Serialized↔Bulk later, but the conversion is guarded (blocked, or requires an explicit migration, while the category holds asset units or qty stock; an empty/clean category switches freely).
- **Q3 — Serialized unit ownership:** **Both** — keep `assigned_to` (the person holding the unit) AND add `division_id` (the owning division). Division owns, person holds.
