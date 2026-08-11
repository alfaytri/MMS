'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, FileSpreadsheet, Lock } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { ReportFilterBar, type ReportFilters } from '@/components/reports/ReportFilterBar'
import { ReportGroupedTable } from '@/components/reports/ReportGroupedTable'
import { presetRange } from '@/components/reports/DateRangePicker'
import { type ReportColumn } from '@/lib/reports/reportColumns'
import { exportReportToExcel } from '@/lib/reports/reportExcel'
import { DocLink } from '@/components/reports/DocLink'
import { docHrefFor } from '@/lib/reports/docLinks'
import { useRevenueCogsReport, type RevenueCogsRow } from '@/hooks/reports/useRevenueCogsReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useDivisions } from '@/hooks/useDivisions'
import { useWarehouses } from '@/hooks/useWarehouses'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

const columns: ReportColumn<RevenueCogsRow>[] = [
  { header: 'Date',        accessor: (r) => r.date,          format: 'text' },
  { header: 'Customer',    accessor: (r) => r.customer,      format: 'text' },
  { header: 'SO No',       accessor: (r) => r.so_no,         format: 'text',
    render: (r) => r.sale_order_id ? <DocLink href={docHrefFor('so', r.so_no)} label={r.so_no} /> : <span>{r.so_no ?? '—'}</span> },
  { header: 'Product',     accessor: (r) => r.product_name,  format: 'text' },
  { header: 'Qty',         accessor: (r) => r.qty,           format: 'number',   total: true },
  { header: 'Unit Cost',   accessor: (r) => r.unit_cost,     format: 'currency' },
  { header: 'Total Cost',  accessor: (r) => r.total_cost,    format: 'currency', total: true },
  { header: 'Sales Price', accessor: (r) => r.sales_price,   format: 'currency' },
  { header: 'Total Sales', accessor: (r) => r.total_sales,   format: 'currency', total: true },
  { header: 'Gross Profit',accessor: (r) => r.gross_profit,  format: 'currency', total: true },
  { header: 'Margin %',    accessor: (r) => r.margin_pct,    format: 'percent' },
]

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === 'neg' ? 'text-destructive' : tone === 'pos' ? 'text-success' : ''}`}>{value}</div>
    </div>
  )
}

export default function RevenueCogsReportPage() {
  const canView = useHasPermission('reports.view')
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const r = presetRange('this-month')
    return { start: r.start, end: r.end, divisionIds: [], warehouseIds: [] }
  })

  const { data: rows = [], isLoading } = useRevenueCogsReport(filters, canView)
  const { data: divisions = [] } = useDivisions()
  const { data: warehouses = [] } = useWarehouses()

  const totals = useMemo(() => {
    const revenue = rows.reduce((s, r) => s + (r.total_sales ?? 0), 0)
    const cogs    = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0)
    const gross   = revenue - cogs
    const margin  = revenue !== 0 ? (gross / revenue) * 100 : 0
    return { revenue, cogs, gross, margin }
  }, [rows])

  const subtitle = useMemo(() => {
    const dv = filters.divisionIds.length
      ? filters.divisionIds.map((id) => divisions.find((d) => d.id === id)?.short_name || divisions.find((d) => d.id === id)?.name).filter(Boolean).join(', ')
      : 'All divisions'
    const wh = filters.warehouseIds.length
      ? filters.warehouseIds.map((id) => warehouses.find((w) => w.id === id)?.name).filter(Boolean).join(', ')
      : 'All warehouses'
    return `${filters.start} → ${filters.end} · Divisions: ${dv} · Warehouses: ${wh}`
  }, [filters, divisions, warehouses])

  function handleExport() {
    exportReportToExcel<RevenueCogsRow>({
      filename: 'Revenue COGS Gross Profit',
      title: 'Revenue, COGS & Gross Profit',
      subtitle,
      columns,
      rows,
      groupBy: (r) => r.division_name ?? '—',
      grandTotalLabel: 'Grand total (all divisions)',
    })
  }

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
        title="Revenue, COGS & Gross Profit"
        description="Sales value vs cost of goods sold, per sale order and per FIFO cost layer — so a line fulfilled from two cost layers shows two margins."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Reports</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Revenue &amp; COGS</span>
          </nav>
        }
        actions={
          <Button size="sm" onClick={handleExport} disabled={rows.length === 0} className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export Excel
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Revenue" value={QAR.format(totals.revenue)} />
        <Stat label="COGS" value={QAR.format(totals.cogs)} />
        <Stat label="Gross Profit" value={QAR.format(totals.gross)} tone={totals.gross < 0 ? 'neg' : 'pos'} />
        <Stat label="Margin" value={`${totals.margin.toFixed(1)}%`} tone={totals.margin < 0 ? 'neg' : undefined} />
      </div>

      <ReportFilterBar value={filters} onChange={setFilters} showDate showWarehouse />

      <ReportGroupedTable
        columns={columns}
        rows={rows}
        groupBy={(r) => r.division_name ?? '—'}
        isLoading={isLoading}
        grandTotalLabel="Grand total (all divisions)"
        emptyText="No sales in the selected period."
      />
    </PageWrapper>
  )
}
