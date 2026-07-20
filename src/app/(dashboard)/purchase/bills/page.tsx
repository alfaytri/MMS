'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, ShoppingCart, TrendingDown, AlertTriangle, CheckCircle2, FileText } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { BillFormDialog } from '@/components/purchase/BillFormDialog'
import { useSupplierBills, type ApInvoice } from '@/hooks/useSupplierBills'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

export default function BillsPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [payFilter, setPayFilter] = useState<'' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue'>('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data: bills, isLoading } = useSupplierBills({})

  // Client-side filter — searches bill #, supplier and PO #
  const filtered = useMemo(() => {
    const list = bills ?? []
    const q = search.trim().toLowerCase()
    return list.filter((b) => {
      if (payFilter && b.payment_status !== payFilter) return false
      if (!q) return true
      const hay = [b.invoice_id, b.supplier_name, b.po_number].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [bills, search, payFilter])

  // Stat strip metrics
  const stats = useMemo(() => {
    const list = bills ?? []
    let totalAp   = 0
    let overdue   = 0
    let paidCount = 0
    for (const b of list) {
      totalAp += b.total_amount ?? 0
      if (b.payment_status === 'overdue') overdue++
      if (b.payment_status === 'paid')    paidCount++
    }
    return { total: list.length, totalAp, overdue, paidCount }
  }, [bills])

  const columns = useMemo<ColumnDef<ApInvoice>[]>(() => [
    {
      accessorKey: 'invoice_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Bill #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-semibold">{row.getValue('invoice_id')}</span>
      ),
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => (
        <span className="text-sm truncate max-w-[180px] block">
          {row.original.supplier_name ?? '—'}
        </span>
      ),
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => {
        const po = row.original.po_number
        return po ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <ShoppingCart className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono">{po}</span>
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
          {formatCurrency(row.getValue('total_amount') ?? 0, 'QAR')}
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
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Supplier Bills"
        description="AP invoices with 3-way match verification"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Bill
          </Button>
        }
      />

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <FileText className="h-2.5 w-2.5" /> Total bills
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">{stats.total}</p>
        </div>
        <div className="rounded-lg border bg-background px-3 py-2.5">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <TrendingDown className="h-2.5 w-2.5" /> AP total
          </div>
          <p className="text-lg font-bold tabular-nums leading-tight">
            {stats.totalAp.toLocaleString('en-QA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
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
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search bill #, supplier or PO #…" />
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

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        onRowClick={(row: ApInvoice) => router.push(`/purchase/bills/${row.id}`)}
        mobileCardRender={(bill: ApInvoice) => {
          const cfg = PAY_STATUS_CONFIG[bill.payment_status ?? ''] ?? { label: '—', className: '' }
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold">{bill.invoice_id}</span>
                <Badge className={cn('text-[10px] px-1.5 py-0', cfg.className)}>{cfg.label}</Badge>
              </div>
              <p className="text-sm truncate">{bill.supplier_name ?? '—'}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {bill.po_number ? (
                  <span className="inline-flex items-center gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    <span className="font-mono">{bill.po_number}</span>
                  </span>
                ) : <span>—</span>}
                <span className={cn('tabular-nums font-medium text-foreground', bill.payment_status === 'overdue' && 'text-destructive')}>
                  {formatCurrency(bill.total_amount ?? 0, 'QAR')}
                </span>
              </div>
            </div>
          )
        }}
      />

      <BillFormDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageWrapper>
  )
}
