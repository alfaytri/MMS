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
          (i.sku   ?? '').toLowerCase().includes(q) ||
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
    if (item.last_movement_source === 'fifo')    return `Received ${formatDate(item.last_movement_date)}`
    if (item.last_movement_source === 'created') return `Added ${formatDate(item.last_movement_date)}`
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
