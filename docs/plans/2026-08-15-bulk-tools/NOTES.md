# Bulk Tools — Decisions & Scope (follow-up feature)

**Date:** 2026-08-15
**Status:** Decided (scope) — full design + plan to be written **after** the Item→Division Assignment rip-out ships.
**Sequencing:** Runs **after** [item-division-assignment](../2026-08-15-item-division-assignment/plan.md). Bulk tools become a qty type, so they inherit the assignment / per-division pool / transfer / category-overlay behavior built there.

## Problem

Today a **tool** can only be tracked **serialized** — one `tool_asset_units` row per physical unit (serial_number, condition, status, `assigned_to` a person, expiry). There is **no** bulk/quantity option, so low-value or consumable-style tools (bits, blades, gloves) can't be tracked as *"we have N of these."* Tools are also excluded from the qty machinery entirely (cascade picker: `isFilterable = type !== 'tools'`; no brand-variants/FIFO/pools; separate `ToolsAssetsView`).

## Decisions (operator, 2026-08-15)

1. **Mode is per CATEGORY.** Each tool category is **Serialized** or **Bulk**; every item in it follows. (A category's mode is fixed once it holds items.)
2. **Bulk tool = full consumables machinery.** *this item · brand · origin → qty on hand* — reuses `inventory_items` + `inventory_item_brand_variants` + `fifo_cost_layers` + sub-container stock + PO/receiving + consumption + transfers, exactly like Consumables. Bulk tools join the **item→division assignment + per-division pool + transfer + category overlay** model.
3. **Serialized tools also become division-scoped.** Add `division_id` to `tool_asset_units` and a **unit-level transfer path** so an asset moves between divisions (not just between people). This is the one place serialized tools change under the new division model.

## Rough scope (to expand into a full design + plan later)

- **DB:** `inventory_categories.tool_tracking_mode` enum `('serialized','bulk')` default `'serialized'` (only meaningful when `type = 'tools'`). Add `tool_asset_units.division_id uuid → company_divisions` + backfill + a unit transfer RPC/flow.
- **Picker gate:** change `isFilterable = type !== 'tools'` to include **bulk** tool categories (they're qty). Serialized categories stay out of the qty picker.
- **UI:** `ToolsAssetsView` renders serialized categories as asset-unit rows (current) and **bulk** categories as qty rows (like the inventory list — item/brand/origin/qty). PO/receiving/consumption line editors accept bulk-tool lines.
- **Assignment overlay:** the item-division-assignment feature already excludes ALL tools; when bulk tools land, extend the overlay's allowed set to **Products / Spare-parts / Consumables / Bulk-tools** (serialized tools excluded — they're unit-tracked).
- **Reports:** bulk tools flow through the same cost/consumption/stock reports as consumables.

## Open questions for the full brainstorm (later)

- Migration for existing tool categories → all default `serialized` (no behavior change); operator flips specific categories to `bulk`.
- Can a category switch modes after it has items? (Proposed: no — lock once populated, to avoid orphaning asset units vs qty stock.)
- Do serialized units keep `assigned_to` (person) **and** gain `division_id` (both), or does division replace person-assignment? (Proposed: both — division owns, person holds.)
