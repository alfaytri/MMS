# Tools — Per-Division Tracking Mode (one item, no duplication)

**Goal:** A single tool catalog item can behave as **bulk** (sellable quantity) in some divisions and **serialized** (per-unit custody) in others — appearing **once** in the catalog, never duplicated.

**Status:** Feature complete on **staging** — 2026-08-30. All 6 phases built + smoked on staging only (uncommitted, held for operator review); prod untouched. Next gates: (1) commit the P1–P6 batch, (2) deploy P1–P6 to new-prod, (3) operator fills `Tools - Set Tracking Mode.xlsx`, (4) run `scripts/apply_tool_modes.py --db newprod --apply`. Supersedes the two-entry model + absorbs the per-category tool-selling feature (2026-08-30, on staging).

**Why:** Operators sell some tools in bulk (Trading) while tracking the *same* tool by serial in Maintenance custody. Today `tool_tracking_mode` lives on the **category**, so "one tool, two modes" forces two catalog records — which reads as duplication. Moving the mode to **(item × division)** removes the duplication.

---

## The model

- **Mode is per `(item, division)`.** A new nullable column `inventory_item_divisions.tool_tracking_mode` (`'bulk' | 'serialized' | NULL`). NULL = inherit the category's mode (back-compat).
- **Effective mode** in a division = `item_division.tool_tracking_mode` ?? `category.tool_tracking_mode`. A helper `tool_effective_mode(item_id, division_id)` centralizes this.
- **One item holds BOTH stock types, division-scoped and non-overlapping:**
  - In a **bulk** division → `fifo_cost_layers` (qty) in that division's sub-containers (exactly as bulk tools work today).
  - In a **serialized** division → `tool_asset_units` (each carries `division_id`) (exactly as serialized tools work today).
  - These never overlap: a given `(item, division)` is one mode, so it has qty **or** units, never both.
