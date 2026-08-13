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
import { docHrefFor } from '@/lib/reports/docLinks'
import { useProductCostReport, type ProductCostRow } from '@/hooks/reports/useProductCostReport'
import { useHasPermission } from '@/hooks/usePermissions'
import { useDivisions } from '@/hooks/useDivisions'
import { useWarehouses } from '@/hooks/useWarehouses'

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

const columns: ReportColumn<ProductCostRow>[] = [
  { header: 'PO / Source', accessor: (r) => r.po_no,         format: 'text',
    render: (r) => r.po_id ? <DocLink href={docHrefFor('po', r.po_no)} label={r.po_no} /> : <span>{r.po_no ?? '—'}</span> },
  { header: 'Type',        accessor: (r) => r.product_type,  format: 'text' },
  { header: 'Category',    accessor: (r) => r.category,      format: 'text', wrap: true },
  { header: 'Product',     accessor: (r) => r.product_name,  format: 'text', wrap: true },
  { header: 'Barcode',     accessor: (r) => r.barcode,       format: 'text' },
  { header: 'Warehouse',   accessor: (r) => r.warehouse_name, format: 'text', wrap: true },
  { header: 'Qty',         accessor: (r) => r.qty,           format: 'number',   total: true },
  { header: 'Unit Cost',   accessor: (r) => r.unit_cost,     format: 'currency' },
  { header: 'Total Cost',  accessor: (r) => r.total_cost,    format: 'currency', total: true },
  { header: 'Sales Price', accessor: (r) => r.sales_price,   format: 'currency' },
]

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 2xl:px-4 2xl:py-3 min-w-0">
      <div className="text-[10px] 2xl:text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base sm:text-lg 2xl:text-2xl font-semibold tabular-nums break-words">{value}</div>
    </div>
  )
}

export default function ProductCostReportPage() {
  const canView = useHasPermission('reports.inventory.view')
  const [filters, setFilters] = useState<ReportFilters>(() => {
    const r = presetRange('this-month')
    return { start: r.start, end: r.end, divisionIds: [], warehouseIds: [] }
  })

  const { data: rows = [], isLoading } = useProductCostReport(filters, canView)
  const { data: divisions = [] } = useDivisions()
  const { data: warehouses = [] } = useWarehouses()

  const totalValue = useMemo(() => rows.reduce((s, r) => s + (r.total_cost ?? 0), 0), [rows])
  const totalQty   = useMemo(() => rows.reduce((s, r) => s + (r.qty ?? 0), 0), [rows])

  const subtitle = useMemo(() => {
    const dv = filters.divisionIds.length
      ? filters.divisionIds.map((id) => divisions.find((d) => d.id === id)?.short_name || divisions.find((d) => d.id === id)?.name).filter(Boolean).join(', ')
      : 'All divisions'
    const wh = filters.warehouseIds.length
      ? filters.warehouseIds.map((id) => warehouses.find((w) => w.id === id)?.name).filter(Boolean).join(', ')
      : 'All warehouses'
    return `Divisions: ${dv} · Warehouses: ${wh} · As of ${new Date().toLocaleDateString('en-GB')}`
  }, [filters, divisions, warehouses])

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
        title="Product Cost"
        description="Current on-hand stock valued at FIFO purchase cost — one line per cost layer, so per-PO unit costs are never blended."
        breadcrumb={
          <nav aria-label="Breadcrumb" className="flex items-center gap-1">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <span>Reports</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Product Cost</span>
          </nav>
        }
        actions={
          <ReportExportMenu<ProductCostRow>
            filename="Product Cost Report"
            title="Product Cost Report (PO-wise)"
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
        <Stat label="Layers" value={rows.length} />
        <Stat label="Units on hand" value={totalQty.toLocaleString()} />
        <Stat label="On-hand value" value={QAR.format(totalValue)} />
      </div>

      <ReportFilterBar value={filters} onChange={setFilters} showDate={false} showWarehouse />

      <ReportGroupedTable
        columns={columns}
        rows={rows}
        groupBy={(r) => r.division_name ?? '—'}
        isLoading={isLoading}
        grandTotalLabel="Grand total (all divisions)"
        emptyText="No on-hand stock for the selected filters."
      />
    </PageWrapper>
  )
}
