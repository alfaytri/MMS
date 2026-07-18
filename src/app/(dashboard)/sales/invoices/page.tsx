'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { useCustomerInvoices } from '@/hooks/useCustomerInvoices'
import { type ArInvoice } from '@/types/invoice'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

function formatEnumLabel(s: string): string {
  return s.replaceAll('_', ' ').replace(/^\w/, (c) => c.toUpperCase())
}

const DOC_STATUSES = [
  { value: '' as const, label: 'All' },
  { value: 'draft' as const, label: 'Draft' },
  { value: 'ready_to_send' as const, label: 'Ready to Send' },
  { value: 'sent' as const, label: 'Sent' },
]

const DOC_STATUS_CONFIG: Record<string, string> = {
  draft:         'bg-muted text-foreground',
  ready_to_send: 'bg-blue-100 text-blue-700',
  sent:          'bg-green-100 text-green-700',
}

const PAY_STATUS_CONFIG: Record<string, string> = {
  unpaid:         'bg-muted text-muted-foreground',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

export default function CustomerInvoicesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [docFilter, setDocFilter] = useState<ArInvoice['doc_status'] | ''>('')

  const { data: invoices, isLoading } = useCustomerInvoices({
    search,
    doc_status: docFilter,
  })

  const columns = useMemo<ColumnDef<ArInvoice>[]>(() => [
    {
      accessorKey: 'invoice_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice #" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <span className="font-mono text-sm font-medium">{row.getValue('invoice_id')}</span>
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
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      id: 'so_number',
      header: 'SO #',
      cell: ({ row }) => <span className="hidden md:table-cell">{row.original.so_number ?? '—'}</span>,
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount') ?? 0, 'QAR'),
    },
    {
      accessorKey: 'doc_status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.getValue('doc_status') as string
        return (
          <Badge className={cn('text-xs hidden sm:inline-flex', DOC_STATUS_CONFIG[s] ?? '')}>
            {formatEnumLabel(s)}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'payment_status',
      header: 'Payment',
      cell: ({ row }) => {
        const s = row.getValue('payment_status') as string
        return (
          <Badge className={cn('text-xs', PAY_STATUS_CONFIG[s] ?? '')}>
            {formatEnumLabel(s)}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'due_date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
      cell: ({ row }) => <span className="hidden lg:table-cell">{formatDate(row.getValue('due_date'))}</span>,
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader title="Customer Invoices" description="AR invoices auto-generated from Sale Orders" />

      <div className="flex flex-wrap gap-2">
        {DOC_STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setDocFilter(s.value)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors min-h-11 md:min-h-0',
              docFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-accent'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search invoice # …" />
      <DataTable
        columns={columns}
        data={invoices ?? []}
        isLoading={isLoading}
        onRowClick={(row) => router.push(`/sales/invoices/${row.id}`)}
        mobileCardRender={(inv: ArInvoice) => {
          const payS = inv.payment_status as string
          return (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm font-medium">{inv.invoice_id}</span>
                  {inv.needs_refresh && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                </div>
                <Badge className={cn('text-xs', PAY_STATUS_CONFIG[payS] ?? '')}>{formatEnumLabel(payS)}</Badge>
              </div>
              <p className="text-sm text-muted-foreground truncate">{inv.customer_name ?? '—'}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Due: {formatDate(inv.due_date)}</span>
                <span className="font-medium text-foreground">{formatCurrency(inv.total_amount ?? 0, 'QAR')}</span>
              </div>
            </div>
          )
        }}
      />
    </PageWrapper>
  )
}
