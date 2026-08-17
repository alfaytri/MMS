'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, Lock } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import { ReportGroupedTable } from '@/components/reports/ReportGroupedTable'
import { presetRange } from '@/components/reports/DateRangePicker'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { ReportExportMenu } from '@/components/reports/ReportExportMenu'
import { useProjectConsumptionReport, type ProjectConsumptionRow } from '@/hooks/reports/useProjectConsumptionReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useReportFilters } from '@/hooks/useReportFilters'
import { useDivisions } from '@/hooks/useDivisions'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

// Teams consume directly — they carry no discipline/milestone tags (those are
// project-only), so the on-screen Teams table drops both columns and leads with
// the date: what a team consumed, and when.
const teamColumns: ReportColumn<ProjectConsumptionRow>[] = [
  { header: 'Date',       accessor: (r) => r.consumed_on,      format: 'text' },
  { header: 'Item',       accessor: (r) => r.item_name ?? '—', format: 'text', wrap: true },
  { header: 'Qty',        accessor: (r) => r.qty,              format: 'number',   total: true },
  { header: 'Total Cost', accessor: (r) => r.total_cost,       format: 'currency', total: true },
]

// Projects keep the full breakdown — discipline and milestone are the tags a
// project's spend is grouped by.
const projectColumns: ReportColumn<ProjectConsumptionRow>[] = [
  { header: 'Discipline', accessor: (r) => r.discipline_name ?? '—', format: 'text', wrap: true },
  { header: 'Milestone',  accessor: (r) => r.milestone_label,        format: 'text' },
  { header: 'Item',       accessor: (r) => r.item_name ?? '—',       format: 'text', wrap: true },
  { header: 'Date',       accessor: (r) => r.consumed_on,            format: 'text' },
  { header: 'Qty',        accessor: (r) => r.qty,                    format: 'number',   total: true },
  { header: 'Total Cost', accessor: (r) => r.total_cost,             format: 'currency', total: true },
]

// The flat export keeps a uniform superset (Type + every dimension) so teams and
// projects share one sheet; discipline/milestone stay blank for team rows.
const exportColumns: ReportColumn<ProjectConsumptionRow>[] = [
  { header: 'Type', accessor: (r) => (r.consumer_kind === 'project' ? 'Project' : 'Team'), format: 'text' },
  ...projectColumns,
]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 2xl:px-4 2xl:py-3 min-w-0">
      <div className="text-[10px] 2xl:text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base sm:text-lg 2xl:text-2xl font-semibold tabular-nums break-words">{value}</div>
    </div>
  )
}

export default function ConsumptionReportPage() {
  const canView = useHasPermission(['reports.view', 'reports.project_consumption.view', 'consumption.cost.view'])
  const [filters, setFilters] = useReportFilters(() => {
    const r = presetRange('this-year')
    return { start: r.start, end: r.end, divisionIds: [], warehouseIds: [] }
  })

  const { data: rows = [], isLoading } = useProjectConsumptionReport(filters, canView)
  const { data: divisions = [] } = useDivisions()

  // Split the consumers by kind — Teams vs Projects — into two sections.
  const teamRows = useMemo(() => rows.filter((r) => r.consumer_kind !== 'project'), [rows])
  const projectRows = useMemo(() => rows.filter((r) => r.consumer_kind === 'project'), [rows])

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
        title="Consumption"
        description="Consumption spend split into Teams and Projects — each item consumed, with its date, discipline and milestone."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Reports</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Consumption</span>
          </nav>
        }
        actions={
          <ReportExportMenu<ProjectConsumptionRow>
            filename="Consumption"
            title="Consumption"
            subtitle={subtitle}
            columns={exportColumns}
            rows={rows}
            groupBy={(r) => `${r.consumer_kind === 'project' ? 'Project' : 'Team'} — ${r.consumer_name ?? '—'}`}
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

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">👷 Teams</h2>
        <ReportGroupedTable
          columns={teamColumns}
          rows={teamRows}
          groupBy={(r) => r.consumer_name ?? '—'}
          isLoading={isLoading}
          grandTotalLabel="All teams"
          emptyText="No team consumption in the selected period."
        />
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">🏗️ Projects</h2>
        <ReportGroupedTable
          columns={projectColumns}
          rows={projectRows}
          groupBy={(r) => r.consumer_name ?? '—'}
          isLoading={isLoading}
          grandTotalLabel="All projects"
          emptyText="No project consumption in the selected period."
        />
      </section>
    </PageWrapper>
  )
}
