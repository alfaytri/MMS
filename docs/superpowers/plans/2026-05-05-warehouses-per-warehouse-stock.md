# Per-Warehouse Stock Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose per-warehouse stock numbers, values, and transfer-validation by building a DB view over the existing FIFO cost layers, wiring it into hooks, and upgrading the Warehouses hub UI.

**Architecture:** A non-materialized Postgres view (`warehouse_stock_view`) aggregates `fifo_cost_layers` by `(warehouse_id, brand_variant_id)`. A trigger on `fifo_cost_layers` keeps `warehouses.item_count` and `warehouses.total_value` accurate. The UI consumes the view via updated/new hooks; no data is duplicated.

**Tech Stack:** Supabase (Postgres, CLI migrations), TanStack Query v5, Next.js 15 App Router, shadcn/ui, TypeScript

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/20260505000003_warehouse_stock_view_and_trigger.sql` |
| Modify | `src/hooks/useWarehouseOperations.ts` — update `WarehouseStockItem` type + `useWarehouseStock` query; add `useWarehouseStockSummary` |
| Modify | `src/components/purchase/wh/WhWarehousesTab.tsx` — "View Stock →" button + value comparison bar |
| Modify | `src/components/purchase/wh/WhStockOverviewTab.tsx` — warehouse filter dropdown + clear pill + URL pre-selection |
| Modify | `src/components/purchase/wh/WhTransferDialog.tsx` — item picker + per-row stock validation |
| Modify | `src/app/(dashboard)/purchase/warehouses/page.tsx` — pass `initialWarehouseId` from URL param |

---

## Task 1: DB Migration — view, trigger, backfill

**Files:**
- Create: `supabase/migrations/20260505000003_warehouse_stock_view_and_trigger.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260505000003_warehouse_stock_view_and_trigger.sql

-- 1. View: per-warehouse stock aggregated from FIFO layers
CREATE OR REPLACE VIEW warehouse_stock_view AS
SELECT
  f.warehouse_id,
  f.brand_variant_id,
  ibv.item_name,
  ibv.brand,
  ibv.sku,
  ibv.unit,
  SUM(f.remaining_qty)                                                        AS qty,
  CASE
    WHEN SUM(f.remaining_qty) > 0
      THEN SUM(f.remaining_qty * f.total_unit_cost) / SUM(f.remaining_qty)
    ELSE 0
  END                                                                         AS avg_cost,
  SUM(f.remaining_qty * f.total_unit_cost)                                    AS total_value
FROM   fifo_cost_layers f
JOIN   inventory_brand_variants ibv ON ibv.id = f.brand_variant_id
WHERE  f.remaining_qty > 0
  AND  f.warehouse_id IS NOT NULL
GROUP BY f.warehouse_id, f.brand_variant_id,
         ibv.item_name, ibv.brand, ibv.sku, ibv.unit;

-- 2. Grant read access
GRANT SELECT ON warehouse_stock_view TO authenticated;

-- 3. Trigger function: keep warehouses.item_count + total_value accurate
-- Handles the case where a FIFO row moves from one warehouse to another (e.g. manual correction):
-- COALESCE(NEW, OLD) would only refresh one side, leaving the source warehouse stale.
-- So when warehouse_id changes on UPDATE, both old and new are refreshed.
CREATE OR REPLACE FUNCTION fn_refresh_warehouse_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wh_id UUID;
BEGIN
  -- When a row moves from warehouse A → warehouse B, refresh BOTH sides
  IF (TG_OP = 'UPDATE') AND (OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id) THEN
    IF OLD.warehouse_id IS NOT NULL THEN
      UPDATE warehouses SET
        item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                       WHERE warehouse_id = OLD.warehouse_id AND remaining_qty > 0),
        total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                       WHERE warehouse_id = OLD.warehouse_id AND remaining_qty > 0),
        updated_at  = now()
      WHERE id = OLD.warehouse_id;
    END IF;
    IF NEW.warehouse_id IS NOT NULL THEN
      UPDATE warehouses SET
        item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                       WHERE warehouse_id = NEW.warehouse_id AND remaining_qty > 0),
        total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                       WHERE warehouse_id = NEW.warehouse_id AND remaining_qty > 0),
        updated_at  = now()
      WHERE id = NEW.warehouse_id;
    END IF;
    RETURN NULL;
  END IF;

  -- Normal case: INSERT, DELETE, or UPDATE where warehouse_id did not change
  v_wh_id := COALESCE(NEW.warehouse_id, OLD.warehouse_id);
  IF v_wh_id IS NULL THEN RETURN NULL; END IF;

  UPDATE warehouses SET
    item_count  = (SELECT COUNT(DISTINCT brand_variant_id) FROM fifo_cost_layers
                   WHERE warehouse_id = v_wh_id AND remaining_qty > 0),
    total_value = (SELECT COALESCE(SUM(remaining_qty * total_unit_cost), 0) FROM fifo_cost_layers
                   WHERE warehouse_id = v_wh_id AND remaining_qty > 0),
    updated_at  = now()
  WHERE id = v_wh_id;

  RETURN NULL;
