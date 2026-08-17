'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight, Lock, CalendarIcon, Users, FolderKanban } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReportFilterBar } from '@/components/reports/ReportFilterBar'
import { ReportGroupedTable } from '@/components/reports/ReportGroupedTable'
import { ConsumptionTeamCards } from '@/components/reports/ConsumptionTeamCards'
import { presetRange } from '@/components/reports/DateRangePicker'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { ReportExportMenu } from '@/components/reports/ReportExportMenu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { format, parse } from 'date-fns'
import { useProjectConsumptionReport, type ProjectConsumptionRow } from '@/hooks/reports/useProjectConsumptionReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useReportFilters } from '@/hooks/useReportFilters'
import { useDivisions } from '@/hooks/useDivisions'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

// Teams render as day-cards (see ConsumptionTeamCards), but the export is still a
// flat sheet — one row per consumption with Date as a real, sortable column.
const teamExportColumns: ReportColumn<ProjectConsumptionRow>[] = [
  { header: 'Date',       accessor: (r) => r.consumed_on,      format: 'text' },
  { header: 'Item',       accessor: (r) => r.item_name ?? '—', format: 'text', wrap: true },
  { header: 'Qty',        accessor: (r) => r.qty,              format: 'number',   total: true },
  { header: 'Total Cost', accessor: (r) => r.total_cost,       format: 'currency', total: true },
]

// Projects keep the full breakdown — discipline and milestone are the tags a
// project's spend is grouped by. The same columns drive the screen and the export.
const projectColumns: ReportColumn<ProjectConsumptionRow>[] = [
  { header: 'Discipline', accessor: (r) => r.discipline_name ?? '—', format: 'text', wrap: true },
  { header: 'Milestone',  accessor: (r) => r.milestone_label,        format: 'text' },
  { header: 'Item',       accessor: (r) => r.item_name ?? '—',       format: 'text', wrap: true },
  { header: 'Date',       accessor: (r) => r.consumed_on,            format: 'text' },
  { header: 'Qty',        accessor: (r) => r.qty,                    format: 'number',   total: true },
  { header: 'Total Cost', accessor: (r) => r.total_cost,             format: 'currency', total: true },
]

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 2xl:px-4 2xl:py-3 min-w-0">
      <div className="text-[10px] 2xl:text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base sm:text-lg 2xl:text-2xl font-semibold tabular-nums break-words">{value}</div>
    </div>
  )
}

// A single-select filter chip that matches the report filter bar. Displays a
// human label (never the raw id) via the Select item registry; height matches
// the surrounding controls, so picking a value never shifts the row.
function FilterSelect({
  icon, value, onChange, options,
}: {
  icon: ReactNode
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? 'all')}>
      <SelectTrigger className="min-h-11 md:min-h-0 min-w-[150px] gap-1.5 font-normal">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// The day filter is a calendar (not a text list of dates). "All days" clears it;
