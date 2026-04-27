// src/app/(dashboard)/sales/payments/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { Eye } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { useCustomerPayments, type CustomerPayment } from '@/hooks/useCustomerPayments'
import { SoDetailDialog } from '@/components/sales/SoDetailDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SaleOrder } from '@/hooks/useSaleOrders'

const METHOD_LABELS: Record<string, string> = {
  bank_transfer:   'Bank Transfer',
  cash:            'Cash',
  cheque:          'Cheque',
  online:          'Online',
  online_transfer: 'Online Transfer',
  pay_later:       'Pay Later',
  fawran:          'Fawran',
  pos:             'POS',
}

export default function CustomerPaymentsPage() {
  const { data: payments, isLoading } = useCustomerPayments()

  const [selectedSO, setSelectedSO] = useState<SaleOrder | null>(null)
  const [detailOpen, setDetailOpen]   = useState(false)

  function openSO(payment: CustomerPayment) {
    if (!payment.source_id || payment.source_type !== 'sale_order') return
    // Minimal stub — SoDetailDialog loads full data itself via useSaleOrder
    setSelectedSO({
      id:          payment.source_id,
      so_number:   payment.so_number ?? '…',
      customer_id: '',
      status:      'confirmed' as const,
      subtotal:    payment.amount,
      tax:         0,
      total:       payment.amount,
      discount_amount:          0,
      discount_label:           null,
      discount_type:            null,
      discount_amount_resolved: 0,
      currency:             'QAR',
      exchange_rate:        1,
      expected_delivery:    null,
      payment_terms:        null,
      payment_terms_notes:  null,
      payment_milestones:   null,
      delivery_terms:       null,
      delivery_terms_notes: null,
      customer_notes:       null,
      validity_days:        0,
      notes:                null,
      created_by_name:      null,
      created_at:           payment.date,
      updated_at:           payment.date,
      deleted_at:           null,
      customer_name:        payment.customer_name ?? undefined,
    })
    setDetailOpen(true)
  }

  const columns = useMemo<ColumnDef<CustomerPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">
          {row.getValue('payment_id') ?? '—'}
        </span>
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
      cell: ({ row }) => {
        const so = row.original.so_number
        if (!so) return <span className="text-muted-foreground">—</span>
        return (
          <button
            onClick={() => openSO(row.original)}
            className="font-mono text-sm text-primary hover:underline"
          >
            {so}
          </button>
        )
      },
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatCurrency(row.getValue('amount'), 'QAR')}</span>,
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
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const p = row.original
        if (p.source_type !== 'sale_order' || !p.source_id) return null
        return (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="View Sale Order"
            onClick={() => openSO(p)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )
      },
    },
  ], [payments]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageWrapper>
      <PageHeader title="Customer Payments" description="Incoming payments from customers" />
      <DataTable columns={columns} data={payments ?? []} isLoading={isLoading} />

      <SoDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        so={selectedSO}
      />
    </PageWrapper>
  )
}
