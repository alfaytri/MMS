'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Boxes, Clock, AlertTriangle, Ban } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { Badge } from '@/components/ui/badge'
import { useDeadStockReport, type DeadStockItem, type DeadStockStatus } from '@/hooks/useDeadStock'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { formatCurrency, formatDate, formatRelative } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<DeadStockStatus, {
  label: string; badgeClass: string; days: string
}> = {
  active:      { label: 'Active',      badgeClass: 'border-success text-success',         days: '≤ 30 days'   },
  slow_moving: { label: 'Slow Moving', badgeClass: 'border-warning text-warning',         days: '31–90 days'  },
  at_risk:     { label: 'At Risk',     badgeClass: 'border-orange-500 text-orange-500',   days: '91–180 days' },
  dead:        { label: 'Dead Stock',  badgeClass: 'border-destructive text-destructive', days: '> 180 days'  },
}

const FILTER_STATUSES: { value: DeadStockStatus | ''; label: string }[] = [
  { value: '',            label: 'All' },
  { value: 'slow_moving', label: 'Slow Moving' },
  { value: 'at_risk',     label: 'At Risk' },
  { value: 'dead',        label: 'Dead Stock' },
]

function lastMovementLabel(item: DeadStockItem) {
  if (!item.last_movement_date) return { prefix: '', value: 'Unknown' }
  const prefix =
    item.last_movement_source === 'fifo'    ? 'Received' :
    item.last_movement_source === 'created' ? 'Added'    : ''
  return { prefix, value: item.last_movement_date }
}

/**
 * Brand often duplicates the item family (e.g. item "FLARE NUT 3/8''" with brand
 * "FLARE NUT") because the catalog was seeded with product-family strings instead
 * of manufacturer names. Hide those duplicates so the column stays informative.
 * Returns the cleaned brand or null when it should be hidden.
 */
function displayBrand(item: DeadStockItem): string | null {
  const b = item.brand?.trim()
  if (!b) return null
  const itemLower = item.item_name.trim().toLowerCase()
  const brandLower = b.toLowerCase()
  if (itemLower === brandLower) return null
  if (itemLower.startsWith(brandLower + ' ')) return null
  return b
}

