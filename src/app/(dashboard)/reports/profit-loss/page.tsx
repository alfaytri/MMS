'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Lock, Layers } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReportFilterBar, type ReportFilters } from '@/components/reports/ReportFilterBar'
import { FxDetailDialog } from '@/components/reports/FxDetailDialog'
import { CogsSourceDetailDialog } from '@/components/reports/CogsSourceDetailDialog'
import { presetRange } from '@/components/reports/DateRangePicker'
import { ReportExportMenu } from '@/components/reports/ReportExportMenu'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { useProfitLossReport, type PnlBasis, type PnlStatement, type PnlStreamLine } from '@/hooks/reports/useProfitLossReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useDivisions } from '@/hooks/useDivisions'
import { cn } from '@/lib/utils'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })
const STREAM_ORDER = ['Products', 'Spare Parts', 'Consumables', 'Tools']

type Line = { label: string; amount: number | null; level: 0 | 1; kind: 'header' | 'line' | 'subtotal' | 'grand' }

function orderStreams(lines: PnlStreamLine[] = []): PnlStreamLine[] {
  const map = new Map(lines.map((l) => [l.stream, l.amount]))
  const known = STREAM_ORDER.filter((s) => map.has(s)).map((s) => ({ stream: s, amount: map.get(s) as number }))
  const extra = lines.filter((l) => !STREAM_ORDER.includes(l.stream))
  return [...known, ...extra]
}

function buildLines(s: PnlStatement): Line[] {
  if (s.basis === 'cash') {
    return [
      { label: 'Cash Received', amount: s.cash_in ?? 0, level: 0, kind: 'line' },
      { label: 'Cash Paid', amount: s.cash_out ?? 0, level: 0, kind: 'line' },
      { label: 'Exchange Gain / Loss', amount: s.fx_net, level: 0, kind: 'line' },
      { label: 'Scrap & Defective', amount: s.scrap, level: 0, kind: 'line' },
      { label: 'Gross Profit', amount: s.gross_profit, level: 0, kind: 'grand' },
    ]
  }
  return [
    { label: 'Revenue', amount: null, level: 0, kind: 'header' },
    ...orderStreams(s.revenue).map((l): Line => ({ label: l.stream, amount: l.amount, level: 1, kind: 'line' })),
    { label: 'Total Revenue', amount: s.revenue_total ?? 0, level: 0, kind: 'subtotal' },
    { label: 'Cost of Goods Sold', amount: null, level: 0, kind: 'header' },
    ...orderStreams(s.cogs).map((l): Line => ({ label: l.stream, amount: l.amount, level: 1, kind: 'line' })),
    { label: 'Total COGS', amount: s.cogs_total ?? 0, level: 0, kind: 'subtotal' },
    { label: 'Exchange Gain / Loss', amount: s.fx_net, level: 0, kind: 'line' },
    { label: 'Scrap & Defective', amount: s.scrap, level: 0, kind: 'line' },
    { label: 'Gross Profit', amount: s.gross_profit, level: 0, kind: 'grand' },
  ]
}