- **Category mode** becomes the **default** for new item-division rows and the fallback for NULLs — existing tools keep working unchanged (every item-division inherits its category's current mode → zero behavior change until an override is set).

**Invariants**
- Each `(item, division)` has exactly one effective mode.
- Bulk `(item, division)` → qty only; Serialized `(item, division)` → units only.
- The catalog shows each item once; the *row* reveals per-division modes.

---

## Touchpoints (what changes)

| Area | Today (per category) | New (per item-division) |
|---|---|---|
| **Schema** | `inventory_categories.tool_tracking_mode` | + `inventory_item_divisions.tool_tracking_mode` (nullable) + `tool_effective_mode()` helper |
| **SO picker** (`useCascadeAccessibleItems`) | tools filtered to category `bulk` + owned stock | offer an item **in a division** where its effective mode is `bulk` **and** it has qty there |
| **Custody / serial units** | serialized categories only | show an item **in a division** where its effective mode is `serialized` |
| **Receival** (`create_tool_units_on_receival_layer`) | spawns units iff category serialized | spawns units iff the `(item, division)` of the receival is serialized; else the FIFO layer is the stock |
| **Guard** (`guard_tool_tracking_mode_switch`) | blocks category switch while it holds stock | + block switching an `(item, division)` mode while that division holds its stock (qty or units) |
| **Catalog display** (`ToolCategoryRow` / `BulkToolItemRow` / `ToolItemRow`) | one chip per category; item rendered by category mode | item row shows **per-division** modes + stock (e.g. `Trading · ▤ Bulk 12` · `Maintenance · # Serial 2`); expand reveals qty for bulk divisions and serial units for serialized divisions |
| **Chips** (`ToolModeBadge`) | category chip | reused per-division on the item row |

---

## Catalog UI (how it looks — no duplication)

```
TOOL / ASSET                     INFO
▸  Power Tools
   ▸ ● Cordless Drill            ▤ Bulk · 12 (Trading)   # Serial · 2 (Maintenance)
        └ expand →
            Bulk stock            Trading  · 12 on hand · [Sell]
            Serial units          Maintenance · DRILL-0001 (Available) · DRILL-0002 (Available)
```

One row. One item. Two modes shown inline by division. No second entry, no duplicate name.

---

## Phased rollout (each phase shipped + smoked on staging before the next)

- **Phase 1 — Schema + resolution (no behavior change).** ✅ DONE (staging). `inventory_item_divisions.tool_tracking_mode` + `tool_effective_mode()`; NULL inherits category. Migration `20260831001400`.
- **Phase 2 — Catalog display.** ✅ DONE (staging). `PerDivisionToolItemRow` renders per-division modes/stock inline + summary on expand. RPC `get_tool_item_division_modes` (migration `20260831001500`), hook `useToolPerDivisionModes`.
- **Phase 3 — SO picker per-division bulk.** ✅ DONE (staging). Offer an item in a division where it's bulk + has qty. RPC `tool_bulk_items_in_division` (migration `20260831001600`); `useCascadeAccessibleItems` intersects owned stock with the bulk-in-active-division set.
- **Phase 4 — Custody per-division serialized.** ✅ DONE (staging). The per-division catalog row surfaces the item's serial units (view / add / auto-generate / edit / transfer) via the shared `ToolUnitRows` when any division is serialized. Custody assign/move/return + the four read RPCs were already unit-driven (no category gate) — verified against the live bodies, so they surface & assign per-division units unchanged. No migration needed.
- **Phase 5 — Receival routing + guard.** ✅ DONE (staging). Migration `20260831001700`. (a) `create_tool_units_on_receival_layer` now routes by `tool_effective_mode(item, receival-division)` — serialized ⇒ units (scoped to that division when it's a per-division override; NULL for a plain serialized category, unchanged), bulk ⇒ qty/FIFO. (b) new `guard_item_division_tracking_mode_switch` trigger blocks flipping a `(item,division)` override while that division holds stock. (c) new `guard_tool_unit_serialized_division` trigger enforces the qty-xor-units invariant (a serial unit can't live in a bulk `(item,division)`). Proven via 6 rolled-back DB probes + a regression probe (serialized-category unchanged) + a UI check of guard (c).
- **Phase 6 — Set-mode intake.** ✅ DONE (staging). Script [`scripts/apply_tool_modes.py`](../../scripts/apply_tool_modes.py) reads the filled `Tools - Set Tracking Mode.xlsx`, resolves each (Category Path, Item Name, Division) → ids, and UPSERTs `inventory_item_divisions.tool_tracking_mode` — writing an override only when the desired mode differs from the item's category default (a match inherits, NULL), pre-checking on-hand stock, and auto-applying Trading = bulk for every tool held in Trading. Dry-run by default; `--apply` commits; `--apply --rollback` exercises the full write path for verification. Migration `20260831001800` extends the Phase-5 switch guard to `BEFORE INSERT OR UPDATE` (TG_OP-aware) so the intake's UPSERT-INSERT path is transactionally guarded too. Tested on staging: dry-run over the real file, apply+rollback over a synthetic file covering insert / update / skip-stock / nochange / invalid / unresolved, plus direct guard-backstop probes (INSERT-flip blocked, normal NULL-mode assignment allowed).

The operator's Excel feeds Phase 6 directly — no rework.

---

## Risks / notes
- **Blast radius** is the whole tools surface (display, picker, custody, receival, guard). Phasing + staging smoke per phase is mandatory; prod untouched until all green.
- **Back-compat:** NULL-inherits-category means every existing tool behaves exactly as today until an override is set — no regression for current serialized or bulk tools.
- **Category chip** on a category whose items have mixed per-division modes becomes informational only (the truth moves to the item row).
- The per-category tool-selling code already built (bulk-sellable SO + chip, staging) is the seed for Phases 2–3.
- Verification: `tsc` + rolled-back staging probes per phase + operator smoke of the catalog view, a bulk sale, and a serial custody assignment for the **same** item.
