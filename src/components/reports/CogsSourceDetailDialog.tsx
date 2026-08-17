'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  FileSpreadsheet, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { exportReportToExcel } from '@/lib/reports/reportExcel'
import type { ReportColumn } from '@/lib/reports/reportColumns'
import { useProfitLossCogsDetail, type CogsDetailRow } from '@/hooks/reports/useProfitLossCogsDetail'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'
import { cn } from '@/lib/utils'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })
const PAGE_SIZE = 10
const EMPTY: CogsDetailRow[] = []

type SourceType = CogsDetailRow['source_type']
type TypeFilter = 'all' | SourceType
type SortKey = 'date' | 'type'
type SortDir = 'asc' | 'desc'

// Cost types that make up the P&L COGS. Sales/landed-costs add cost (red);
// returns/reversals credit it back (green). `rank` drives the Type sorter;
// SOURCE_TYPES (ledger order) drives the Type filter dropdown.
const TYPE_META: Record<SourceType, { label: string; cls: string; rank: number }> = {
  sale:                 { label: 'Sale',        cls: 'border-border text-foreground', rank: 0 },
  sale_return:          { label: 'Return',      cls: 'border-green-300 text-green-600 dark:text-green-400', rank: 1 },
  consumption:          { label: 'Consumption', cls: 'border-blue-300 text-blue-600 dark:text-blue-400', rank: 2 },
  landed_cost:          { label: 'Landed Cost', cls: 'border-orange-300 text-orange-600 dark:text-orange-400', rank: 3 },
  landed_cost_reversal: { label: 'LC Reversal', cls: 'border-green-300 text-green-600 dark:text-green-400', rank: 4 },
}
const SOURCE_TYPES: SourceType[] = ['sale', 'sale_return', 'consumption', 'landed_cost', 'landed_cost_reversal']

// One definition drives the styled Excel export (filtered rows, current sort order).
const EXPORT_COLS: ReportColumn<CogsDetailRow>[] = [
  { header: 'Date',         accessor: (r) => r.date,                          format: 'text' },
  { header: 'Type',         accessor: (r) => TYPE_META[r.source_type].label,  format: 'text' },
  { header: 'Item',         accessor: (r) => r.item_name,                     format: 'text' },
  { header: 'Code',         accessor: (r) => r.code,                          format: 'text' },
  { header: 'Reference',    accessor: (r) => r.reference,                     format: 'text' },
  { header: 'Counterparty', accessor: (r) => r.counterparty,                  format: 'text' },
  { header: 'Division',     accessor: (r) => r.division_name,                 format: 'text' },
  { header: 'Qty',          accessor: (r) => r.qty,                           format: 'number' },
  { header: 'Cost (QAR)',   accessor: (r) => r.total_cost,                    format: 'currency', total: true },
]

function sortRows(rows: CogsDetailRow[], key: SortKey, dir: SortDir): CogsDetailRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp: number
    if (key === 'date') {
      cmp = a.date.localeCompare(b.date) || (TYPE_META[a.source_type].rank - TYPE_META[b.source_type].rank)
    } else {
      cmp = (TYPE_META[a.source_type].rank - TYPE_META[b.source_type].rank) || a.date.localeCompare(b.date)
    }
    if (cmp === 0) cmp = a.cogs_id.localeCompare(b.cogs_id) // deterministic tiebreak
    return cmp * sign
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" />
  return dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
}

