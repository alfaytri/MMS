'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ExternalLink, FileSpreadsheet, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, X,
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
import { buttonVariants } from '@/components/ui/button'
import { exportReportToExcel } from '@/lib/reports/reportExcel'
import type { ReportColumn } from '@/lib/reports/reportColumns'
import { useProfitLossFxDetail, type FxDetailRow } from '@/hooks/reports/useProfitLossFxDetail'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })
const PAGE_SIZE = 10
const EMPTY: FxDetailRow[] = []
const ALL_CURR = '__all__'

type SortKey = 'date' | 'currency'
type SortDir = 'asc' | 'desc'

/** Where "open document" points, per doc type. PO/SO deep-link into their list
 * pages via a query param the list reads into its search box; Bill/Invoice have
 * their own detail routes. */
function docHref(r: FxDetailRow): string | null {
  switch (r.doc_type) {
    case 'Purchase Order': return r.doc_number ? `/purchase/orders?po=${encodeURIComponent(r.doc_number)}` : null
    case 'Sale Order':     return r.doc_number ? `/sales/orders?so=${encodeURIComponent(r.doc_number)}` : null
    case 'Bill':           return r.doc_id ? `/purchase/bills/${r.doc_id}` : null
    case 'Invoice':        return r.doc_id ? `/sales/invoices/${r.doc_id}` : null
    default:               return null
  }
}

function fxKey(r: FxDetailRow): string {
  return `${r.payment_id}-${r.division_id ?? 'na'}`
}

// One definition drives the styled Excel export (filtered rows, current sort order).
const EXPORT_COLS: ReportColumn<FxDetailRow>[] = [
  { header: 'Date',         accessor: (r) => r.payment_date,             format: 'text' },
  { header: 'Document',     accessor: (r) => r.doc_number ?? r.doc_type, format: 'text' },
  { header: 'Doc Type',     accessor: (r) => r.doc_type,                 format: 'text' },
  { header: 'Counterparty', accessor: (r) => r.counterparty,             format: 'text' },
  { header: 'Division',     accessor: (r) => r.division_name,            format: 'text' },
  { header: 'Currency',     accessor: (r) => r.currency,                 format: 'text' },
  { header: 'Amount',       accessor: (r) => r.amount,                   format: 'number' },
  { header: 'FX (QAR)',     accessor: (r) => r.net_fx,                   format: 'currency', total: true },
]

function sortRows(rows: FxDetailRow[], key: SortKey, dir: SortDir): FxDetailRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp: number
    if (key === 'date') {
      cmp = a.payment_date.localeCompare(b.payment_date) || (a.currency ?? '').localeCompare(b.currency ?? '')
    } else {
      cmp = (a.currency ?? '').localeCompare(b.currency ?? '') || a.payment_date.localeCompare(b.payment_date)
    }
    if (cmp === 0) cmp = fxKey(a).localeCompare(fxKey(b)) // deterministic tiebreak
    return cmp * sign
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" />
  return dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
}

