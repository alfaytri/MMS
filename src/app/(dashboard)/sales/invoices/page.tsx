'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { ShoppingCart, TrendingUp, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { useCustomerInvoices } from '@/hooks/useCustomerInvoices'
import { type ArInvoice } from '@/types/invoice'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

const PAY_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  unpaid:         { label: 'Unpaid',         className: 'bg-muted text-muted-foreground' },
  partially_paid: { label: 'Partially paid', className: 'bg-amber-100 text-amber-700' },
  paid:           { label: 'Paid',           className: 'bg-green-100 text-green-700' },
  overdue:        { label: 'Overdue',        className: 'bg-red-100 text-red-700' },
}

const PAYMENT_FILTERS: { value: '' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue'; label: string }[] = [
  { value: '',               label: 'All' },
  { value: 'unpaid',         label: 'Unpaid' },
  { value: 'partially_paid', label: 'Partially paid' },
  { value: 'paid',           label: 'Paid' },
  { value: 'overdue',        label: 'Overdue' },
]

export default function CustomerInvoicesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  // Deep link: /sales/invoices?invoice=<invoice_no> (e.g. from a report drill-down).
  useEffect(() => {
    const inv = new URLSearchParams(window.location.search).get('invoice')
    if (inv) setSearch(inv)
  }, [])
  const [payFilter, setPayFilter] = useState<'' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue'>('')

  const { data: invoices, isLoading } = useCustomerInvoices({})
  const { availableDivisions, isSuperViewer } = useActiveDivision()
  const showDivisionColumn = isSuperViewer || availableDivisions.length > 1
  const divisionLabelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of availableDivisions) m.set(d.id, d.short_name || d.name)
    return m
  }, [availableDivisions])

  const filtered = useMemo(() => {
    const list = invoices ?? []
    const q = search.trim().toLowerCase()
    return list.filter((inv) => {
      if (payFilter && inv.payment_status !== payFilter) return false
      if (!q) return true
      const hay = [inv.invoice_id, inv.customer_name, inv.so_number].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [invoices, search, payFilter])

  const stats = useMemo(() => {
    const list = invoices ?? []
    let totalAr   = 0
    let overdue   = 0
    let paidCount = 0
    for (const inv of list) {
      totalAr += inv.total_amount ?? 0
      if (inv.payment_status === 'overdue') overdue++
      if (inv.payment_status === 'paid')    paidCount++
    }
    return { total: list.length, totalAr, overdue, paidCount }
  }, [invoices])

  const columns = useMemo<ColumnDef<ArInvoice>[]>(() => [
    {
      accessorKey: 'invoice_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice #" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-semibold">{row.getValue('invoice_id')}</span>
          {row.original.needs_refresh && (
            <span title="Needs review — SO was modified">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[180px] block">
          {row.original.customer_name ?? '—'}
        </span>
      ),
    },
    ...(showDivisionColumn ? [{
      id: 'division',
      accessorFn: (row: ArInvoice) => (row.division_id ? divisionLabelById.get(row.division_id) ?? '—' : '—'),
      header: 'Division',
      cell: ({ row }) => {
        const divisionId = row.original.division_id
        const label = divisionId ? divisionLabelById.get(divisionId) : null
        return label
          ? <Badge variant="outline" className="text-[11px] font-medium">{label}</Badge>
          : <span className="text-muted-foreground">—</span>
      },
    } satisfies ColumnDef<ArInvoice>] : []),
    {
      id: 'so_number',
      header: 'SO #',
      cell: ({ row }) => {
        const so = row.original.so_number
        return so ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <ShoppingCart className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{so}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
    },
    {
      accessorKey: 'due_date',
      header: 'Due',
      cell: ({ row }) => {
        const due = row.getValue('due_date') as string | null
        if (!due) return <span className="text-xs text-muted-foreground">—</span>
        const isOverdue = row.original.payment_status === 'overdue'
        return (
          <span className={cn('text-xs tabular-nums', isOverdue && 'text-destructive font-medium')}>
            {formatDate(due)}
          </span>
        )
      },
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => (
        <div className="text-right w-full"><DataTableColumnHeader column={column} title="Amount" /></div>
      ),
      cell: ({ row }) => (
        <span className="text-xs tabular-nums block text-right font-medium">
          {formatCurrency(row.getValue('total_amount') ?? 0, row.original.currency ?? 'QAR')}
        </span>
      ),
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        const s = row.getValue('payment_status') as string
        const cfg = PAY_STATUS_CONFIG[s] ?? { label: s?.replace('_', ' ') ?? '—', className: '' }
        return <Badge className={cn('text-[10px] px-1.5 py-0', cfg.className)}>{cfg.label}</Badge>
      },
    },
  ], [showDivisionColumn, divisionLabelById])

  return (
    <PageWrapper>
      <PageHeader title="Customer Invoices" description="AR invoices auto-generated from Sale Orders" />

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <FileText className="h-2.5 w-2.5" /> Total invoices
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <TrendingUp className="h-2.5 w-2.5" /> AR total
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">
            {stats.totalAr.toLocaleString('en-QA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-2.5 w-2.5" /> Overdue
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.overdue > 0 && 'text-destructive')}>
            {stats.overdue}
          </p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <CheckCircle2 className="h-2.5 w-2.5" /> Paid
          </div>
          <p className={cn('text-lg font-bold tabular-nums leading-tight', stats.paidCount > 0 && 'text-success')}>
            {stats.paidCount}
          </p>
        </div>
      </div>

      {/* Toolbar — search + filter chips */}
      <div className="flex flex-col gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search invoice #, customer or SO #…" />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Payment</span>
            {PAYMENT_FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                onClick={() => setPayFilter(f.value)}
                className={cn(
                  'px-3 py-1 min-h-11 md:min-h-0 rounded-full text-xs font-medium border transition-colors',
                  payFilter === f.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border hover:bg-accent'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        onRowClick={(row: ArInvoice) => router.push(`/sales/invoices/${row.id}`)}
        mobileCardRender={(inv: ArInvoice) => {
          const payCfg = PAY_STATUS_CONFIG[inv.payment_status ?? ''] ?? { label: '—', className: '' }
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold">{inv.invoice_id}</span>
                  {inv.needs_refresh && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                </div>
                <Badge className={cn('text-[10px] px-1.5 py-0', payCfg.className)}>{payCfg.label}</Badge>
              </div>
              <p className="text-sm truncate">{inv.customer_name ?? '—'}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {inv.so_number ? (
                  <span className="inline-flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    <span className="font-mono">{inv.so_number}</span>
                  </span>
                ) : <span>Due: {formatDate(inv.due_date)}</span>}
                <span className={cn('tabular-nums font-medium text-foreground', inv.payment_status === 'overdue' && 'text-destructive')}>
                  {formatCurrency(inv.total_amount ?? 0, inv.currency ?? 'QAR')}
                </span>
              </div>
            </div>
          )
        }}
      />
    </PageWrapper>
  )
}
