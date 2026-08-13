'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Lock } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { ReportFilterBar, type ReportFilters } from '@/components/reports/ReportFilterBar'
import { ReportGroupedTable } from '@/components/reports/ReportGroupedTable'
import { presetRange } from '@/components/reports/DateRangePicker'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { ReportExportMenu } from '@/components/reports/ReportExportMenu'
import { DocLink } from '@/components/reports/DocLink'
import { docHrefFor } from '@/lib/reports/docLinks'
import { useReceivablesReport, type ReceivableRow } from '@/hooks/reports/useReceivablesReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useDivisions } from '@/hooks/useDivisions'
import { cn } from '@/lib/utils'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Paid'     ? 'bg-success/10 text-success border-success/30'
    : status === 'Over Due' ? 'bg-destructive/10 text-destructive border-destructive/30'
    : 'bg-warning/15 text-warning-foreground border-warning/40'
  return <Badge className={cn('text-[10px] h-4 px-1.5 border font-normal hover:bg-current/10', cls)}>{status}</Badge>
}

const columns: ReportColumn<ReceivableRow>[] = [
  { header: 'Invoice No', accessor: (r) => r.invoice_no,  format: 'text',
    render: (r) => <DocLink href={docHrefFor('invoice', r.invoice_no)} label={r.invoice_no} /> },
  { header: 'Customer',   accessor: (r) => r.customer,    format: 'text', wrap: true },
  { header: 'SO No',      accessor: (r) => r.so_no,       format: 'text',
    render: (r) => r.sale_order_id ? <DocLink href={docHrefFor('so', r.so_no)} label={r.so_no} /> : <span>{r.so_no ?? '—'}</span> },
  { header: 'Inv. Date',  accessor: (r) => r.issued_date, format: 'text' },
  { header: 'Due Date',   accessor: (r) => r.due_date,    format: 'text' },
  { header: 'Amount',     accessor: (r) => r.amount,      format: 'currency', total: true },
  { header: 'Paid',       accessor: (r) => r.paid,        format: 'currency', total: true },
  { header: 'Due',        accessor: (r) => r.due,         format: 'currency', total: true },
  { header: 'Status',     accessor: (r) => r.status,      format: 'text', render: (r) => <StatusBadge status={r.status} /> },
]

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'neg' }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 2xl:px-4 2xl:py-3 min-w-0">
      <div className="text-[10px] 2xl:text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base sm:text-lg 2xl:text-2xl font-semibold tabular-nums break-words ${tone === 'neg' ? 'text-destructive' : ''}`}>{value}</div>
    </div>
  )
}

export default function ReceivablesReportPage() {
  const canView = useHasPermission('reports.accounting.view')
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const r = presetRange('this-year')
    return { start: r.start, end: r.end, divisionIds: [], warehouseIds: [] }
  })

  const { data: rows = [], isLoading } = useReceivablesReport(filters, canView)
  const { data: divisions = [] } = useDivisions()

  const totals = useMemo(() => {
    const outstanding = rows.reduce((s, r) => s + (r.due ?? 0), 0)
    const overdue = rows.filter((r) => r.status === 'Over Due').reduce((s, r) => s + (r.due ?? 0), 0)
    return { outstanding, overdue, count: rows.length }
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
        title="Accounts Receivable"
        description="Outstanding customer balances per invoice, with ageing status."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Reports</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Accounts Receivable</span>
          </nav>
        }
        actions={
          <ReportExportMenu<ReceivableRow>
            filename="Accounts Receivable"
            title="Accounts Receivable"
            subtitle={subtitle}
            columns={columns}
            rows={rows}
            groupBy={(r) => r.division_name ?? '—'}
            grandTotalLabel="Grand total (all divisions)"
            disabled={rows.length === 0}
          />
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Outstanding" value={QAR.format(totals.outstanding)} />
        <Stat label="Overdue" value={QAR.format(totals.overdue)} tone="neg" />
        <Stat label="Invoices" value={String(totals.count)} />
      </div>

      <ReportFilterBar value={filters} onChange={setFilters} showDate />

      <ReportGroupedTable
        columns={columns}
        rows={rows}
        groupBy={(r) => r.division_name ?? '—'}
        isLoading={isLoading}
        grandTotalLabel="Grand total (all divisions)"
        emptyText="No invoices in the selected period."
      />
    </PageWrapper>
  )
}
