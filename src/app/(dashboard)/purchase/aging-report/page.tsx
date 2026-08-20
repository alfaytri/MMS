'use client'

import { useMemo, useState, useCallback } from 'react'
import { ArrowUpDown, ChevronsUpDown, Building2, X } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command'
import {
  Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui/popover'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { usePurchaseAgingReport, type AgingRow } from '@/hooks/useAgingReport'
import { AgingDrillDownDialog } from '@/components/purchase/AgingDrillDownDialog'
import type { AgingBucket } from '@/hooks/useAgingDrillDown'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

type SortKey = 'current' | '1_30' | '31_60' | '61_90' | 'over_90' | 'total'
type SortDir = 'asc' | 'desc'

const BUCKET_COLORS = {
  current:  'text-emerald-600',
  days_1_30:  'text-amber-600',
  days_31_60: 'text-orange-600',
  days_61_90: 'text-red-500',
  days_over_90: 'text-red-700 font-semibold',
}

function getBucketValue(row: AgingRow, key: SortKey): number {
  switch (key) {
    case 'current': return row.current_amt
    case '1_30':    return row.days_1_30
    case '31_60':   return row.days_31_60
    case '61_90':   return row.days_61_90
    case 'over_90': return row.days_over_90
    case 'total':   return row.total_outstanding
  }
}

type DrillDownState = {
  supplierId: string
  supplierName: string
  bucket: AgingBucket
} | null

export default function PurchaseAgingReportPage() {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [comboOpen, setComboOpen] = useState(false)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [drillDown, setDrillDown] = useState<DrillDownState>(null)

  const { data: rows = [], isLoading } = usePurchaseAgingReport()

  // Own-filter + cap for the supplier picker — cmdk's built-in filter mounts and
  // re-scores every supplier row per keystroke; here we render at most 100.
  const visibleSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase()
    const matched = q ? rows.filter((r) => (r.supplier_name ?? '').toLowerCase().includes(q)) : rows
    return { list: matched.slice(0, 100), total: matched.length }
  }, [rows, supplierSearch])

  const selectedSupplierName = useMemo(
    () => rows.find((r) => r.supplier_id === selectedSupplierId)?.supplier_name ?? null,
    [rows, selectedSupplierId],
  )

  const filtered = useMemo(() => {
    let list = rows
    if (selectedSupplierId) {
      list = list.filter((r) => r.supplier_id === selectedSupplierId)
    }
    return [...list].sort((a, b) => {
      const av = getBucketValue(a, sortKey)
      const bv = getBucketValue(b, sortKey)
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [rows, selectedSupplierId, sortKey, sortDir])

  const totals = useMemo(() => ({
    current:  rows.reduce((s, r) => s + r.current_amt, 0),
    days_1_30:  rows.reduce((s, r) => s + r.days_1_30, 0),
    days_31_60: rows.reduce((s, r) => s + r.days_31_60, 0),
    days_61_90: rows.reduce((s, r) => s + r.days_61_90, 0),
    days_over_90: rows.reduce((s, r) => s + r.days_over_90, 0),
    total:    rows.reduce((s, r) => s + r.total_outstanding, 0),
  }), [rows])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const openDrillDown = useCallback((row: AgingRow, bucket: AgingBucket) => {
    if (!row.supplier_id) return
    setDrillDown({
      supplierId: row.supplier_id,
      supplierName: row.supplier_name ?? 'Unknown',
      bucket,
    })
  }, [])

  const SortHeader = ({ label, sortId, className }: { label: string; sortId: SortKey; className?: string }) => (
    <TableHead
      className={cn('text-right cursor-pointer select-none hover:text-foreground', className)}
      onClick={() => toggleSort(sortId)}
    >
      <span className="inline-flex items-center gap-1 justify-end w-full">
        {label} <ArrowUpDown className="h-3 w-3" />
      </span>
    </TableHead>
  )

  function renderBucketCell(row: AgingRow, value: number, bucket: AgingBucket, colorClass: string, className?: string) {
    if (value <= 0) {
      return (
        <TableCell className={cn('text-right tabular-nums', className)}>
          <span className="text-muted-foreground">—</span>
        </TableCell>
      )
    }
    return (
      <TableCell className={cn('text-right tabular-nums', className)}>
        <button
          type="button"
          onClick={() => openDrillDown(row, bucket)}
          className={cn(
            'cursor-pointer hover:underline underline-offset-2 transition-colors',
            colorClass,
          )}
        >
          {formatCurrency(value, 'QAR')}
        </button>
      </TableCell>
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Purchase Aging Report"
        description="Outstanding bills by supplier — grouped by days overdue. Click any amount to see individual bills."
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          { label: 'Current',   value: totals.current,      color: 'border-emerald-200 bg-emerald-50' },
          { label: '1–30 Days', value: totals.days_1_30,    color: 'border-amber-200 bg-amber-50' },
          { label: '31–60 Days', value: totals.days_31_60,  color: 'border-orange-200 bg-orange-50' },
          { label: '61–90 Days', value: totals.days_61_90,  color: 'border-red-200 bg-red-50' },
          { label: '90+ Days',  value: totals.days_over_90, color: 'border-red-300 bg-red-100' },
          { label: 'Total',     value: totals.total,        color: 'border-border bg-muted/50' },
        ]).map((card) => (
          <div key={card.label} className={cn('rounded-lg border p-3', card.color)}>
            <div className="text-xs text-muted-foreground mb-1">{card.label}</div>
            <div className="text-lg font-bold tabular-nums">{formatCurrency(card.value, 'QAR')}</div>
          </div>
        ))}
      </div>

      {/* Supplier filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex items-center gap-2">
          <Popover open={comboOpen} onOpenChange={(o) => { setComboOpen(o); if (!o) setSupplierSearch('') }}>
            <PopoverTrigger
              className={cn(
                'flex h-10 w-full sm:w-72 items-center justify-between rounded-lg border bg-background px-3 text-sm',
                'ring-offset-background transition-colors',
                'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                !selectedSupplierId && 'text-muted-foreground',
              )}
            >
              <div className="flex items-center gap-2 truncate">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {selectedSupplierName ?? 'All Suppliers'}
                </span>
              </div>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent className="w-(--anchor-width) p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="Search supplier..." value={supplierSearch} onValueChange={setSupplierSearch} />
                <CommandList>
                  <CommandEmpty>No supplier found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__all__"
                      onSelect={() => { setSelectedSupplierId(null); setComboOpen(false) }}
                      data-checked={!selectedSupplierId}
                    >
                      <span className="text-muted-foreground">All Suppliers</span>
                    </CommandItem>
                    {visibleSuppliers.list.map((r) => (
                      <CommandItem
                        key={r.supplier_id}
                        value={r.supplier_name ?? ''}
                        onSelect={() => { setSelectedSupplierId(r.supplier_id!); setComboOpen(false) }}
                        data-checked={selectedSupplierId === r.supplier_id}
                      >
                        {r.supplier_name}
                      </CommandItem>
                    ))}
                    {visibleSuppliers.total > 100 && (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        Showing first 100 of {visibleSuppliers.total} — keep typing to narrow.
                      </div>
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedSupplierId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => setSelectedSupplierId(null)}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Clear filter</span>
            </Button>
          )}
        </div>

        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} supplier{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed">
          <EmptyState title="No outstanding bills" description="All supplier bills are fully paid" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Bills</TableHead>
                <SortHeader label="Current" sortId="current" className="hidden md:table-cell" />
                <SortHeader label="1–30" sortId="1_30" className="hidden md:table-cell" />
                <SortHeader label="31–60" sortId="31_60" className="hidden lg:table-cell" />
                <SortHeader label="61–90" sortId="61_90" className="hidden lg:table-cell" />
                <SortHeader label="90+" sortId="over_90" />
                <SortHeader label="Total" sortId="total" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, i) => (
                <TableRow key={row.supplier_id} className={STAGGER_IN} style={staggerDelay(i)}>
                  <TableCell className="font-medium">{row.supplier_name}</TableCell>
                  <TableCell className="text-center hidden sm:table-cell text-muted-foreground">
                    {row.bill_count}
                  </TableCell>
                  {renderBucketCell(row, row.current_amt, 'current', BUCKET_COLORS.current, 'hidden md:table-cell')}
                  {renderBucketCell(row, row.days_1_30, '1_30', BUCKET_COLORS.days_1_30, 'hidden md:table-cell')}
                  {renderBucketCell(row, row.days_31_60, '31_60', BUCKET_COLORS.days_31_60, 'hidden lg:table-cell')}
                  {renderBucketCell(row, row.days_61_90, '61_90', BUCKET_COLORS.days_61_90, 'hidden lg:table-cell')}
                  {renderBucketCell(row, row.days_over_90, 'over_90', BUCKET_COLORS.days_over_90)}
                  <TableCell className="text-right tabular-nums">
                    {row.total_outstanding > 0 ? (
                      <button
                        type="button"
                        onClick={() => openDrillDown(row, 'total')}
                        className="font-bold cursor-pointer hover:underline underline-offset-2 transition-colors"
                      >
                        {formatCurrency(row.total_outstanding, 'QAR')}
                      </button>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals footer */}
              <TableRow className="bg-muted/50 font-bold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  {rows.reduce((s, r) => s + (r.bill_count ?? 0), 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums hidden md:table-cell">{formatCurrency(totals.current, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums hidden md:table-cell">{formatCurrency(totals.days_1_30, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums hidden lg:table-cell">{formatCurrency(totals.days_31_60, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums hidden lg:table-cell">{formatCurrency(totals.days_61_90, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totals.days_over_90, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totals.total, 'QAR')}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Drill-down dialog */}
      <AgingDrillDownDialog
        open={!!drillDown}
        onOpenChange={(open) => { if (!open) setDrillDown(null) }}
        supplierId={drillDown?.supplierId ?? null}
        supplierName={drillDown?.supplierName ?? ''}
        bucket={drillDown?.bucket ?? 'total'}
      />
    </PageWrapper>
  )
}