END;
$$;

-- 4. Attach trigger (guard against re-run)
DROP TRIGGER IF EXISTS trg_warehouse_stats ON fifo_cost_layers;
CREATE TRIGGER trg_warehouse_stats
AFTER INSERT OR UPDATE OR DELETE ON fifo_cost_layers
FOR EACH ROW EXECUTE FUNCTION fn_refresh_warehouse_stats();

-- 5. Transfer number sequence — prevents collisions from Math.random() in a multi-user environment
CREATE SEQUENCE IF NOT EXISTS warehouse_transfer_seq START 1;

CREATE OR REPLACE FUNCTION generate_transfer_number()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'WT-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('warehouse_transfer_seq')::TEXT, 5, '0')
$$;

GRANT EXECUTE ON FUNCTION generate_transfer_number() TO authenticated;

-- 6. Backfill: fire trigger for every existing FIFO row to populate item_count/total_value
UPDATE fifo_cost_layers
SET remaining_qty = remaining_qty
WHERE warehouse_id IS NOT NULL;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output: `Applying migration 20260505000003_warehouse_stock_view_and_trigger.sql... OK`

- [ ] **Step 3: Verify view and trigger exist**

```bash
npx supabase db push --dry-run
```

Expected: `Remote database is up to date.`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260505000003_warehouse_stock_view_and_trigger.sql
git commit -m "$(cat <<'EOF'
feat(db): add warehouse_stock_view and trg_warehouse_stats trigger

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update useWarehouseStock hook + WarehouseStockItem type

**Files:**
- Modify: `src/hooks/useWarehouseOperations.ts` (lines 30–38 type, lines 175–199 hook)
- Modify: `src/components/purchase/wh/WhStockOverviewTab.tsx` (field name references)

The current `WarehouseStockItem` uses `stock_level` and `average_cost` (from `inventory_brand_variants`). The view uses `qty` and `avg_cost`. Update the type and query, then fix the two reference sites in `WhStockOverviewTab`.

- [ ] **Step 1: Update `WarehouseStockItem` type in `useWarehouseOperations.ts`**

Replace lines 30–38:

```typescript
export type WarehouseStockItem = {
  warehouse_id: string
  brand_variant_id: string
  item_name: string
  brand: string | null
  sku: string | null
  unit: string
  qty: number
  avg_cost: number
  total_value: number
}
```

- [ ] **Step 2: Replace `useWarehouseStock` query in `useWarehouseOperations.ts`**

Replace lines 175–199:

```typescript
export function useWarehouseStock(warehouseId?: string) {
  return useQuery({
    queryKey: ['warehouse_stock', warehouseId],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('warehouse_stock_view')
        .select('warehouse_id, brand_variant_id, item_name, brand, sku, unit, qty, avg_cost, total_value')
        .order('item_name', { ascending: true })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WarehouseStockItem[]
    },
    staleTime: 5 * 60 * 1000,
    enabled: warehouseId !== null,
  })
}
```

- [ ] **Step 3: Fix `WhStockOverviewTab.tsx` field references**

