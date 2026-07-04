'use client'

import { useMemo, useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useSalesAgingReport, type AgingRow } from '@/hooks/useAgingReport'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

type SortKey = 'current' | '1_30' | '31_60' | '61_90' | 'over_90' | 'total'
type SortDir = 'asc' | 'desc'

const BUCKET_COLORS = {
  current:      'text-emerald-600',
  days_1_30:    'text-amber-600',
  days_31_60:   'text-orange-600',
  days_61_90:   'text-red-500',
  days_over_90: 'text-red-700 font-semibold',
}

function getBucketValue(row: AgingRow, key: SortKey): number {
  switch (key) {
    case 'current': return row.current_amt
    case '1_30':    return row.days_1_30
    case '31_60':   return row.days_31_60
    case '61_90':   return row.days_61_90
    case 'over_90': return row.days_over_90
    case 'total':   return row.total_outstanding
  }
}

export default function SalesAgingReportPage() {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { data: rows = [], isLoading } = useSalesAgingReport()

  const filtered = useMemo(() => {
    let list = rows
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((r) => r.customer_name?.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      const av = getBucketValue(a, sortKey)
      const bv = getBucketValue(b, sortKey)
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [rows, search, sortKey, sortDir])

  const totals = useMemo(() => ({
    current:      rows.reduce((s, r) => s + r.current_amt, 0),
    days_1_30:    rows.reduce((s, r) => s + r.days_1_30, 0),
    days_31_60:   rows.reduce((s, r) => s + r.days_31_60, 0),
    days_61_90:   rows.reduce((s, r) => s + r.days_61_90, 0),
    days_over_90: rows.reduce((s, r) => s + r.days_over_90, 0),
    total:        rows.reduce((s, r) => s + r.total_outstanding, 0),
  }), [rows])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortHeader = ({ label, sortId, className }: { label: string; sortId: SortKey; className?: string }) => (
    <TableHead
      className={cn('text-right cursor-pointer select-none hover:text-foreground', className)}
      onClick={() => toggleSort(sortId)}
    >
      <span className="inline-flex items-center gap-1 justify-end w-full">
        {label} <ArrowUpDown className="h-3 w-3" />
      </span>
    </TableHead>
  )

  return (
    <PageWrapper>
      <PageHeader
        title="Sales Aging Report"
        description="Outstanding invoices by customer — grouped by days overdue"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          { label: 'Current',    value: totals.current,      color: 'border-emerald-200 bg-emerald-50' },
          { label: '1–30 Days',  value: totals.days_1_30,    color: 'border-amber-200 bg-amber-50' },
          { label: '31–60 Days', value: totals.days_31_60,   color: 'border-orange-200 bg-orange-50' },
          { label: '61–90 Days', value: totals.days_61_90,   color: 'border-red-200 bg-red-50' },
          { label: '90+ Days',   value: totals.days_over_90, color: 'border-red-300 bg-red-100' },
          { label: 'Total',      value: totals.total,        color: 'border-border bg-muted/50' },
        ]).map((card) => (
          <div key={card.label} className={cn('rounded-lg border p-3', card.color)}>
            <div className="text-xs text-muted-foreground mb-1">{card.label}</div>
            <div className="text-lg font-bold tabular-nums">{formatCurrency(card.value, 'QAR')}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search customer…" />
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} customers</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed">
          <EmptyState title="No outstanding invoices" description="All customer invoices are fully paid" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-center hidden sm:table-cell">Invoices</TableHead>
                <SortHeader label="Current" sortId="current" className="hidden md:table-cell" />
                <SortHeader label="1–30" sortId="1_30" className="hidden md:table-cell" />
                <SortHeader label="31–60" sortId="31_60" className="hidden lg:table-cell" />
                <SortHeader label="61–90" sortId="61_90" className="hidden lg:table-cell" />
                <SortHeader label="90+" sortId="over_90" />
                <SortHeader label="Total" sortId="total" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.customer_id}>
                  <TableCell className="font-medium">{row.customer_name}</TableCell>
                  <TableCell className="text-center hidden sm:table-cell text-muted-foreground">
                    {row.invoice_count}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums hidden md:table-cell', BUCKET_COLORS.current)}>
                    {row.current_amt > 0 ? formatCurrency(row.current_amt, 'QAR') : '—'}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums hidden md:table-cell', BUCKET_COLORS.days_1_30)}>
                    {row.days_1_30 > 0 ? formatCurrency(row.days_1_30, 'QAR') : '—'}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums hidden lg:table-cell', BUCKET_COLORS.days_31_60)}>
                    {row.days_31_60 > 0 ? formatCurrency(row.days_31_60, 'QAR') : '—'}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums hidden lg:table-cell', BUCKET_COLORS.days_61_90)}>
                    {row.days_61_90 > 0 ? formatCurrency(row.days_61_90, 'QAR') : '—'}
                  </TableCell>
                  <TableCell className={cn('text-right tabular-nums', BUCKET_COLORS.days_over_90)}>
                    {row.days_over_90 > 0 ? formatCurrency(row.days_over_90, 'QAR') : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold">
                    {formatCurrency(row.total_outstanding, 'QAR')}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals footer */}
              <TableRow className="bg-muted/50 font-bold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-center hidden sm:table-cell">
                  {rows.reduce((s, r) => s + (r.invoice_count ?? 0), 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums hidden md:table-cell">{formatCurrency(totals.current, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums hidden md:table-cell">{formatCurrency(totals.days_1_30, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums hidden lg:table-cell">{formatCurrency(totals.days_31_60, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums hidden lg:table-cell">{formatCurrency(totals.days_61_90, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totals.days_over_90, 'QAR')}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(totals.total, 'QAR')}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </PageWrapper>
  )
}