export function FxDetailDialog({
  open,
  onOpenChange,
  filters,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  filters: ReportFilters
}) {
  const { data, isLoading } = useProfitLossFxDetail(filters, open)
  const rows = data ?? EMPTY

  const [dateFilter, setDateFilter] = useState<string>('') // '' = all dates
  const [currencyFilter, setCurrencyFilter] = useState<string>(ALL_CURR)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  // Distinct currencies present → the Currency filter options.
  const currencies = useMemo(
    () => Array.from(new Set(rows.map((r) => r.currency).filter((c): c is string => !!c))).sort(),
    [rows],
  )

  // Apply the Date + Currency filters, then the active sort.
  const filtered = useMemo(
    () => rows.filter((r) => (dateFilter === '' || r.payment_date === dateFilter) && (currencyFilter === ALL_CURR || r.currency === currencyFilter)),
    [rows, dateFilter, currencyFilter],
  )
  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  // Net FX reflects the currently filtered set (all pages).
  const total = useMemo(() => filtered.reduce((s, r) => s + (r.net_fx ?? 0), 0), [filtered])
  const filtering = dateFilter !== '' || currencyFilter !== ALL_CURR

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageRows = useMemo(
    () => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sorted, safePage],
  )

  const divKey = filters.divisionIds.join(',')

  // Reset the in-popup filters whenever the period / scope / open state changes.
  useEffect(() => {
    setDateFilter('')
    setCurrencyFilter(ALL_CURR)
  }, [open, filters.start, filters.end, divKey])

  // Snap back to page 1 whenever the data set, filters or ordering change.
  useEffect(() => {
    setPage(1)
  }, [open, sortKey, sortDir, dateFilter, currencyFilter, filters.start, filters.end, divKey])

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
      await exportReportToExcel<FxDetailRow>({
        filename: `Exchange gain-loss by document (${filters.start} to ${filters.end})`,
        title: 'Exchange Gain / Loss — by document',
        subtitle: `${filters.start} → ${filters.end}${filtering ? ' · filtered' : ''}`,
        columns: EXPORT_COLS,
        rows: sorted,
        grandTotalLabel: filtering ? 'Net FX (filtered)' : 'Net Exchange Gain / Loss',
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Excel export failed')
    } finally {
      setExporting(false)
    }
  }

  const rangeFrom = sorted.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const rangeTo = Math.min(safePage * PAGE_SIZE, sorted.length)
  const totalCls = total < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'

  const pageBtn = cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'h-8 w-8 p-0 min-h-11 min-w-11 md:h-8 md:w-8 md:min-h-0 md:min-w-0')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-3xl 2xl:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Exchange Gain / Loss — by document</DialogTitle>
          <DialogDescription>
            Realized FX from payments settled {filters.start} → {filters.end}. Open a document to confirm.
          </DialogDescription>
        </DialogHeader>

        {/* Filters: Date (calendar) + Currency (dropdown) */}
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
          {currencies.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Currency</span>
              <Select value={currencyFilter} onValueChange={(v) => setCurrencyFilter(v ?? ALL_CURR)}>
                <SelectTrigger size="sm" className="w-36 min-h-11 md:min-h-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CURR}>All currencies</SelectItem>
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
                <th className="px-3 py-2 font-medium">Document</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Counterparty</th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell">Division</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggleSort('currency')}
                    className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    Currency <SortIcon active={sortKey === 'currency'} dir={sortDir} />
                  </button>
                </th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">FX (QAR)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-3 py-2"><div className="h-3 w-20 animate-pulse rounded bg-muted" /></td>
                    ))}
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                    {rows.length === 0 ? 'No exchange gain/loss in this period.' : 'No entries match the current filters.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((r, i) => {
                  const href = docHref(r)
                  const label = r.doc_number ?? r.doc_type
                  return (
                    <tr key={fxKey(r)} className={cn('border-t hover:bg-muted/30', STAGGER_IN)} style={staggerDelay(i)}>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.payment_date}</td>
                      <td className="px-3 py-2">
                        {href ? (
                          <Link
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            {label}
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </Link>
                        ) : (
                          <span className="font-medium">{label}</span>
                        )}
                        <span className="ml-1 text-[11px] text-muted-foreground">{r.doc_type}</span>
                      </td>
                      <td className="hidden px-3 py-2 sm:table-cell">{r.counterparty ?? '—'}</td>
                      <td className="hidden px-3 py-2 sm:table-cell whitespace-nowrap">{r.division_name ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.currency ?? '—'}</td>
                      <td
                        className={cn(
                          'px-3 py-2 text-right tabular-nums whitespace-nowrap',
                          (r.net_fx ?? 0) < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {QAR.format(r.net_fx ?? 0)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (left) + Net FX (right) — both always visible */}
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
            <span className="text-sm font-semibold">{filtering ? 'Net FX (filtered)' : 'Net Exchange Gain / Loss'}</span>
            <span className={cn('text-sm font-bold tabular-nums whitespace-nowrap', totalCls)}>{QAR.format(total)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