export function CogsSourceDetailDialog({
  open,
  onOpenChange,
  filters,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  filters: ReportFilters
}) {
  const { data, isLoading } = useProfitLossCogsDetail(filters, open)
  const rows = data ?? EMPTY

  const [dateFilter, setDateFilter] = useState<string>('') // '' = all dates
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  // Apply the Date + Type filters, then the active sort.
  const filtered = useMemo(
    () => rows.filter((r) => (dateFilter === '' || r.date === dateFilter) && (typeFilter === 'all' || r.source_type === typeFilter)),
    [rows, dateFilter, typeFilter],
  )
  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  // Total reflects the currently filtered set (all pages).
  const total = useMemo(() => filtered.reduce((s, r) => s + (r.total_cost ?? 0), 0), [filtered])
  const filtering = dateFilter !== '' || typeFilter !== 'all'

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  )

  const divKey = filters.divisionIds.join(',')
  const whKey = filters.warehouseIds.join(',')

  // Reset the in-popup filters whenever the period / scope / open state changes.
  useEffect(() => {
    setDateFilter('')
    setTypeFilter('all')
  }, [open, filters.start, filters.end, divKey, whKey])

  // Snap back to page 1 whenever the data set, filters or ordering change.
  useEffect(() => {
    setPage(1)
  }, [open, sortKey, sortDir, dateFilter, typeFilter, filters.start, filters.end, divKey, whKey])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  async function doExport() {
    setExporting(true)
    try {
      await exportReportToExcel<CogsDetailRow>({
        filename: `COGS by entry (${filters.start} to ${filters.end})`,
        title: 'Cost of Goods Sold — by entry',
        subtitle: `${filters.start} → ${filters.end}${filtering ? ' · filtered' : ''}`,
        columns: EXPORT_COLS,
        rows: sorted,
        grandTotalLabel: filtering ? 'Filtered total' : 'Total COGS',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel export failed')
    } finally {
      setExporting(false)
    }
  }

  const rangeFrom = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeTo = Math.min(safePage * PAGE_SIZE, sorted.length)

  const pageBtn = cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'h-8 w-8 p-0 min-h-11 min-w-11 md:h-8 md:w-8 md:min-h-0 md:min-w-0')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-5xl 2xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Cost of Goods Sold — by entry</DialogTitle>
          <DialogDescription>
            Every cost that flowed through COGS {filters.start} → {filters.end}: customer sales,
            sale returns, internal consumption, and landed-cost adjustments (net). Sums to Total COGS.
          </DialogDescription>
        </DialogHeader>

        {/* Filters: Date (calendar) + Type (dropdown) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Date</span>
            <DatePicker
              value={dateFilter}
              onChange={setDateFilter}
              placeholder="All dates"
              className="w-40 min-h-11 md:min-h-0"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                aria-label="Clear date filter"
                className={cn(buttonVariants({ size: 'sm', variant: 'ghost' }), 'h-8 w-8 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Type</span>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter((v as TypeFilter) ?? 'all')}>
              <SelectTrigger size="sm" className="w-40 min-h-11 md:min-h-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {SOURCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_META[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Result count + Excel export */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            {isLoading
              ? 'Loading…'
              : sorted.length === 0
                ? 'No entries'
                : `Showing ${rangeFrom}–${rangeTo} of ${sorted.length}${filtering ? ` (filtered from ${rows.length})` : ''}`}
          </p>
          <button
            type="button"
            onClick={doExport}
            disabled={exporting || isLoading || sorted.length === 0}
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'gap-1.5 min-h-11 md:min-h-0')}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
            Export Excel
          </button>
        </div>

        {/* Fixed-height table so paging never resizes the dialog */}
        <div className="h-[26rem] max-h-[55vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('date')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    Date <SortIcon active={sortKey === 'date'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort('type')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    Type <SortIcon active={sortKey === 'type'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Reference</th>
                <th className="hidden px-3 py-2 font-medium md:table-cell">Division</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Qty</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Cost (QAR)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-3 w-16 animate-pulse rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    {rows.length === 0 ? 'No cost of goods sold in this period.' : 'No entries match the current filters.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const meta = TYPE_META[r.source_type]
                  return (
                    <tr key={r.cogs_id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.date}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={cn('text-[10px] font-normal whitespace-nowrap', meta.cls)}>
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="max-w-[340px]">
                          <div className="font-medium line-clamp-2" title={r.item_name}>{r.item_name}</div>
                          {r.code && <div className="text-[11px] text-muted-foreground font-mono">{r.code}</div>}
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell whitespace-nowrap">
                        {r.reference ?? '—'}
                        {r.counterparty && <span className="ml-1 text-[11px] text-muted-foreground">{r.counterparty}</span>}
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell whitespace-nowrap">{r.division_name ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.qty}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                          (r.total_cost ?? 0) < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                        )}
                      >
                        {QAR.format(r.total_cost ?? 0)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (left) + Total (right) — both always visible */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1 || sorted.length === 0}
              aria-label="Previous page"
              className={pageBtn}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs tabular-nums text-muted-foreground">Page {safePage} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={safePage >= pageCount || sorted.length === 0}
              aria-label="Next page"
              className={pageBtn}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{filtering ? 'Filtered total' : 'Total COGS'}</span>
            <span className="text-sm font-bold tabular-nums whitespace-nowrap">{QAR.format(total)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
