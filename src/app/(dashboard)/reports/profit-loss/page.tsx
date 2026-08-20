'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, Lock, Layers } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import { FxDetailDialog } from '@/components/reports/FxDetailDialog'
import { CogsSourceDetailDialog } from '@/components/reports/CogsSourceDetailDialog'
import { presetRange } from '@/components/reports/DateRangePicker'
import { ReportExportMenu } from '@/components/reports/ReportExportMenu'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { useProfitLossReport, type PnlBasis, type PnlStatement, type PnlStreamLine } from '@/hooks/reports/useProfitLossReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useReportFilters } from '@/hooks/useReportFilters'
import { useDivisions } from '@/hooks/useDivisions'
import { cn } from '@/lib/utils'
import { REVEAL_IN } from '@/lib/motion'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })
const STREAM_ORDER = ['Products', 'Spare Parts', 'Consumables', 'Tools', 'LC Variation']

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

/** A flat P&L line (FX / Scrap / Gross Profit / cash-basis rows). */
function PnlRow({
  label, amount, grand, drill, onClick, negativeAware,
}: {
  label: string
  amount: number | null
  grand?: boolean
  drill?: boolean
  onClick?: () => void
  negativeAware?: boolean
}) {
  const negative = negativeAware && (amount ?? 0) < 0
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2.5 2xl:px-6 2xl:py-3',
        grand && 'bg-primary/5 border-t-2 border-foreground/20',
        onClick && 'cursor-pointer transition-colors hover:bg-muted/40',
      )}
    >
      <span className={cn('inline-flex items-center gap-1.5', grand ? 'font-semibold' : 'text-foreground')}>
        {label}
        {drill && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary">
            <Layers className="h-3 w-3" /> details
          </span>
        )}
      </span>
      <span className={cn('tabular-nums whitespace-nowrap', grand && 'font-bold', negative && 'text-destructive')}>
        {amount != null ? QAR.format(amount) : ''}
      </span>
    </div>
  )
}

/** A collapsible P&L section (Revenue / COGS): total on the header, per-stream
 *  breakdown drops open with an animated height transition. */
function PnlSection({
  label, total, streams, open, onToggle, footer,
}: {
  label: string
  total: number
  streams: PnlStreamLine[]
  open: boolean
  onToggle: () => void
  footer?: ReactNode
}) {
  const hasBreakdown = streams.length > 0
  return (
    <div>
      <button
        type="button"
        onClick={hasBreakdown ? onToggle : undefined}
        aria-expanded={hasBreakdown ? open : undefined}
        className={cn(
          'flex w-full items-center justify-between gap-3 px-4 py-2.5 2xl:px-6 2xl:py-3 text-left',
          hasBreakdown && 'cursor-pointer transition-colors hover:bg-muted/40',
        )}
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          {hasBreakdown && (
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform duration-300 ease-out motion-reduce:transition-none',
                open && 'rotate-90',
              )}
            />
          )}
          {label}
        </span>
        <span className="tabular-nums whitespace-nowrap font-medium">{QAR.format(total)}</span>
      </button>
      {hasBreakdown && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
            open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="bg-muted/10 pb-1">
              {streams.map((s) => (
                <div
                  key={s.stream}
                  className="flex items-center justify-between gap-3 py-2 pl-10 pr-4 2xl:pr-6 text-sm text-muted-foreground"
                >
                  <span>{s.stream}</span>
                  <span className="tabular-nums whitespace-nowrap">{QAR.format(s.amount)}</span>
                </div>
              ))}
              {footer}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProfitLossReportPage() {
  const canView = useHasPermission('reports.profit_loss.view')
  const [basis, setBasis] = useState<PnlBasis>('accrual')
  const [fxOpen, setFxOpen] = useState(false)
  const [cogsOpen, setCogsOpen] = useState(false)
  const [revExpanded, setRevExpanded] = useState(false)
  const [cogsExpanded, setCogsExpanded] = useState(false)
  const [filters, setFilters] = useReportFilters(() => {
    const r = presetRange('this-month')
    return { start: r.start, end: r.end, divisionIds: [], warehouseIds: [] }
  })

  const { data: statement, isLoading } = useProfitLossReport(filters, basis, canView)
  const { data: divisions = [] } = useDivisions()

  const lines = useMemo(() => (statement ? buildLines(statement) : []), [statement])
  const revenueStreams = useMemo(() => (statement ? orderStreams(statement.revenue) : []), [statement])
  const cogsStreams = useMemo(() => (statement ? orderStreams(statement.cogs) : []), [statement])

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

      <div className={cn('rounded-lg border bg-card overflow-hidden max-w-2xl 2xl:max-w-4xl text-sm 2xl:text-base', REVEAL_IN)}>
        {isLoading ? (
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 2xl:px-6">
                <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : !statement ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">No data for the selected period.</div>
        ) : statement.basis === 'cash' ? (
          <div className="divide-y">
            <PnlRow label="Cash Received" amount={statement.cash_in ?? 0} />
            <PnlRow label="Cash Paid" amount={statement.cash_out ?? 0} />
            <PnlRow label="Exchange Gain / Loss" amount={statement.fx_net} drill onClick={() => setFxOpen(true)} negativeAware />
            <PnlRow label="Scrap & Defective" amount={statement.scrap} />
            <PnlRow label="Gross Profit" amount={statement.gross_profit} grand negativeAware />
          </div>
        ) : (
          <div className="divide-y">
            <PnlSection
              label="Revenue"
              total={statement.revenue_total ?? 0}
              streams={revenueStreams}
              open={revExpanded}
              onToggle={() => setRevExpanded((v) => !v)}
            />
            <PnlSection
              label="Cost of Goods Sold"
              total={statement.cogs_total ?? 0}
              streams={cogsStreams}
              open={cogsExpanded}
              onToggle={() => setCogsExpanded((v) => !v)}
              footer={
                <button
                  type="button"
                  onClick={() => setCogsOpen(true)}
                  className="inline-flex items-center gap-1 py-2 pl-10 pr-4 2xl:pr-6 text-[11px] font-medium text-primary hover:underline"
                >
                  <Layers className="h-3 w-3" /> View COGS by source
                </button>
              }
            />
            <PnlRow label="Exchange Gain / Loss" amount={statement.fx_net} drill onClick={() => setFxOpen(true)} negativeAware />
            <PnlRow label="Scrap & Defective" amount={statement.scrap} />
            <PnlRow label="Gross Profit" amount={statement.gross_profit} grand negativeAware />
          </div>
        )}
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
