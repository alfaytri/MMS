'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Lock } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReportFilterBar, type ReportFilters } from '@/components/reports/ReportFilterBar'
import { ReportGroupedTable } from '@/components/reports/ReportGroupedTable'
import { presetRange } from '@/components/reports/DateRangePicker'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { ReportExportMenu } from '@/components/reports/ReportExportMenu'
import { DocLink } from '@/components/reports/DocLink'
import { docHrefFor, type DocKind } from '@/lib/reports/docLinks'
import { useCashReport, type CashRow } from '@/hooks/reports/useCashReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useDivisions } from '@/hooks/useDivisions'
import { cn } from '@/lib/utils'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

const columns: ReportColumn<CashRow>[] = [
  { header: 'Date',    accessor: (r) => (r.is_opening ? 'Opening' : r.date), format: 'text' },
  { header: 'Method',  accessor: (r) => r.payment_method, format: 'text',
    render: (r) => (r.is_opening ? <span className="font-medium">{r.payment_method}</span> : r.payment_method) },
  { header: 'Doc No',  accessor: (r) => r.doc_no, format: 'text',
    render: (r) => <DocLink href={r.doc_kind ? docHrefFor(r.doc_kind as DocKind, r.doc_no) : null} label={r.doc_no} /> },
  { header: 'Party',   accessor: (r) => r.party,  format: 'text' },
  { header: 'Debit',   accessor: (r) => r.debit ?? 0,  format: 'currency', total: true,
    render: (r) => (r.debit ? QAR.format(r.debit) : '') },
  { header: 'Credit',  accessor: (r) => r.credit ?? 0, format: 'currency', total: true,
    render: (r) => (r.credit ? QAR.format(r.credit) : '') },
  { header: 'Balance', accessor: (r) => r.balance ?? 0, format: 'currency', align: 'right',
    render: (r) => (
      <span className={cn('font-medium tabular-nums', (r.balance ?? 0) < 0 && 'text-destructive')}>
        {r.balance != null ? QAR.format(r.balance) : '—'}
      </span>
    ) },
]

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'neg' | 'pos' }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === 'neg' ? 'text-destructive' : tone === 'pos' ? 'text-success' : ''}`}>{value}</div>
    </div>
  )
}

export default function CashReportPage() {
  const canView = useHasPermission('reports.view')
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const r = presetRange('this-month')
    return { start: r.start, end: r.end, divisionIds: [], warehouseIds: [] }
  })

  const { data: rows = [], isLoading } = useCashReport(filters, canView)
  const { data: divisions = [] } = useDivisions()

  const totals = useMemo(() => {
    const moves = rows.filter((r) => !r.is_opening)
    const inSum  = moves.reduce((s, r) => s + (r.debit ?? 0), 0)
    const outSum = moves.reduce((s, r) => s + (r.credit ?? 0), 0)
    const closing = rows.length ? (rows[rows.length - 1].balance ?? 0) : 0
    return { inSum, outSum, closing }
  }, [rows])

  const subtitle = useMemo(() => {
    const dv = filters.divisionIds.length
      ? filters.divisionIds.map((id) => divisions.find((d) => d.id === id)?.short_name || divisions.find((d) => d.id === id)?.name).filter(Boolean).join(', ')
      : 'All divisions'
    return `${filters.start} → ${filters.end} · Divisions: ${dv}`
  }, [filters, divisions])

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
        title="Cash & Cash Equivalents"
        description="Cash-equivalent receipts and payments with a running balance. Which methods count as cash is set per method in Admin → Payment Methods."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Reports</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Cash</span>
          </nav>
        }
        actions={
          <ReportExportMenu<CashRow>
            filename="Cash & Cash Equivalents"
            title="Cash & Cash Equivalents"
            subtitle={subtitle}
            columns={columns}
            rows={rows}
            grandTotalLabel="Total movement"
            disabled={rows.length === 0}
          />
        }
      />

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Cash in" value={QAR.format(totals.inSum)} tone="pos" />
        <Stat label="Cash out" value={QAR.format(totals.outSum)} tone="neg" />
        <Stat label="Closing balance" value={QAR.format(totals.closing)} tone={totals.closing < 0 ? 'neg' : undefined} />
      </div>

      <ReportFilterBar value={filters} onChange={setFilters} showDate />

      <ReportGroupedTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        grandTotalLabel="Total movement"
        emptyText="No cash movements in the selected period."
      />
    </PageWrapper>
  )
}
