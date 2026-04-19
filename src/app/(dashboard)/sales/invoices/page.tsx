'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { InvoiceDetail } from '@/components/sales/InvoiceDetail'
import { useCustomerInvoices } from '@/hooks/useCustomerInvoices'
import { type ArInvoice } from '@/types/invoice'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
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
  draft:         'bg-slate-100 text-slate-700',
  ready_to_send: 'bg-blue-100 text-blue-700',
  sent:          'bg-green-100 text-green-700',
}

const PAY_STATUS_CONFIG: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

export default function CustomerInvoicesPage() {
  const [search, setSearch] = useState('')
  const [docFilter, setDocFilter] = useState<ArInvoice['doc_status'] | ''>('')
  const [selected, setSelected] = useState<ArInvoice | null>(null)

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
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" className="min-h-11 md:min-h-9" onClick={() => setSelected(row.original)}>
          View
        </Button>
      ),
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Customer Invoices" description="AR invoices auto-generated from Sale Orders" />

      <div className="flex flex-wrap gap-2">
        {DOC_STATUSES.map((s) => (
          <button
            key={s.value}
            onClick={() => setDocFilter(s.value)}
            className={cn(
              'px-3 py-1 rounded-full text-sm border transition-colors min-h-11 md:min-h-9',
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
      <DataTable columns={columns} data={invoices ?? []} isLoading={isLoading} />

      {selected && (
        <InvoiceDetail
          open
          onOpenChange={(v) => { if (!v) setSelected(null) }}
          invoice={selected}
        />
      )}
    </div>
  )
}