// picking a day narrows both sections. Opens on the most-recent-consumption month.
function DayFilter({
  value, onChange, anchorDate,
}: {
  value: string
  onChange: (v: string) => void
  anchorDate?: string
}) {
  const [open, setOpen] = useState(false)
  const date = value !== 'all' ? parse(value, 'yyyy-MM-dd', new Date()) : undefined
  const valid = !!date && !isNaN(date.getTime())
  const anchor = anchorDate ? parse(anchorDate, 'yyyy-MM-dd', new Date()) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <Button
            {...props}
            type="button"
            variant="outline"
            className="h-9 min-h-11 md:min-h-0 min-w-[150px] justify-start gap-1.5 font-normal"
          >
            <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{valid ? format(date!, 'dd MMM yyyy') : 'All days'}</span>
          </Button>
        )}
      />
      <PopoverContent className="w-auto p-0" align="start">
        <button
          type="button"
          onClick={() => { onChange('all'); setOpen(false) }}
          className={cn(
            'flex w-full items-center gap-2 border-b px-3 py-2 text-sm hover:bg-accent transition-colors',
            value === 'all' && 'font-medium',
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" /> All days
        </button>
        <Calendar
          mode="single"
          selected={valid ? date : undefined}
          onSelect={(sel: Date | undefined) => { onChange(sel ? format(sel, 'yyyy-MM-dd') : 'all'); setOpen(false) }}
          defaultMonth={valid ? date : anchor}
          autoFocus
        />
      </PopoverContent>
    </Popover>
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

  // Drill-in filters: Day narrows both sections; Team/Project narrow their own.
  const [dayFilter, setDayFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')

  // Month the calendar opens on: the most recent consumption date in range.
  const anchorDay = useMemo(() => {
    const days = rows.map((r) => r.consumed_on)
    return days.length ? days.reduce((m, d) => (d > m ? d : m)) : undefined
  }, [rows])

  const teamOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of teamRows) map.set(r.consumer_id, r.consumer_name)
    const opts = [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
    return [{ value: 'all', label: 'All teams' }, ...opts.map(([id, name]) => ({ value: id, label: name }))]
  }, [teamRows])

  const projectOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of projectRows) map.set(r.consumer_id, r.consumer_name)
    const opts = [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }))
    return [{ value: 'all', label: 'All projects' }, ...opts.map(([id, name]) => ({ value: id, label: name }))]
  }, [projectRows])

  // Reset a filter to "all" once its selected value drops out of the data
  // (e.g. after changing the date range), so it never strands an empty section.
  useEffect(() => { if (teamFilter !== 'all' && !teamRows.some((r) => r.consumer_id === teamFilter)) setTeamFilter('all') }, [teamRows, teamFilter])
  useEffect(() => { if (projectFilter !== 'all' && !projectRows.some((r) => r.consumer_id === projectFilter)) setProjectFilter('all') }, [projectRows, projectFilter])

  const shownTeamRows = useMemo(
    () => teamRows.filter((r) => (teamFilter === 'all' || r.consumer_id === teamFilter) && (dayFilter === 'all' || r.consumed_on === dayFilter)),
    [teamRows, teamFilter, dayFilter],
  )
  const shownProjectRows = useMemo(
    () => projectRows.filter((r) => (projectFilter === 'all' || r.consumer_id === projectFilter) && (dayFilter === 'all' || r.consumed_on === dayFilter)),
    [projectRows, projectFilter, dayFilter],
  )

  const totals = useMemo(() => {
    const shown = [...shownTeamRows, ...shownProjectRows]
    const spend = shown.reduce((s, r) => s + (r.total_cost ?? 0), 0)
    const qty = shown.reduce((s, r) => s + (r.qty ?? 0), 0)
    const consumers = new Set(shown.map((r) => r.consumer_id)).size
    return { spend, qty, consumers }
  }, [shownTeamRows, shownProjectRows])

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
        description="What each team and project consumed — by day for teams, by discipline and milestone for projects."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Reports</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Consumption</span>
          </nav>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Total Spend" value={QAR.format(totals.spend)} />
        <Stat label="Total Qty" value={NUM.format(totals.qty)} />
        <Stat label="Consumers" value={String(totals.consumers)} />
      </div>

      <ReportFilterBar value={filters} onChange={setFilters} showDate>
        <DayFilter value={dayFilter} onChange={setDayFilter} anchorDate={anchorDay} />
      </ReportFilterBar>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold 2xl:text-base">👷 Teams</h2>
          <div className="flex items-center gap-2">
            <FilterSelect
              icon={<Users className="h-3.5 w-3.5" />}
              value={teamOptions.some((o) => o.value === teamFilter) ? teamFilter : 'all'}
              onChange={setTeamFilter}
              options={teamOptions}
            />
            <ReportExportMenu<ProjectConsumptionRow>
              filename="Consumption — Teams"
              title="Consumption — Teams"
              subtitle={subtitle}
              columns={teamExportColumns}
              rows={shownTeamRows}
              groupBy={(r) => r.consumer_name ?? '—'}
              grandTotalLabel="All teams"
              disabled={shownTeamRows.length === 0}
            />
          </div>
        </div>
        <ConsumptionTeamCards rows={shownTeamRows} isLoading={isLoading} />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold 2xl:text-base">🏗️ Projects</h2>
          <div className="flex items-center gap-2">
            <FilterSelect
              icon={<FolderKanban className="h-3.5 w-3.5" />}
              value={projectOptions.some((o) => o.value === projectFilter) ? projectFilter : 'all'}
              onChange={setProjectFilter}
              options={projectOptions}
            />
            <ReportExportMenu<ProjectConsumptionRow>
              filename="Consumption — Projects"
              title="Consumption — Projects"
              subtitle={subtitle}
              columns={projectColumns}
              rows={shownProjectRows}
              groupBy={(r) => r.consumer_name ?? '—'}
              grandTotalLabel="All projects"
              disabled={shownProjectRows.length === 0}
            />
          </div>
        </div>
        <ReportGroupedTable
          columns={projectColumns}
          rows={shownProjectRows}
          groupBy={(r) => r.consumer_name ?? '—'}
          isLoading={isLoading}
          grandTotalLabel="All projects"
          emptyText="No project consumption in the selected period."
        />
      </section>
    </PageWrapper>
  )
}