export default function ProfitLossReportPage() {
  const canView = useHasPermission('reports.accounting.view')
  const [basis, setBasis] = useState<PnlBasis>('accrual')
  const [fxOpen, setFxOpen] = useState(false)
  const [cogsOpen, setCogsOpen] = useState(false)
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const r = presetRange('this-month')
    return { start: r.start, end: r.end, divisionIds: [], warehouseIds: [] }
  })

  const { data: statement, isLoading } = useProfitLossReport(filters, basis, canView)
  const { data: divisions = [] } = useDivisions()

  const lines = useMemo(() => (statement ? buildLines(statement) : []), [statement])

  const subtitle = useMemo(() => {
    const dv = filters.divisionIds.length
      ? filters.divisionIds.map((id) => divisions.find((d) => d.id === id)?.short_name || divisions.find((d) => d.id === id)?.name).filter(Boolean).join(', ')
      : 'All divisions'
    return `${filters.start} → ${filters.end} · ${basis === 'cash' ? 'Cash basis' : 'Accrual basis'} · Divisions: ${dv}`
  }, [filters, divisions, basis])

  const pnlCols: ReportColumn<Line>[] = [
    { header: 'Description', accessor: (r) => (r.level === 1 ? `    ${r.label}` : r.label), format: 'text' },
    { header: 'Amount', accessor: (r) => r.amount, format: 'currency' },
  ]

  if (!canView) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Lock className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">You don&apos;t have permission to view reports.</p>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Profit & Loss"
        description="Revenue and COGS by stream (Products / Spare Parts / Consumables / Tools) with exchange and scrap, on an accrual or cash basis."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Reports</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Profit &amp; Loss</span>
          </nav>
        }
        actions={
          <ReportExportMenu<Line>
            filename={`Profit and Loss (${basis})`}
            title="Profit & Loss"
            subtitle={subtitle}
            columns={pnlCols}
            rows={lines}
            grandTotalLabel=""
            disabled={!statement}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-muted/30 p-1">
          {(['accrual', 'cash'] as PnlBasis[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBasis(b)}
              className={cn(
                'h-7 min-h-11 md:min-h-0 rounded px-3 text-xs font-medium capitalize transition-colors',
                basis === b ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      <ReportFilterBar value={filters} onChange={setFilters} showDate showWarehouse />

      <div className="rounded-lg border bg-card overflow-hidden max-w-2xl 2xl:max-w-4xl">
        <table className="w-full text-sm 2xl:text-base">
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2 2xl:px-6 2xl:py-3"><div className="h-3 w-40 animate-pulse rounded bg-muted" /></td>
                  <td className="px-4 py-2 2xl:px-6 2xl:py-3"><div className="ml-auto h-3 w-24 animate-pulse rounded bg-muted" /></td>
                </tr>
              ))
            ) : !statement ? (
              <tr><td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={2}>No data for the selected period.</td></tr>
            ) : (
              lines.map((l, i) => {
                const isFx = l.label === 'Exchange Gain / Loss'
                const isCogs = l.label === 'Total COGS'
                const isDrillable = isFx || isCogs
                return (
                <tr
                  key={`${l.label}-${i}`}
                  onClick={isFx ? () => setFxOpen(true) : isCogs ? () => setCogsOpen(true) : undefined}
                  className={cn(
                    'border-b last:border-0',
                    l.kind === 'grand' && 'bg-primary/5 border-t-2 border-foreground/20',
                    l.kind === 'subtotal' && 'bg-muted/40',
                    l.kind === 'header' && 'bg-muted/20',
                    isDrillable && 'cursor-pointer transition-colors hover:bg-muted/40',
                  )}
                >
                  <td className={cn(
                    'px-4 py-2 2xl:px-6 2xl:py-3',
                    l.level === 1 && 'pl-8 text-muted-foreground',
                    (l.kind === 'header') && 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                    l.kind === 'subtotal' && 'font-medium',
                    l.kind === 'grand' && 'font-semibold',
                  )}>
                    {isDrillable ? (
                      <span className="inline-flex items-center gap-1.5">
                        {l.label}
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary">
                          <Layers className="h-3 w-3" /> details
                        </span>
                      </span>
                    ) : (
                      l.label
                    )}
                  </td>
                  <td className={cn(
                    'px-4 py-2 2xl:px-6 2xl:py-3 text-right tabular-nums whitespace-nowrap',
                    l.kind === 'subtotal' && 'font-medium',
                    l.kind === 'grand' && 'font-bold',
                    (l.kind === 'grand' || isFx) && (l.amount ?? 0) < 0 && 'text-destructive',
                  )}>
                    {l.amount != null ? QAR.format(l.amount) : ''}
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>

      {statement && (
        <p className="text-[11px] 2xl:text-xs text-muted-foreground max-w-2xl 2xl:max-w-4xl">
          Gross Profit = Revenue − COGS + Exchange Gain/Loss − Scrap. &ldquo;Scrap &amp; Defective&rdquo; counts
          approved write-offs from the stock-adjustment &ldquo;Write Off&rdquo; flow — both good-stock and
          damaged-stock write-offs are division- and warehouse-scoped (damaged stock is attributed to the
          division it was damaged in). Reads 0 until write-offs are booked.
        </p>
      )}

      <FxDetailDialog open={fxOpen} onOpenChange={setFxOpen} filters={filters} />
      <CogsSourceDetailDialog open={cogsOpen} onOpenChange={setCogsOpen} filters={filters} />
    </PageWrapper>
  )
}