In `WhStockOverviewTab.tsx`, update three lines that reference the old field names.

Replace line 32 (totalQty computation):
```typescript
  const totalQty = useMemo(() => filtered.reduce((sum, s) => sum + (s.qty ?? 0), 0), [filtered])
```

Replace line 33 (totalValue computation):
```typescript
  const totalValue = useMemo(() => filtered.reduce((sum, s) => sum + (s.total_value ?? 0), 0), [filtered])
```

Replace the table row in the company view (lines 98–106):
```tsx
                  <TableRow key={s.brand_variant_id}>
                    <TableCell className="text-xs font-medium">{s.item_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.brand ?? '—'}</TableCell>
                    <TableCell className="text-xs text-primary">{s.sku ?? '—'}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{s.qty ?? 0}</TableCell>
                    <TableCell className="text-xs text-right">{(s.avg_cost ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-xs text-right">{(s.total_value ?? 0).toFixed(2)}</TableCell>
                  </TableRow>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `WarehouseStockItem`, `stock_level`, or `average_cost`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWarehouseOperations.ts src/components/purchase/wh/WhStockOverviewTab.tsx
git commit -m "$(cat <<'EOF'
feat(warehouses): update useWarehouseStock to query warehouse_stock_view

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add useWarehouseStockSummary hook

**Files:**
- Modify: `src/hooks/useWarehouseOperations.ts` (add after `useWarehouseStock`)

This hook is used exclusively by the transfer dialog for per-row validation. It returns a memoized `Map<brand_variant_id, qty>` so lookups are O(1) and the Map is not rebuilt on every re-render.

- [ ] **Step 1: Add `useWarehouseStockSummary` in `useWarehouseOperations.ts` after line 199**

```typescript
export function useWarehouseStockSummary(warehouseId: string | null): {
  data: Map<string, number>
  isLoading: boolean
} {
  const { data: items = [], isLoading } = useWarehouseStock(warehouseId ?? undefined)
  const data = useMemo(
    () => new Map(items.map((item) => [item.brand_variant_id, item.qty])),
    [items]
  )
  return { data, isLoading }
}
```

- [ ] **Step 2: Add `useMemo` to imports at top of `useWarehouseOperations.ts`**

The file currently imports from `@tanstack/react-query` only. Add `useMemo` from React:

```typescript
import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useWarehouseOperations.ts
git commit -m "$(cat <<'EOF'
feat(warehouses): add useWarehouseStockSummary hook with memoized Map

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update WhWarehousesTab — "View Stock →" button + value comparison bar

**Files:**
- Modify: `src/components/purchase/wh/WhWarehousesTab.tsx`

Adds two features:
1. A "View Stock →" ghost button in each card footer, navigating to `?tab=stock&warehouse=<id>`
2. A value comparison bar below the grid — proportional segments per warehouse, clickable, with tooltip showing exact value + item count

The bar is implemented with plain `div` elements (relative/absolute positioned) — no charting library needed.

- [ ] **Step 1: Rewrite `WhWarehousesTab.tsx`**

