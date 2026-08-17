'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, Lock } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import { ReportGroupedTable } from '@/components/reports/ReportGroupedTable'
import { presetRange } from '@/components/reports/DateRangePicker'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { ReportExportMenu } from '@/components/reports/ReportExportMenu'
import { useProjectConsumptionReport, type ProjectConsumptionRow } from '@/hooks/reports/useProjectConsumptionReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useReportFilters } from '@/hooks/useReportFilters'
import { useDivisions } from '@/hooks/useDivisions'
import { cn } from '@/lib/utils'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

function ConsumerKindBadge({ kind }: { kind: string }) {
  const cls =
    kind === 'project' ? 'bg-primary/10 text-primary border-primary/30'
    : 'bg-muted text-muted-foreground border-muted-foreground/30'
  return <Badge className={cn('text-[10px] h-4 px-1.5 border font-normal capitalize hover:bg-current/10', cls)}>{kind}</Badge>
}

const columns: ReportColumn<ProjectConsumptionRow>[] = [
  { header: 'Type',       accessor: (r) => r.consumer_kind,          format: 'text',
    render: (r) => <ConsumerKindBadge kind={r.consumer_kind} /> },
  { header: 'Discipline', accessor: (r) => r.discipline_name ?? '—', format: 'text', wrap: true },
  { header: 'Milestone',  accessor: (r) => r.milestone_label,       format: 'text' },
  { header: 'Qty',        accessor: (r) => r.qty,                   format: 'number',   total: true },
  { header: 'Total Cost', accessor: (r) => r.total_cost,            format: 'currency', total: true },
]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 2xl:px-4 2xl:py-3 min-w-0">
      <div className="text-[10px] 2xl:text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base sm:text-lg 2xl:text-2xl font-semibold tabular-nums break-words">{value}</div>
    </div>
  )
}

export default function ProjectConsumptionReportPage() {
  const canView = useHasPermission(['reports.view', 'reports.project_consumption.view', 'consumption.cost.view'])
  const [filters, setFilters] = useReportFilters(() => {
    const r = presetRange('this-year')
    return { start: r.start, end: r.end, divisionIds: [], warehouseIds: [] }
  })

  const { data: rows = [], isLoading } = useProjectConsumptionReport(filters, canView)
  const { data: divisions = [] } = useDivisions()

  const totals = useMemo(() => {
    const spend = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0)
    const qty = rows.reduce((s, r) => s + (r.qty ?? 0), 0)
    const consumers = new Set(rows.map((r) => r.consumer_id)).size
    return { spend, qty, consumers }
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
        title="Project Consumption"
        description="Consumption spend per team or project, broken down by discipline and milestone."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Reports</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Project Consumption</span>
          </nav>
        }
        actions={
          <ReportExportMenu<ProjectConsumptionRow>
            filename="Project Consumption"
            title="Project Consumption"
            subtitle={subtitle}
            columns={columns}
            rows={rows}
            groupBy={(r) => r.consumer_name ?? '—'}
            grandTotalLabel="Grand total (all consumers)"
            disabled={rows.length === 0}
          />
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Total Spend" value={QAR.format(totals.spend)} />
        <Stat label="Total Qty" value={totals.qty.toLocaleString('en-US', { maximumFractionDigits: 2 })} />
        <Stat label="Consumers" value={String(totals.consumers)} />
      </div>

      <ReportFilterBar value={filters} onChange={setFilters} showDate />

      <ReportGroupedTable
        columns={columns}
        rows={rows}
        groupBy={(r) => r.consumer_name ?? '—'}
        isLoading={isLoading}
        grandTotalLabel="Grand total (all consumers)"
        emptyText="No consumption in the selected period."
      />
    </PageWrapper>
  )
}
