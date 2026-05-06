# Warehouse Stock Hover Tooltip — Design Spec

**Date:** 2026-05-05  
**Branch:** feature/warehouses  
**Status:** Approved

---

## Goal

When a user hovers over the ATP (available-to-promise) stock number in a brand variant row, show a tooltip breaking down stock per warehouse. This lets users quickly see where inventory is physically located without opening the edit dialog.

---

## Architecture

### Shared hook

`useVariantWarehouseStock(variantId, enabled?)` is extracted from `BrandVariantEditDialog.tsx` into `src/hooks/useInventory.ts`. It queries `fifo_cost_layers` for all rows with `remaining_qty > 0` belonging to the variant, then aggregates:

- `perWarehouse: { warehouse_id, qty }[]` — grouped by non-null `warehouse_id`
- `unassigned: number` — sum of rows where `warehouse_id` is null

The query is only fired when `enabled` is `true` (default `true` to preserve existing behaviour in the edit dialog, but the tooltip passes `enabled: open`).

### New component: `WarehouseStockTooltip`

Defined inline in `src/components/services/inventory/BrandVariantRow.tsx`.

```
<WarehouseStockTooltip variantId={variant.id}>
  <AtpBadge ... />
</WarehouseStockTooltip>
```

Behaviour:
- Tracks `open` state from Radix `Tooltip.Root`.
- Passes `enabled: open` to `useVariantWarehouseStock` — **no network request until hover**.
- Also calls `useWarehouses()` (already cached globally) to resolve IDs → names.
- Tooltip content renders a compact table:

```
Main Warehouse      20
Secondary Warehouse  5
Unassigned           2
────────────────────
Total               27
```

- While loading (first hover), renders a small loading indicator. The tooltip container has a fixed `min-w-[160px]` and the loading state occupies the same vertical space as a single row, preventing size jitter when data arrives.
- The content area uses `max-h-60 overflow-y-auto` so that variants spread across many warehouses don't produce an unusably tall tooltip.
- If only one warehouse and no unassigned stock, still shows the breakdown (consistent behaviour, avoids conditional tooltip logic).
- If no warehouse data at all (stock is 0 or query returns empty), the tooltip is suppressed — the badge already shows 0.

### BrandVariantRow changes

- Wraps existing `<AtpBadge>` with `<WarehouseStockTooltip variantId={variant.id}>`.
- No other changes to row logic.

### BrandVariantEditDialog changes

- Removes its local `useVariantWarehouseStock` definition.
- Imports the shared hook from `useInventory`.

---

## Data flow

```
BrandVariantRow renders
  └─ WarehouseStockTooltip (open=false, enabled=false → no query)
       └─ AtpBadge [user hovers]
            └─ open=true → enabled=true
                 └─ useVariantWarehouseStock fires
                      └─ fifo_cost_layers query (cached 30s)
                 └─ useWarehouses (already cached)
                 └─ TooltipContent renders breakdown
```

---

## Components / files changed

| File | Change |
|---|---|
| `src/hooks/useInventory.ts` | Export `useVariantWarehouseStock` |
| `src/components/services/inventory/BrandVariantRow.tsx` | Add `WarehouseStockTooltip`, wrap `AtpBadge` |
| `src/components/services/inventory/BrandVariantEditDialog.tsx` | Remove local hook, import shared one |

---

## Out of scope

- Item-level stock badge (`StockBadge` in `ItemRow.tsx`) — aggregates across all variants; warehouse breakdown at that level is ambiguous. Not included.
- Damaged stock breakdown per warehouse — not part of this request.