```tsx
'use client'

import React, { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WarehouseIcon, MapPin, User, Package, DollarSign, ArrowRight } from 'lucide-react'
import { Warehouse } from '@/hooks/useWarehouses'

interface Props {
  warehouses: Warehouse[]
}

export const WhWarehousesTab = React.memo(function WhWarehousesTab({ warehouses }: Props) {
  const router = useRouter()

  const totalValue = useMemo(
    () => warehouses.reduce((sum, wh) => sum + (wh.total_value ?? 0), 0),
    [warehouses]
  )

  function viewStock(warehouseId: string) {
    router.replace(`/purchase/warehouses?tab=stock&warehouse=${warehouseId}`, { scroll: false })
  }

  if (warehouses.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground text-center">
          No warehouses configured. Add warehouses in Admin Settings.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Warehouse cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map((wh) => (
          <Card key={wh.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <WarehouseIcon className="h-4 w-4 text-primary" />
                {wh.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {wh.location ?? 'No location set'}
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="text-muted-foreground">Manager:</span>
                <span className="font-medium text-foreground">{wh.manager_name ?? 'Unassigned'}</span>
              </div>
              <div className="pt-2 border-t flex justify-between items-center">
                <div className="flex items-center gap-1 text-xs">
                  <Package className="h-3.5 w-3.5 text-primary" />
                  {(wh.item_count ?? 0).toLocaleString()} items
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <DollarSign className="h-3.5 w-3.5 text-success" />
                  QR {(wh.total_value ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs w-full justify-end gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => viewStock(wh.id)}
                >
                  View Stock
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Value comparison bar */}
      {warehouses.length > 1 && totalValue > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Stock Value by Warehouse</p>
          <TooltipProvider delayDuration={200}>
            <div className="flex h-8 rounded-md overflow-hidden border border-border">
              {warehouses
                .filter((wh) => (wh.total_value ?? 0) > 0)
                .map((wh, idx) => {
                  const pct = totalValue > 0 ? ((wh.total_value ?? 0) / totalValue) * 100 : 0
                  const colors = [
                    'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
                    'bg-violet-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
                    'bg-indigo-500', 'bg-pink-500', 'bg-lime-500', 'bg-sky-500',
                  ]
                  const color = colors[idx % colors.length]
                  return (
                    <Tooltip key={wh.id}>
                      <TooltipTrigger asChild>
                        <button
                          className={`${color} h-full flex items-center justify-center cursor-pointer hover:brightness-110 transition-all overflow-hidden`}
                          style={{ width: `${pct}%`, minWidth: pct > 0 ? '2px' : '0' }}
                          onClick={() => viewStock(wh.id)}
                          aria-label={`View ${wh.name} stock`}
                        >
                          {pct > 8 && (
                            <span className="text-[10px] font-medium text-white px-1 truncate">
                              {wh.name}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <p className="font-medium">{wh.name}</p>
                        <p>QR {(wh.total_value ?? 0).toLocaleString()} · {(wh.item_count ?? 0).toLocaleString()} items</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
            </div>
          </TooltipProvider>
          <div className="flex flex-wrap gap-3">
            {warehouses
              .filter((wh) => (wh.total_value ?? 0) > 0)
              .map((wh, idx) => {
                const colors = [
                  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
                  'bg-violet-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
                  'bg-indigo-500', 'bg-pink-500', 'bg-lime-500', 'bg-sky-500',
                ]
                const color = colors[idx % colors.length]
                return (
                  <div key={wh.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={`w-2.5 h-2.5 rounded-sm inline-block ${color}`} />
                    {wh.name}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
})
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhWarehousesTab.tsx
git commit -m "$(cat <<'EOF'
feat(warehouses): add View Stock button and value comparison bar to WhWarehousesTab

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update WhStockOverviewTab — warehouse filter, clear pill, URL param

**Files:**
- Modify: `src/components/purchase/wh/WhStockOverviewTab.tsx`
- Modify: `src/app/(dashboard)/purchase/warehouses/page.tsx` (pass `initialWarehouseId`)

Replaces the company/warehouse toggle with a warehouse `<Select>` (defaulting to All Warehouses). When a warehouse is selected, filters all data + summary cards to that scope. Shows a clear pill. Accepts `initialWarehouseId` prop for URL pre-selection from the "View Stock →" button.

- [ ] **Step 1: Update `WhStockOverviewTab.tsx` to accept `initialWarehouseId` and add warehouse filter**

```tsx
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Layers, Package, DollarSign, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'

interface Props {
  warehouses: Warehouse[]
  initialWarehouseId?: string
}

