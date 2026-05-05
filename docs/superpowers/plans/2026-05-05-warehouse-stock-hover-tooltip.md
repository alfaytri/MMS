# Warehouse Stock Hover Tooltip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a per-warehouse stock breakdown tooltip when the user hovers the ATP badge on a brand variant row.

**Architecture:** Extract the existing `useVariantWarehouseStock` query from `BrandVariantEditDialog` into `useInventory.ts`, then add a `WarehouseStockTooltip` wrapper component inside `BrandVariantRow` that fetches lazily (`enabled: open`) and renders a compact breakdown table using the Radix `Tooltip` primitives already in the project.

**Tech Stack:** React, TanStack Query, Radix UI Tooltip (`@/components/ui/tooltip`), Tailwind CSS, Supabase client

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/hooks/useInventory.ts` | Modify | Export shared `useVariantWarehouseStock` hook (moved from edit dialog) |
| `src/components/services/inventory/BrandVariantEditDialog.tsx` | Modify | Remove local hook definition, import shared one |
| `src/components/services/inventory/BrandVariantRow.tsx` | Modify | Add `WarehouseStockTooltip` component, wrap `AtpBadge` |

---

## Task 1: Export `useVariantWarehouseStock` from `useInventory.ts`

**Files:**
- Modify: `src/hooks/useInventory.ts` (after the `useFifoLayers` function, around line 480)

The hook queries `fifo_cost_layers` directly, grouping remaining stock by `warehouse_id`. Rows with a `null` warehouse_id are summed into an `unassigned` bucket. The `enabled` parameter lets callers gate the network request (used by the tooltip to fetch only on hover).

- [ ] **Step 1: Insert the hook after `useFifoLayers` in `useInventory.ts`**

Find the line `// ─── Tool asset hooks ───` (around line 482) and insert the following block **above** it:

```typescript
// ─── Per-warehouse stock breakdown ────────────────────────────────────────────

export type WarehouseStockRow = { warehouse_id: string; qty: number }
export type VariantWarehouseStock = { perWarehouse: WarehouseStockRow[]; unassigned: number }

export function useVariantWarehouseStock(variantId: string | undefined, enabled = true) {
  return useQuery<VariantWarehouseStock>({
    queryKey: ['variant_warehouse_stock', variantId],
    queryFn: async () => {
      if (!variantId) return { perWarehouse: [], unassigned: 0 }
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('fifo_cost_layers')
        .select('warehouse_id, remaining_qty')
        .eq('brand_variant_id', variantId)
        .gt('remaining_qty', 0)
      if (error) throw error

      const whMap = new Map<string, number>()
      let unassigned = 0
      for (const row of (data ?? []) as { warehouse_id: string | null; remaining_qty: number }[]) {
        if (!row.warehouse_id) {
          unassigned += row.remaining_qty
        } else {
          whMap.set(row.warehouse_id, (whMap.get(row.warehouse_id) ?? 0) + row.remaining_qty)
        }
      }

      return {
        perWarehouse: Array.from(whMap.entries()).map(([warehouse_id, qty]) => ({ warehouse_id, qty })),
        unassigned,
      }
    },
    enabled: !!variantId && enabled,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to `useVariantWarehouseStock`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useInventory.ts
git commit -m "$(cat <<'EOF'
feat(inventory): export useVariantWarehouseStock from useInventory

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Remove local hook from `BrandVariantEditDialog` and import shared one

**Files:**
- Modify: `src/components/services/inventory/BrandVariantEditDialog.tsx`

- [ ] **Step 1: Delete the local hook definition**

In `BrandVariantEditDialog.tsx`, remove lines 22–55 (the entire `/** Per-warehouse qty + unassigned count from fifo_cost_layers directly */` comment through the closing `}` of `useVariantWarehouseStock`).

The block to remove looks exactly like this:

```typescript
/** Per-warehouse qty + unassigned count from fifo_cost_layers directly */
function useVariantWarehouseStock(variantId: string | undefined) {
  return useQuery({
    queryKey: ['variant_warehouse_stock', variantId],
    queryFn: async () => {
      if (!variantId) return { perWarehouse: [] as { warehouse_id: string; qty: number }[], unassigned: 0 }
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('fifo_cost_layers')
        .select('warehouse_id, remaining_qty')
        .eq('brand_variant_id', variantId)
        .gt('remaining_qty', 0)
      if (error) throw error

      // Aggregate per warehouse + unassigned
      const whMap = new Map<string, number>()
      let unassigned = 0
      for (const row of (data ?? []) as { warehouse_id: string | null; remaining_qty: number }[]) {
        if (!row.warehouse_id) {
          unassigned += row.remaining_qty
        } else {
          whMap.set(row.warehouse_id, (whMap.get(row.warehouse_id) ?? 0) + row.remaining_qty)
        }
      }

      const perWarehouse = Array.from(whMap.entries()).map(([warehouse_id, qty]) => ({ warehouse_id, qty }))
      return { perWarehouse, unassigned }
    },
    enabled: !!variantId,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 2: Add import of shared hook**

In the existing import from `@/hooks/useInventory` (line ~10), add `useVariantWarehouseStock`:

```typescript
import { useCreateBrandVariant, useUpdateBrandVariant, useVariantWarehouseStock, type BrandVariant } from '@/hooks/useInventory'
```

Also remove the `useQuery` import from `@tanstack/react-query` in this file **only if** it is no longer used after removing the local hook. Check line ~13 — if `useQuery` no longer appears elsewhere in the file, remove it from that import line. `useQueryClient` is still used so keep that.

- [ ] **Step 3: Verify TypeScript compiles and behaviour is unchanged**

```bash
npx tsc --noEmit
```

Expected: no errors. The edit dialog warehouse stock display should work identically — the shared hook has the same query key, same stale time, same return shape.

- [ ] **Step 4: Commit**

```bash
git add src/components/services/inventory/BrandVariantEditDialog.tsx
git commit -m "$(cat <<'EOF'
refactor(inventory): use shared useVariantWarehouseStock in edit dialog

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `WarehouseStockTooltip` and wrap `AtpBadge` in `BrandVariantRow`

**Files:**
- Modify: `src/components/services/inventory/BrandVariantRow.tsx`

- [ ] **Step 1: Add new imports at the top of the file**

Add to the existing import block:

```typescript
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useVariantWarehouseStock } from '@/hooks/useInventory'
```

- [ ] **Step 2: Add the `WarehouseStockTooltip` component**

Insert this component **below** the existing `AtpBadge` function (after line 39, before `export function BrandVariantRow`):

```typescript
function WarehouseStockTooltip({
  variantId,
  disabled,
  children,
}: {
  variantId: string
  disabled: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { data: warehouses = [] } = useWarehouses()
  const { data: whStock, isLoading } = useVariantWarehouseStock(variantId, open && !disabled)

  if (disabled) return <>{children}</>

  const rows = whStock?.perWarehouse ?? []
  const unassigned = whStock?.unassigned ?? 0
  const total = rows.reduce((s, r) => s + r.qty, 0) + unassigned

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="top" className="p-0">
          <div className="min-w-[160px] max-h-60 overflow-y-auto px-3 py-2 text-xs">
            {isLoading ? (
              <div className="py-0.5 opacity-70">Loading…</div>
            ) : total === 0 ? (
              <div className="py-0.5 opacity-70">No stock data</div>
            ) : (
              <>
                {rows.map((r) => {
                  const wh = warehouses.find((w) => w.id === r.warehouse_id)
                  return (
                    <div key={r.warehouse_id} className="flex justify-between gap-4 py-0.5">
                      <span>{wh?.name ?? 'Unknown'}</span>
                      <span className="font-medium tabular-nums">{r.qty}</span>
                    </div>
                  )
                })}
                {unassigned > 0 && (
                  <div className="flex justify-between gap-4 py-0.5 opacity-70">
                    <span>Unassigned</span>
                    <span className="font-medium tabular-nums">{unassigned}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4 pt-1 mt-0.5 border-t border-primary-foreground/20">
                  <span>Total</span>
                  <span className="font-medium tabular-nums">{total}</span>
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

- [ ] **Step 3: Wrap `AtpBadge` with `WarehouseStockTooltip`**

In `BrandVariantRow`, find the cell that renders `<AtpBadge>` (currently line ~97):

```typescript
<AtpBadge stockLevel={stockLevel} reservedQty={reservedQty} reorderPoint={reorderPoint} />
```

Replace it with:

```typescript
<WarehouseStockTooltip variantId={variant.id} disabled={stockLevel <= 0}>
  <AtpBadge stockLevel={stockLevel} reservedQty={reservedQty} reorderPoint={reorderPoint} />
</WarehouseStockTooltip>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Start the dev server and navigate to Inventory → Products (Installation).

1. Expand any item that has stock > 0 (e.g. "3.0 Ton - Inverter - R410" with GREE showing 27).
2. Hover the green ATP badge (the number).
3. **Expected:** A tooltip appears showing warehouse rows + Total. Total must equal the badge number.
4. Move the mouse away.
5. **Expected:** Tooltip closes.
6. Hover again immediately (within 30 s).
7. **Expected:** Tooltip appears instantly with no loading flash (TanStack Query cache hit).
8. Expand an item with 0 stock and hover its red "0 available" badge.
9. **Expected:** No tooltip appears.

- [ ] **Step 6: Commit**

```bash
git add src/components/services/inventory/BrandVariantRow.tsx
git commit -m "$(cat <<'EOF'
feat(inventory): show per-warehouse stock breakdown on ATP badge hover

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ Lazy fetch on hover (`enabled: open && !disabled`) — Task 3 Step 2
- ✅ `min-w-[160px]` to prevent jitter — Task 3 Step 2 (`min-w-[160px]`)
- ✅ `max-h-60 overflow-y-auto` for many warehouses — Task 3 Step 2
- ✅ Loading state while fetching — Task 3 Step 2 (`isLoading` branch)
- ✅ Unassigned bucket — Task 1 Step 1 aggregation + Task 3 Step 2 row
- ✅ Total row always matches ATP — Task 3 Step 2 total calculation
- ✅ Tooltip suppressed when stock = 0 — `disabled={stockLevel <= 0}` in Task 3 Step 3
- ✅ Shared hook extracted — Task 1
- ✅ Edit dialog updated to shared hook — Task 2
- ✅ Warehouse names resolved via `useWarehouses()` — Task 3 Step 2

**Placeholder scan:** None found.

**Type consistency:**
- `useVariantWarehouseStock` defined in Task 1, imported in Task 2 and Task 3 — same name throughout.
- Return shape `{ perWarehouse: WarehouseStockRow[], unassigned: number }` used consistently in Task 3.
- `disabled` prop on `WarehouseStockTooltip` is boolean — passed as `stockLevel <= 0` (boolean expression) ✅.
