# Dead Stock Report Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken data fetching and rebuild the Dead Stock page to match spec — a single server-side RPC aggregates all the data, the hook is a thin wrapper, and the page handles filtering/sorting client-side.

**Architecture:** A Postgres RPC (`get_dead_stock_report`) performs all JOINs and aggregations (MAX movement, MIN FIFO layer, days_idle via CURRENT_TIMESTAMP) in one server-side query. The client calls `.rpc()` once, caches for 10 min, and `useMemo` handles search/filter/sort with no re-fetches.

**Tech Stack:** Next.js 15 App Router · React Query (TanStack v5) · Supabase RPC · Tailwind CSS · shadcn/ui · lucide-react

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260426200001_rpc_get_dead_stock_report.sql` | Create | Postgres RPC — all JOINs, aggregations, days_idle, status bucket |
| `src/hooks/useDeadStock.ts` | Modify | Single `.rpc()` call, typed result, no filter params in query key |
| `src/app/(dashboard)/purchase/dead-stock/page.tsx` | Modify | 3 summary cards, category column, header sorting, client-side filter, item count |

---

## Task 1: Postgres RPC migration

**Files:**
- Create: `supabase/migrations/20260426200001_rpc_get_dead_stock_report.sql`

The RPC performs all aggregation server-side:
- JOINs `inventory_brand_variants → inventory_items → inventory_categories`
- `MAX(created_at)` per variant from `inventory_stock_movements`
- `MIN(date)` per variant from `fifo_cost_layers` (where `remaining_qty > 0`)
- `COALESCE(last_movement, oldest_fifo)` as reference date
- `CURRENT_TIMESTAMP - reference` for days_idle (server clock, not client)
- Status bucket computed in SQL

No `.in()` arrays, no client-side aggregation.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260426200001_rpc_get_dead_stock_report.sql

BEGIN;

CREATE OR REPLACE FUNCTION get_dead_stock_report()
RETURNS TABLE (
  brand_variant_id    uuid,
  item_name           text,
  category_name       text,
  brand               text,
  sku                 text,
  stock_level         numeric,
  average_cost        numeric,
  total_value         numeric,
  last_movement_date  timestamptz,
  last_movement_source text,
  days_idle           int,
  status              text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH
  latest_movements AS (
    SELECT brand_variant_id, MAX(created_at) AS last_movement_at
    FROM inventory_stock_movements
    GROUP BY brand_variant_id
  ),
  oldest_fifo AS (
    SELECT brand_variant_id, MIN(date) AS oldest_layer_date
    FROM fifo_cost_layers
    WHERE remaining_qty > 0
    GROUP BY brand_variant_id
  ),
  computed AS (
    SELECT
      ibv.id                                                  AS brand_variant_id,
      ii.name_en                                              AS item_name,
      ic.name_en                                              AS category_name,
      ibv.brand,
      ibv.code                                                AS sku,
      ibv.stock_level,
      COALESCE(ibv.average_cost, 0)                          AS average_cost,
      ibv.stock_level * COALESCE(ibv.average_cost, 0)        AS total_value,
      COALESCE(lm.last_movement_at,
               of.oldest_layer_date::timestamptz)            AS last_movement_date,
      CASE
        WHEN lm.last_movement_at   IS NOT NULL THEN 'movement'
        WHEN of.oldest_layer_date  IS NOT NULL THEN 'fifo'
        ELSE NULL
      END                                                     AS last_movement_source,
      CASE
        WHEN COALESCE(lm.last_movement_at,
                      of.oldest_layer_date::timestamptz) IS NOT NULL
          THEN EXTRACT(DAY FROM
                 CURRENT_TIMESTAMP -
                 COALESCE(lm.last_movement_at,
                          of.oldest_layer_date::timestamptz)
               )::int
        ELSE 999
      END                                                     AS days_idle
    FROM inventory_brand_variants ibv
    JOIN  inventory_items      ii ON ii.id  = ibv.item_id
    LEFT JOIN inventory_categories ic ON ic.id  = ii.category_id
    LEFT JOIN latest_movements     lm ON lm.brand_variant_id = ibv.id
    LEFT JOIN oldest_fifo          of ON of.brand_variant_id = ibv.id
    WHERE ibv.stock_level > 0
  )
  SELECT
    brand_variant_id,
    item_name,
    category_name,
    brand,
    sku,
    stock_level,
    average_cost,
    total_value,
    last_movement_date,
    last_movement_source,
    days_idle,
    CASE
      WHEN days_idle <= 30  THEN 'active'
      WHEN days_idle <= 90  THEN 'slow_moving'
      WHEN days_idle <= 180 THEN 'at_risk'
      ELSE                       'dead'
    END AS status
  FROM computed;
$$;

GRANT EXECUTE ON FUNCTION get_dead_stock_report() TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply the migration to Supabase**

Open Supabase Dashboard → SQL Editor → paste and run the migration file contents.

Or via CLI:
```bash
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260426200001_rpc_get_dead_stock_report.sql
git commit -m "feat(dead-stock): add get_dead_stock_report RPC — server-side aggregation, FIFO fallback, days_idle"
```

---

## Task 2: Rewrite the hook

**Files:**
- Modify: `src/hooks/useDeadStock.ts`

Single `.rpc()` call. Result typed explicitly (RPC isn't in generated DB types yet, so we cast the result — but all *usage* of the returned data is typed).

- [ ] **Step 1: Replace the entire file**

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeadStockStatus = 'active' | 'slow_moving' | 'at_risk' | 'dead'

export type DeadStockItem = {
  brand_variant_id:     string
  item_name:            string
  category_name:        string | null
  brand:                string | null
  sku:                  string | null
  stock_level:          number
  average_cost:         number
  total_value:          number
  last_movement_date:   string | null
  last_movement_source: 'movement' | 'fifo' | null
  days_idle:            number
  status:               DeadStockStatus
}

export function classifyDeadStock(days: number): DeadStockStatus {
  if (days <= 30)  return 'active'
  if (days <= 90)  return 'slow_moving'
  if (days <= 180) return 'at_risk'
  return 'dead'
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDeadStockReport() {
  return useQuery({
    queryKey: ['dead_stock'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('get_dead_stock_report')
      if (error) throw error
      return (data ?? []) as DeadStockItem[]
    },
    staleTime: 10 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDeadStock.ts
git commit -m "refactor(dead-stock): single RPC call, typed result, remove client-side aggregation"
```

