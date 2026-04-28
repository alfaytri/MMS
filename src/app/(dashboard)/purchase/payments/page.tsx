'use client'

import { useMemo, useState, useCallback } from 'react'
import { Eye, Paperclip } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useSupplierPayments, type SupplierPayment } from '@/hooks/useSupplierPayments'
import { useCustomerPayments, type CustomerPayment } from '@/hooks/useCustomerPayments'
import { SoDetailDialog } from '@/components/sales/SoDetailDialog'
import { PoDetailDialog } from '@/components/purchase/PoDetailDialog'
import { AttachBillDialog } from '@/components/purchase/AttachBillDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import type { SaleOrder } from '@/hooks/useSaleOrders'

type PaymentType = 'purchase' | 'invoice'

const DEFAULT_CURRENCY = 'QAR'

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

export default function PaymentsPage() {
  const [paymentType, setPaymentType] = useState<PaymentType>('purchase')

  const { data: supplierPayments, isLoading: loadingSupplier } = useSupplierPayments()
  const { data: customerPayments, isLoading: loadingCustomer } = useCustomerPayments()

  const [selectedSO, setSelectedSO] = useState<SaleOrder | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [poDetailOpen, setPoDetailOpen]         = useState(false)
  const [selectedPoId, setSelectedPoId]         = useState<string | null>(null)
  const [attachBillOpen, setAttachBillOpen]     = useState(false)
  const [attachPaymentId, setAttachPaymentId]   = useState<string | null>(null)
  const [attachSupplierId, setAttachSupplierId] = useState<string | null>(null)

  const openSO = useCallback(function openSO(payment: CustomerPayment) {
    if (!payment.source_id || payment.source_type !== 'sale_order') return
    setSelectedSO({
      id:                       payment.source_id,
      so_number:                payment.so_number ?? '…',
      customer_id:              payment.source_id,
      status:                   'confirmed' as const,
      subtotal:                 payment.amount,
      tax:                      0,
      total:                    payment.amount,
      discount_amount:          0,
      discount_label:           null,
      discount_type:            null,
      discount_amount_resolved: 0,
      currency:                 DEFAULT_CURRENCY,
      exchange_rate:            1,
      expected_delivery:        null,
      payment_terms:            null,
      payment_terms_notes:      null,
      payment_milestones:       null,
      delivery_terms:           null,
      delivery_terms_notes:     null,
      customer_notes:           null,
      validity_days:            0,
      notes:                    null,
      created_by_name:          null,
      created_at:               payment.date,
      updated_at:               payment.date,
      deleted_at:               null,
      customer_name:            payment.customer_name ?? undefined,
    })
    setDetailOpen(true)
  }, [])

  const purchaseColumns = useMemo<ColumnDef<SupplierPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">
          {row.original.payment_id ?? '—'}
        </span>
      ),
    },
    {
      id: 'supplier',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => {
        const po   = row.original.po_number
        const poId = row.original.po_id
        if (!po || !poId) return <span className="text-muted-foreground">—</span>
        return (
          <button
            type="button"
            aria-label={`View PO ${po}`}
            onClick={() => { setSelectedPoId(poId); setPoDetailOpen(true) }}
            className="font-mono text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            {po}
          </button>
        )
      },
    },
    {
      id: 'bill',
      header: 'Bill #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.original.amount, DEFAULT_CURRENCY),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {METHOD_LABELS[row.original.method] ?? row.original.method}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.original.date),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="flex items-center gap-1">
            {p.po_id && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="View purchase order"
                onClick={() => { setSelectedPoId(p.po_id!); setPoDetailOpen(true) }}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            {!p.invoice_id && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Attach bill"
                onClick={() => {
                  setAttachPaymentId(p.id)
                  setAttachSupplierId(p.supplier_id ?? null)
                  setAttachBillOpen(true)
                }}
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )
      },
    },
  ], [])

  const invoiceColumns = useMemo<ColumnDef<CustomerPayment>[]>(() => [
    {
      accessorKey: 'payment_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">
          {row.original.payment_id ?? '—'}
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
            type="button"
            aria-label={`View sale order ${so}`}
            onClick={() => openSO(row.original)}
            className="font-mono text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
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
      cell: ({ row }) => (
        <span className="font-medium tabular-nums">
          {formatCurrency(row.original.amount, DEFAULT_CURRENCY)}
        </span>
      ),
    },
    {
      accessorKey: 'method',
      header: 'Method',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {METHOD_LABELS[row.original.method] ?? row.original.method}
        </Badge>
      ),
    },
    {
      accessorKey: 'date',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => formatDate(row.original.date),
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
            aria-label="View sale order"
            onClick={() => openSO(p)}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )
      },
    },
  ], [openSO])

  return (
    <PageWrapper>
      <PageHeader title="Payments" description="Purchase and invoice payment records" />
      <div className="mb-4">
        <Select value={paymentType} onValueChange={(v) => { if (v === 'purchase' || v === 'invoice') setPaymentType(v) }}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue>
            {paymentType === 'purchase' ? 'Purchase Payments' : 'Invoice Payments'}
          </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="purchase">Purchase Payments</SelectItem>
            <SelectItem value="invoice">Invoice Payments</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {paymentType === 'purchase' ? (
        <DataTable
          columns={purchaseColumns}
          data={supplierPayments ?? []}
          isLoading={loadingSupplier}
        />
      ) : (
        <DataTable
          columns={invoiceColumns}
          data={customerPayments ?? []}
          isLoading={loadingCustomer}
        />
      )}
      <SoDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        so={selectedSO}
      />
      <PoDetailDialog
        open={poDetailOpen}
        onOpenChange={setPoDetailOpen}
        poId={selectedPoId ?? undefined}
      />
      <AttachBillDialog
        open={attachBillOpen}
        onOpenChange={setAttachBillOpen}
        mode="attach-bill"
        paymentId={attachPaymentId ?? undefined}
        supplierId={attachSupplierId}
      />
    </PageWrapper>
  )
}
