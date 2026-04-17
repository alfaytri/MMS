'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useDeadStockReport, type DeadStockStatus } from '@/hooks/useDeadStock'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<DeadStockStatus, { label: string; badgeClass: string; cardClass: string; days: string }> = {
  active:      { label: 'Active',       badgeClass: 'border-success text-success',           cardClass: 'border-success/30 bg-success/5',     days: '≤ 30 days' },
  slow_moving: { label: 'Slow Moving',  badgeClass: 'border-warning text-warning',           cardClass: 'border-warning/30 bg-warning/5',     days: '31–90 days' },
  at_risk:     { label: 'At Risk',      badgeClass: 'border-orange-500 text-orange-500',     cardClass: 'border-orange-300 bg-orange-50',     days: '91–180 days' },
  dead:        { label: 'Dead Stock',   badgeClass: 'border-destructive text-destructive',   cardClass: 'border-destructive/30 bg-destructive/5', days: '> 180 days' },
}

const ALL_STATUSES: DeadStockStatus[] = ['active', 'slow_moving', 'at_risk', 'dead']

export default function DeadStockPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DeadStockStatus | ''>('')
  const [sortBy, setSortBy] = useState<'days' | 'value'>('days')

  const { data: items, isLoading } = useDeadStockReport({
    search,
    status: statusFilter || undefined,
  })

  const sorted = [...(items ?? [])].sort((a, b) =>
    sortBy === 'days' ? b.days_idle - a.days_idle : b.total_value - a.total_value
  )

  const summary = ALL_STATUSES.map((s) => {
    const filtered = (items ?? []).filter((i) => i.status === s)
    return {
      status: s,
      count: filtered.length,
      value: filtered.reduce((sum, i) => sum + i.total_value, 0),
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dead Stock Report"
        description="Identify slow-moving and stagnant inventory to take action before value is lost"
      />

      {/* Summary cards — clickable filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
                statusFilter === status && 'ring-2 ring-primary'
              )}
            >
              <div className="text-xs text-muted-foreground mb-1">{cfg.label}</div>
              <div className="text-xs text-muted-foreground mb-2 opacity-70">{cfg.days}</div>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs text-muted-foreground mt-1">{formatCurrency(value, 'QAR')}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search item, SKU, brand…" />
        <div className="flex gap-2">
          {(['days', 'value'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                sortBy === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
              )}
            >
              Sort: {s === 'days' ? 'Days Idle' : 'Value'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No dead stock items found
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
                <TableHead className="hidden sm:table-cell text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Value (QAR)</TableHead>
                <TableHead className="hidden md:table-cell">Last Movement</TableHead>
                <TableHead className="text-right">Days Idle</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((item) => {
                const cfg = STATUS_CONFIG[item.status]
                return (
                  <TableRow key={item.brand_variant_id}>
                    <TableCell className="font-medium text-sm">{item.item_name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{item.brand ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{item.sku ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">{item.stock_level}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right text-sm">{formatCurrency(item.average_cost, 'QAR')}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.total_value, 'QAR')}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {item.last_movement_date ? formatDate(item.last_movement_date) : 'Never'}
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
    </div>
  )
}