---

## Task 3: Update the page UI

**Files:**
- Modify: `src/app/(dashboard)/purchase/dead-stock/page.tsx`

- [ ] **Step 1: Replace the entire page**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useDeadStockReport, type DeadStockStatus } from '@/hooks/useDeadStock'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

// Active items are healthy — only 3 risk buckets are summarized
const SUMMARY_STATUSES: DeadStockStatus[] = ['slow_moving', 'at_risk', 'dead']

const STATUS_CONFIG: Record<DeadStockStatus, {
  label: string; badgeClass: string; cardClass: string; days: string
}> = {
  active:      { label: 'Active',      badgeClass: 'border-success text-success',         cardClass: 'border-success/30 bg-success/5',         days: '≤ 30 days'   },
  slow_moving: { label: 'Slow Moving', badgeClass: 'border-warning text-warning',         cardClass: 'border-warning/30 bg-warning/5',         days: '31–90 days'  },
  at_risk:     { label: 'At Risk',     badgeClass: 'border-orange-500 text-orange-500',   cardClass: 'border-orange-300 bg-orange-50',         days: '91–180 days' },
  dead:        { label: 'Dead Stock',  badgeClass: 'border-destructive text-destructive', cardClass: 'border-destructive/30 bg-destructive/5', days: '> 180 days'  },
}

type SortKey = 'days' | 'value'
type SortDir = 'asc' | 'desc'