export const WhStockOverviewTab = React.memo(function WhStockOverviewTab({
  warehouses,
  initialWarehouseId,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>(
    initialWarehouseId
  )

  // Sync if URL param changes (e.g. browser back/forward)
  useEffect(() => {
    setSelectedWarehouseId(initialWarehouseId)
  }, [initialWarehouseId])

  const { data: allStock = [] } = useWarehouseStock(selectedWarehouseId)

  const filtered = useMemo(() => {
    if (!search) return allStock
    const q = search.toLowerCase()
    return allStock.filter(
      (s) =>
        s.item_name?.toLowerCase().includes(q) ||
        (s.brand ?? '').toLowerCase().includes(q) ||
        (s.sku ?? '').toLowerCase().includes(q)
    )
  }, [allStock, search])

  const totalItems = filtered.length
  const totalQty = useMemo(() => filtered.reduce((sum, s) => sum + (s.qty ?? 0), 0), [filtered])
  const totalValue = useMemo(
    () => filtered.reduce((sum, s) => sum + (s.total_value ?? 0), 0),
    [filtered]
  )

  const selectedWarehouse = warehouses.find((w) => w.id === selectedWarehouseId)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Summary mini-cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Layers className="h-4 w-4 text-primary" />, label: 'Total Items', value: totalItems.toLocaleString() },
          { icon: <Package className="h-4 w-4 text-primary" />, label: 'Total Qty', value: totalQty.toLocaleString() },
          {
            icon: <DollarSign className="h-4 w-4 text-success" />,
            label: 'Total Value',
            value: `QR ${totalValue.toFixed(2)}`,
          },
        ].map((card) => (
          <div key={card.label} className="p-3 rounded-md border flex items-center gap-2">
            {card.icon}
            <div>
              <p className="text-[10px] text-muted-foreground">{card.label}</p>
              <p className="text-sm font-semibold">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={selectedWarehouseId ?? '__all__'}
          onValueChange={(v) => setSelectedWarehouseId(v === '__all__' ? undefined : v)}
        >
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map((wh) => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">
                {wh.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedWarehouse && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs border border-primary/20">
            <span>Viewing: {selectedWarehouse.name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 text-primary hover:bg-transparent"
              onClick={() => setSelectedWarehouseId(undefined)}
              aria-label="Clear warehouse filter"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Stock table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Item</TableHead>
              <TableHead className="text-xs">Brand</TableHead>
              <TableHead className="text-xs">SKU</TableHead>
              <TableHead className="text-xs text-right">Stock</TableHead>
              <TableHead className="text-xs text-right">Avg Cost</TableHead>
              <TableHead className="text-xs text-right">Value (QR)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">
                  {selectedWarehouse
                    ? `No stock in ${selectedWarehouse.name}`
                    : 'No stock data'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={`${s.warehouse_id}-${s.brand_variant_id}`}>
                  <TableCell className="text-xs font-medium">{s.item_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.brand ?? '—'}</TableCell>
                  <TableCell className="text-xs text-primary">{s.sku ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{s.qty ?? 0}</TableCell>
                  <TableCell className="text-xs text-right">{(s.avg_cost ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right">{(s.total_value ?? 0).toFixed(2)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
})
```

- [ ] **Step 2: Update `page.tsx` to pass `initialWarehouseId` to `WhStockOverviewTab`**

In `src/app/(dashboard)/purchase/warehouses/page.tsx`, update the `WhStockOverviewTab` usage in `WarehousesPageInner`.

Add `warehouseParam` derived from `searchParams`:
```tsx
  const warehouseParam = searchParams.get('warehouse') ?? undefined
```

Update the TabsContent for stock:
```tsx
          <TabsContent value="stock" className="mt-0">
            <WhStockOverviewTab warehouses={warehouses} initialWarehouseId={warehouseParam} />
          </TabsContent>
```

The full updated `WarehousesPageInner` function needs these two changes (add `warehouseParam` after `activeTab`, and pass it to `WhStockOverviewTab`).

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/wh/WhStockOverviewTab.tsx src/app/(dashboard)/purchase/warehouses/page.tsx
git commit -m "$(cat <<'EOF'
feat(warehouses): add warehouse filter, clear pill, and URL param pre-selection to stock overview

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update WhTransferDialog — item picker + per-row stock validation

**Files:**
- Modify: `src/components/purchase/wh/WhTransferDialog.tsx`

**Critical fix:** The current dialog submits items as `{ item_name, sku, qty, unit }` without `brand_variant_id`. The RPC `approve_warehouse_transfer_inventory` reads `brand_variant_id` from the JSONB items array — without it, approving a transfer does nothing to FIFO layers. This task replaces the free-text item entry with a proper item picker from `warehouse_stock_view`, and adds per-row available-qty validation.

New item structure per row:
- Combo `<Select>` populated from source warehouse's stock (shows `item_name · SKU`)
- Read-only unit label (from selected item)
- Qty input with available-qty helper text below
- Red left border + error text if `qty_requested > available_qty`
- Submit disabled if any row has a validation error

- [ ] **Step 1: Rewrite `WhTransferDialog.tsx`**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { ArrowRightLeft, Bell, Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Warehouse } from '@/hooks/useWarehouses'
import { useWarehouseStock, useWarehouseStockSummary } from '@/hooks/useWarehouseOperations'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface TransferRow {
  brand_variant_id: string
  qty: string
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
  children: React.ReactNode
}

export function WhTransferDialog({ warehouses, currentProfile, children }: Props) {
  const [open, setOpen] = useState(false)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [rows, setRows] = useState<TransferRow[]>([{ brand_variant_id: '', qty: '' }])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // Pending source-warehouse change — waits for user confirmation before clearing rows
  const [pendingFromId, setPendingFromId] = useState<string | null>(null)
  const qc = useQueryClient()

  const toWh = warehouses.find((w) => w.id === toId)
  const fromWh = warehouses.find((w) => w.id === fromId)
  const managerName = (toWh as any)?.manager_name ?? 'the warehouse manager'
  const showApprovalBanner = !!fromId && !!toId

  // Source warehouse stock for item picker
  const { data: sourceStock = [] } = useWarehouseStock(fromId || undefined)
  // Memoized Map for O(1) available-qty lookups
  const { data: availableQtyMap } = useWarehouseStockSummary(fromId || null)

  function handleClose() {
    setOpen(false)
    setFromId('')
    setToId('')
    setRows([{ brand_variant_id: '', qty: '' }])
    setNotes('')
  }

  function addRow() {
    setRows((prev) => [...prev, { brand_variant_id: '', qty: '' }])
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateRow(idx: number, field: keyof TransferRow, value: string) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row
        // When changing item, reset qty to prevent stale validation state
        if (field === 'brand_variant_id') return { brand_variant_id: value, qty: '' }
        return { ...row, [field]: value }
      })
    )
  }

  // If the user has already selected items, prompt before clearing them
  function handleFromChange(id: string) {
    const hasWork = rows.some((r) => r.brand_variant_id)
    if (hasWork) {
      setPendingFromId(id)
      return
    }
    setFromId(id)
  }

  function confirmFromChange() {
    if (pendingFromId) {
      setFromId(pendingFromId)
      setRows([{ brand_variant_id: '', qty: '' }])
      setPendingFromId(null)
    }
  }

  // Per-row validation
  const rowErrors = useMemo(
    () =>
      rows.map((row) => {
        if (!row.brand_variant_id || !row.qty) return null
        const requested = parseFloat(row.qty)
        if (isNaN(requested) || requested <= 0) return null
        const available = availableQtyMap?.get(row.brand_variant_id) ?? 0
        if (requested > available) {
          return `Only ${available} available in ${fromWh?.name ?? 'source warehouse'}`
        }
        return null
      }),
    [rows, availableQtyMap, fromWh]
  )

  const hasValidationErrors = rowErrors.some((e) => e !== null)
  const hasValidRows = rows.some((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
  const canSubmit = !!fromId && !!toId && hasValidRows && !hasValidationErrors

  async function handleSubmit() {
    if (!fromId || !toId) return
    setSubmitting(true)
    try {
      const supabase = createClient()
      // Use DB sequence to guarantee unique transfer numbers across concurrent users
      const { data: transferNumber, error: seqError } = await (supabase as any)
        .rpc('generate_transfer_number')
      if (seqError) throw seqError

      const validRows = rows
        .filter((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
        .map((r) => {
          const item = sourceStock.find((s) => s.brand_variant_id === r.brand_variant_id)
          return {
            brand_variant_id: r.brand_variant_id,
            item_name: item?.item_name ?? '',
            sku: item?.sku ?? null,
            qty: parseFloat(r.qty),
            unit_cost: item?.avg_cost ?? 0,
          }
        })

      const { error } = await (supabase as any).from('warehouse_transfers').insert({
        transfer_number: transferNumber,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        from_warehouse_name: fromWh?.name ?? '',
        to_warehouse_name: toWh?.name ?? '',
        status: 'pending_approval',
        date: new Date().toISOString().split('T')[0],
        created_by_name: currentProfile?.full_name ?? currentProfile?.email ?? '',
        items: validRows,
        notes: notes || null,
      })
      if (error) throw error

      qc.invalidateQueries({ queryKey: ['warehouse_transfers'] })
      toast.success(`Transfer submitted — awaiting approval from ${managerName}`)
      handleClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>

      {/* Confirm before clearing selected items when source warehouse changes */}
      <AlertDialog open={!!pendingFromId} onOpenChange={(o) => !o && setPendingFromId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change source warehouse?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing the source warehouse will clear all selected items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFromId(null)}>Keep current</AlertDialogCancel>
            <AlertDialogAction onClick={confirmFromChange}>Change warehouse</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Create Stock Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* From / To */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From Warehouse *</Label>
                <Select value={fromId} onValueChange={handleFromChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((w) => w.id !== toId)
                      .map((wh) => (
                        <SelectItem key={wh.id} value={wh.id} className="text-xs">
                          {wh.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To Warehouse *</Label>
                <Select value={toId} onValueChange={(v) => setToId(v ?? '')}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses
                      .filter((w) => w.id !== fromId)
                      .map((wh) => (
                        <SelectItem key={wh.id} value={wh.id} className="text-xs">
                          {wh.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Approval banner */}
            {showApprovalBanner && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/20 text-xs">
                <Bell className="h-3 w-3 text-primary flex-shrink-0" />
                <span>
                  Notification will be sent to <strong>{managerName}</strong> for approval.
                </span>
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              <Label className="text-xs">Items</Label>
              {rows.map((row, idx) => {
                const selectedItem = sourceStock.find(
                  (s) => s.brand_variant_id === row.brand_variant_id
                )
                const available = row.brand_variant_id
                  ? (availableQtyMap?.get(row.brand_variant_id) ?? 0)
                  : null
                const error = rowErrors[idx]

                return (
                  <div
                    key={idx}
                    className={`space-y-1 pl-2 border-l-2 ${error ? 'border-destructive' : 'border-transparent'}`}
                  >
                    <div className="grid grid-cols-[1fr_80px_auto] gap-2 items-start">
                      {/* Item picker */}
                      <Select
                        value={row.brand_variant_id}
                        onValueChange={(v) => updateRow(idx, 'brand_variant_id', v)}
                        disabled={!fromId}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder={fromId ? 'Select item…' : 'Select source first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {sourceStock.length === 0 ? (
                            <SelectItem value="__empty__" disabled className="text-xs text-muted-foreground">
                              No stock in this warehouse
                            </SelectItem>
                          ) : (
                            sourceStock.map((s) => (
                              <SelectItem
                                key={s.brand_variant_id}
                                value={s.brand_variant_id}
                                className="text-xs"
                              >
                                {s.item_name}
                                {s.sku ? ` · ${s.sku}` : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>

                      {/* Qty input */}
                      <div className="space-y-0.5">
                        <Input
                          type="number"
                          className={`h-7 text-xs ${error ? 'border-destructive' : ''}`}
                          placeholder="Qty"
                          min="0"
                          value={row.qty}
                          onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                          disabled={!row.brand_variant_id}
                        />
                      </div>

                      {/* Remove button */}
                      {rows.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => removeRow(idx)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      ) : (
                        <div className="w-7" />
                      )}
                    </div>

                    {/* Helper / error text row */}
                    <div className="flex items-center justify-between pl-0.5">
                      <div>
                        {error ? (
                          <p className="text-[10px] text-destructive">{error}</p>
                        ) : available !== null ? (
                          <p className="text-[10px] text-muted-foreground">
                            Available: {available} {selectedItem?.unit ?? ''}
                          </p>
                        ) : null}
                      </div>
                      {selectedItem && (
                        <p className="text-[10px] text-muted-foreground">{selectedItem.unit}</p>
                      )}
                    </div>
                  </div>
                )
              })}

              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={addRow} disabled={!fromId}>
                <Plus className="h-3 w-3" /> Add Item
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Optional notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>
              Cancel
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={!canSubmit || submitting}
                      onClick={handleSubmit}
                    >
                      {submitting ? 'Creating…' : 'Create Transfer'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {hasValidationErrors && (
                  <TooltipContent side="top" className="text-xs">
                    Fix quantities above before transferring
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhTransferDialog.tsx
git commit -m "$(cat <<'EOF'
feat(warehouses): replace free-text items with item picker and per-row stock validation in transfer dialog

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Update PROGRESS.md**

Mark the per-warehouse stock visibility feature complete. Add a `✅ Completed` entry at the top of the completed list:

```
- [2026-05-05] **Per-Warehouse Stock Visibility** — `supabase/migrations/20260505000003_warehouse_stock_view_and_trigger.sql`, `src/hooks/useWarehouseOperations.ts`, `src/components/purchase/wh/WhWarehousesTab.tsx`, `src/components/purchase/wh/WhStockOverviewTab.tsx`, `src/components/purchase/wh/WhTransferDialog.tsx`, `src/app/(dashboard)/purchase/warehouses/page.tsx` — DB view over fifo_cost_layers, trigger maintaining warehouse counters, warehouse filter + clear pill on stock overview, value comparison bar, item picker with per-row stock validation in transfer dialog
```

- [ ] **Step 2: Commit PROGRESS.md**

```bash
git add PROGRESS.md
git commit -m "$(cat <<'EOF'
docs: update PROGRESS.md — per-warehouse stock visibility complete

Co-Authored-By: Mohamed Ismail <m.Ismail@alfaytri.com>
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `warehouse_stock_view` SQL — Task 1
- ✅ `trg_warehouse_stats` trigger with INSERT/UPDATE/DELETE coverage — Task 1
- ✅ Backfill via no-op UPDATE on fifo_cost_layers — Task 1
- ✅ Grant SELECT to authenticated — Task 1
- ✅ `useWarehouseStock` queries `warehouse_stock_view` — Task 2
- ✅ `useWarehouseStockSummary` returns `Map<brand_variant_id, qty>` with `useMemo` — Task 3
- ✅ "View Stock →" button on warehouse cards — Task 4
- ✅ Value comparison bar, clickable, with tooltip — Task 4
- ✅ Warehouse filter dropdown on Stock Overview — Task 5
- ✅ "Viewing: [Name] ×" clear pill — Task 5
- ✅ URL param `?warehouse=<id>` pre-selects filter on mount — Tasks 5 + 7
- ✅ Transfer dialog: item picker from source warehouse stock — Task 6
- ✅ Transfer dialog: `brand_variant_id` included in submitted items (fixes silent bug) — Task 6
- ✅ Per-row available qty helper text — Task 6
- ✅ Red left border + error text if qty exceeds available — Task 6
- ✅ Submit disabled with tooltip when validation errors exist — Task 6

**Type consistency:**
- `WarehouseStockItem` uses `qty` + `avg_cost` in Tasks 2–6 consistently
- `useWarehouseStockSummary` Maps over `brand_variant_id → qty` — same fields used in Task 6 lookup
- `TransferRow` in dialog uses `brand_variant_id` + `qty` (string for input) — submitted items use `parseFloat(row.qty)` consistently

**Review fixes applied:**
- ✅ Trigger now handles both `OLD.warehouse_id` and `NEW.warehouse_id` when a row moves between warehouses — no stale counters
- ✅ Transfer number uses `generate_transfer_number()` DB sequence (format `WT-YYYY-NNNNN`) — no Math.random() collisions
- ✅ Source-warehouse change now shows an `AlertDialog` confirmation before clearing rows — no silent data loss
- ✅ Color palette expanded to 12 distinct colors — no repeated colors for up to 12 warehouses