export default function DeadStockPage() {
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<DeadStockStatus | ''>('')

  // Scope the report to the active division(s) from the top bar (empty = All).
  const { viewDivisionIds } = useActiveDivision()
  const divisionIds = useMemo(() => Array.from(viewDivisionIds), [viewDivisionIds])
  const { data: rawItems = [], isLoading } = useDeadStockReport(divisionIds)

  const items = useMemo(() => {
    let list = rawItems
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (i) =>
          i.item_name.toLowerCase().includes(q) ||
          (i.sku   ?? '').toLowerCase().includes(q) ||
          (i.brand ?? '').toLowerCase().includes(q),
      )
    }
    if (statusFilter) list = list.filter((i) => i.status === statusFilter)
    return list
  }, [rawItems, search, statusFilter])

  const stats = useMemo(() => {
    let slow = 0, atRisk = 0, dead = 0
    let slowValue = 0, atRiskValue = 0, deadValue = 0
    for (const i of rawItems) {
      if (i.status === 'slow_moving') { slow++;   slowValue   += i.total_value }
      if (i.status === 'at_risk')     { atRisk++; atRiskValue += i.total_value }
      if (i.status === 'dead')        { dead++;   deadValue   += i.total_value }
    }
    return {
      total:  rawItems.length,
      slow,   slowValue,
      atRisk, atRiskValue,
      dead,   deadValue,
    }
  }, [rawItems])

  const columns = useMemo<ColumnDef<DeadStockItem>[]>(() => [
    {
      id: 'item',
      accessorKey: 'item_name',
      header: 'Item',
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{row.original.item_name}</div>
          {row.original.category_name && (
            <div className="text-xs text-muted-foreground truncate">{row.original.category_name}</div>
          )}
        </div>
      ),
    },
    {
      id: 'brand',
      header: 'Brand',
      cell: ({ row }) => {
        const b = displayBrand(row.original)
        return (
          <span className="text-xs text-muted-foreground truncate max-w-[140px] block">
            {b ?? '—'}
          </span>
        )
      },
    },
    {
      id: 'sku',
      header: 'SKU',
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.original.sku ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'stock_level',
      header: () => <span className="text-right w-full block">Stock</span>,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums block text-right font-medium">
          {row.original.stock_level}
        </span>
      ),
    },
    {
      accessorKey: 'total_value',
      header: ({ column }) => (
        <div className="text-right">
          <DataTableColumnHeader column={column} title="Value (QAR)" />
        </div>
      ),
      cell: ({ row }) => (
        <span className="text-xs tabular-nums block text-right font-medium">
          {formatCurrency(row.original.total_value, 'QAR')}
        </span>
      ),
    },
    {
      id: 'last_movement',
      accessorFn: (row) => row.last_movement_date ?? '',
      header: 'Last Movement',
      cell: ({ row }) => {
        const { prefix, value } = lastMovementLabel(row.original)
        if (value === 'Unknown') {
          return <span className="text-xs text-muted-foreground">Unknown</span>
        }
        const absolute = formatDate(value)
        const relative = formatRelative(value)
        return (
          <span
            className="text-xs text-muted-foreground tabular-nums"
            title={`${prefix ? prefix + ' ' : ''}${absolute}`}
          >
            {prefix && <span className="mr-1">{prefix}</span>}
            {relative}
          </span>
        )
      },
    },
    {
      accessorKey: 'days_idle',
      header: ({ column }) => (
        <div className="text-right">
          <DataTableColumnHeader column={column} title="Days Idle" />
        </div>
      ),
      cell: ({ row }) => (
        <span className="text-xs tabular-nums block text-right font-semibold">
          {row.original.days_idle === 999 ? '∞' : row.original.days_idle}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const cfg = STATUS_CONFIG[row.original.status]
        return <Badge variant="outline" className={cn('text-[10px]', cfg.badgeClass)}>{cfg.label}</Badge>
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Dead & Slow-Moving Inventory"
        description="Items with no stock movements — identify aging inventory"
      />

      {/* Stat strip — 4 compact cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Boxes className="h-2.5 w-2.5" /> Total items
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">{stats.total}</p>
          <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">All statuses</p>
        </div>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'slow_moving' ? '' : 'slow_moving')}
          className={cn(
            'rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent',
            statusFilter === 'slow_moving' && 'ring-2 ring-warning border-warning',
          )}
        >
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> Slow moving
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.slow > 0 && 'text-warning')}>
            {stats.slow}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">
            {formatCurrency(stats.slowValue, 'QAR')}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'at_risk' ? '' : 'at_risk')}
          className={cn(
            'rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent',
            statusFilter === 'at_risk' && 'ring-2 ring-orange-500 border-orange-500',
          )}
        >
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> At risk
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.atRisk > 0 && 'text-orange-500')}>
            {stats.atRisk}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">
            {formatCurrency(stats.atRiskValue, 'QAR')}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'dead' ? '' : 'dead')}
          className={cn(
            'rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent',
            statusFilter === 'dead' && 'ring-2 ring-destructive border-destructive',
          )}
        >
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Ban className="h-2.5 w-2.5" /> Dead stock
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.dead > 0 && 'text-destructive')}>
            {stats.dead}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums leading-tight">
            {formatCurrency(stats.deadValue, 'QAR')}
          </p>
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search item, SKU, brand…"
        />
        <div className="hidden sm:block h-4 w-px bg-border" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</span>
          {FILTER_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'px-3 py-1 min-h-11 md:min-h-0 rounded-full text-xs font-medium border transition-colors',
                statusFilter === s.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-accent'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="sm:ml-auto text-xs text-muted-foreground tabular-nums">
          {items.length.toLocaleString('en-QA')} items
        </span>
      </div>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        pageSize={25}
        mobileCardRender={(item: DeadStockItem) => {
          const cfg = STATUS_CONFIG[item.status]
          const { prefix, value } = lastMovementLabel(item)
          const relative = value === 'Unknown' ? 'Unknown' : formatRelative(value)
          const brand = displayBrand(item)
          return (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{item.item_name}</div>
                  {item.category_name && (
                    <div className="text-xs text-muted-foreground truncate">{item.category_name}</div>
                  )}
                </div>
                <Badge variant="outline" className={cn('text-[10px] shrink-0', cfg.badgeClass)}>
                  {cfg.label}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono">{item.sku ?? '—'}</span>
                {brand && (
                  <>
                    <span className="text-border">·</span>
                    <span>{brand}</span>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <span className="tabular-nums font-medium text-foreground">{item.stock_level}</span> in stock
                  <span className="text-border">·</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {item.days_idle === 999 ? '∞' : item.days_idle}
                  </span>
                  <span>d idle</span>
                </span>
                <span className="tabular-nums font-medium">
                  {formatCurrency(item.total_value, 'QAR')}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {prefix && `${prefix} `}{relative}
              </div>
            </div>
          )
        }}
      />
    </PageWrapper>
  )
}