export default function DeadStockPage() {
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<DeadStockStatus | ''>('')
  const [sortKey, setSortKey]           = useState<SortKey>('days')
  const [sortDir, setSortDir]           = useState<SortDir>('desc')

  const { data: rawItems = [], isLoading } = useDeadStockReport()

  const items = useMemo(() => {
    let list = rawItems
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (i) =>
          i.item_name.toLowerCase().includes(q) ||
          (i.sku  ?? '').toLowerCase().includes(q) ||
          (i.brand ?? '').toLowerCase().includes(q),
      )
    }
    if (statusFilter) list = list.filter((i) => i.status === statusFilter)
    return [...list].sort((a, b) => {
      const av = sortKey === 'days' ? a.days_idle : a.total_value
      const bv = sortKey === 'days' ? b.days_idle : b.total_value
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [rawItems, search, statusFilter, sortKey, sortDir])

  const summary = SUMMARY_STATUSES.map((s) => {
    const bucket = rawItems.filter((i) => i.status === s)
    return { status: s, count: bucket.length, value: bucket.reduce((n, i) => n + i.total_value, 0) }
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function lastMovementLabel(item: typeof rawItems[0]) {
    if (!item.last_movement_date) return 'Unknown'
    if (item.last_movement_source === 'fifo') return `Received ${formatDate(item.last_movement_date)}`
    return formatDate(item.last_movement_date)
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Dead & Slow-Moving Inventory"
        description="Items with no stock movements — identify aging inventory"
      />

      {/* 3 risk-bucket summary cards — Active excluded (healthy) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summary.map(({ status, count, value }) => {
          const cfg = STATUS_CONFIG[status]
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary',
                cfg.cardClass,
                statusFilter === status && 'ring-2 ring-primary',
              )}
            >
              <div className="text-xs text-muted-foreground mb-1">{cfg.label}</div>
              <div className="text-xs text-muted-foreground/70 mb-2">{cfg.days}</div>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs text-muted-foreground mt-1">{formatCurrency(value, 'QAR')}</div>
            </button>
          )
        })}
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search item, SKU, brand…" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as DeadStockStatus | '')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="slow_moving">Slow Moving</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
            <SelectItem value="dead">Dead Stock</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} items</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No items found
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="hidden sm:table-cell">Brand</TableHead>
                <TableHead className="hidden md:table-cell">SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead
                  className="hidden sm:table-cell text-right cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort('value')}
                >
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    Value (QAR) <ArrowUpDown className="h-3 w-3" />
                  </span>
                </TableHead>
                <TableHead className="hidden md:table-cell">Last Movement</TableHead>
                <TableHead
                  className="text-right cursor-pointer select-none hover:text-foreground"
                  onClick={() => toggleSort('days')}
                >
                  <span className="inline-flex items-center gap-1 justify-end w-full">
                    Days Idle <ArrowUpDown className="h-3 w-3" />
                  </span>
                </TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const cfg = STATUS_CONFIG[item.status]
                return (
                  <TableRow key={item.brand_variant_id}>
                    <TableCell>
                      <div className="font-medium text-sm">{item.item_name}</div>
                      {item.category_name && (
                        <div className="text-xs text-muted-foreground">{item.category_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {item.brand ?? '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-primary font-medium">
                      {item.sku ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">{item.stock_level}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right font-medium">
                      {formatCurrency(item.total_value, 'QAR')}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {lastMovementLabel(item)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {item.days_idle === 999 ? '∞' : item.days_idle}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', cfg.badgeClass)}>
                        {cfg.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Start dev server and verify visually**

```powershell
npm run dev
```

Navigate to `http://localhost:3000/purchase/dead-stock`. Check:
- 3 summary cards (Slow Moving / At Risk / Dead) — no Active card
- Clicking a card filters the table; clicking again clears
- Search filters instantly (debounced 300 ms by SearchInput internally)
- Status dropdown works
- Item count updates with filters
- "Days Idle" and "Value (QAR)" headers clickable, toggle asc/desc
- Item column shows category sub-text in grey
- "Received \<date\>" for FIFO-only items, "Unknown" when no reference date

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/purchase/dead-stock/page.tsx
git commit -m "feat(dead-stock): 3 risk cards, category column, header sort, client-side filters, FIFO label"
```

---

## Review Notes

| Review point | Resolution |
|---|---|
| Over-fetching / multi-query | RPC aggregates everything server-side — one network call |
| `.in()` URL length limit | Eliminated — no client-side ID arrays |
| TypeScript `any` | RPC result cast to explicit `DeadStockItem[]` — all usage typed |
| Debouncing | Already in `SearchInput` (debounceMs=300) — no change needed |
| Client-side clock | `CURRENT_TIMESTAMP` in RPC — server clock only |
| `'use client'` in hook | Added |
