// src/app/(dashboard)/sales/payments/page.tsx
'use client'

import { useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { useCustomerPayments, type CustomerPayment } from '@/hooks/useCustomerPayments'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'

const METHOD_LABELS: Record<string, string> = {
  bank_transfer:   'Bank Transfer',
  cash:            'Cash',
  cheque:          'Cheque',
  online_transfer: 'Online Transfer',
  pos:             'POS',
}

export default function CustomerPaymentsPage() {
  const { data: payments, isLoading } = useCustomerPayments()

  const columns = useMemo<ColumnDef<CustomerPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('payment_id')}</span>,
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('amount'), 'QAR'),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {METHOD_LABELS[row.getValue('method') as string] ?? row.getValue('method')}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
  ], [])

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="Customer Payments" description="Incoming payments from customers" />
      <DataTable columns={columns} data={payments ?? []} isLoading={isLoading} />
    </div>
  )
}
