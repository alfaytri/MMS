'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CustomerPaymentDialog } from './CustomerPaymentDialog'
import { PaymentPlanDialog, AR_LABELS } from '@/components/finance/PaymentPlanDialog'
import { PAYMENT_PLAN_THRESHOLD } from '@/types/invoice'
import {
  useInvoicesBySO,
  useGenerateInvoice,
  useSendInvoice,
} from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { usePaymentPlans } from '@/hooks/usePaymentPlans'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { toast } from 'sonner'
import type { SaleOrder } from '@/hooks/useSaleOrders'

const InvoicePdfButton = dynamic(
  () => import('./InvoicePdfButton').then((m) => m.InvoicePdfButton),
  { ssr: false, loading: () => <Button variant="outline" size="sm" disabled>Loading PDF…</Button> }
)

interface SoInvoiceTabProps {
  so: SaleOrder
}

export function SoInvoiceTab({ so }: SoInvoiceTabProps) {
  const [invoicePayOpen, setInvoicePayOpen] = useState(false)
  const [invoicePlanOpen, setInvoicePlanOpen] = useState(false)
  const router = useRouter()

  const generateInvoice = useGenerateInvoice()
  const sendInvoice = useSendInvoice()
  const { data: soInvoice } = useInvoicesBySO(so.id)
  const { data: invoicePayments } = useCustomerPayments(soInvoice?.id)
  const { data: paymentPlans } = usePaymentPlans(soInvoice?.id ?? null)

  const totalInvoicePaid = (invoicePayments ?? []).reduce((s, p) => s + p.amount, 0)
  const invoiceOutstanding = (soInvoice?.total_amount ?? 0) - totalInvoicePaid
  const hasActivePlan = (paymentPlans ?? []).some((p) => p.status === 'active')
  const canGenerateInvoice =
    soInvoice === null &&
    ['confirmed', 'partial_delivery', 'delivered'].includes(so.status)

  function handleGenerateInvoice() {
    generateInvoice.mutate(so.id, {
      onSuccess: () => toast.success('Invoice generated'),
      onError: (err) => {
        const msg = (err as Error).message
        if (msg === 'invoice_exists') toast.error('An invoice already exists for this order')
        else if (msg === 'so_not_invoiceable') toast.error('Invoice can only be generated for confirmed or delivered orders')
        else toast.error(msg)
      },
    })
  }

  function handleSendInvoice() {
    if (!soInvoice) return
    sendInvoice.mutate(soInvoice.id, {
      onSuccess: () => toast.success('Invoice marked as sent'),
      onError: () => toast.error('Failed to mark invoice as sent'),
    })
  }

  if (soInvoice === null && !canGenerateInvoice) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Invoice will be available once the order is confirmed.
      </p>
    )
  }

  if (soInvoice === null && canGenerateInvoice) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-sm text-muted-foreground">No invoice generated yet.</p>
        <Button
          size="sm"
          disabled={generateInvoice.isPending}
          onClick={handleGenerateInvoice}
        >
          {generateInvoice.isPending ? 'Generating…' : 'Generate Invoice'}
        </Button>
      </div>
    )
  }

  if (!soInvoice) return null

  return (
    <div className="space-y-4">
      {/* Header badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{soInvoice.invoice_id}</span>
        <Badge className={
          soInvoice.doc_status === 'sent'           ? 'bg-green-100 text-green-700' :
          soInvoice.doc_status === 'ready_to_send'  ? 'bg-blue-100 text-blue-700' :
                                                      'bg-muted text-foreground'
        }>
          {soInvoice.doc_status === 'ready_to_send' ? 'Ready to Send' :
           soInvoice.doc_status === 'sent'          ? 'Sent' : 'Draft'}
        </Badge>
        <Badge className={
          soInvoice.payment_status === 'paid'           ? 'bg-green-100 text-green-700' :
          soInvoice.payment_status === 'partially_paid' ? 'bg-amber-100 text-amber-700' :
          soInvoice.payment_status === 'overdue'        ? 'bg-red-100 text-red-700' :
                                                          'bg-muted text-muted-foreground'
        }>
          {soInvoice.payment_status === 'partially_paid' ? 'Partially Paid' :
           soInvoice.payment_status.charAt(0).toUpperCase() + soInvoice.payment_status.slice(1)}
        </Badge>
        <Badge className={
          soInvoice.invoice_type === 'cash'
            ? 'bg-orange-100 text-orange-700'
            : 'bg-purple-100 text-purple-700'
        }>
          {soInvoice.invoice_type === 'cash' ? 'Cash Invoice' : 'Credit Invoice'}
        </Badge>
      </div>

      {/* Dates */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Issued: <span className="text-foreground">{formatDate(soInvoice.issued_date)}</span></span>
        <span>Due: <span className="text-foreground">{formatDate(soInvoice.due_date)}</span></span>
      </div>

      {/* Line items */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="hidden sm:table-cell text-right">Unit Price</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(soInvoice.invoice_line_items ?? []).map((li) => (
              <TableRow key={li.id}>
                <TableCell className="text-sm">{li.description}</TableCell>
                <TableCell className="text-right text-sm">{li.qty ?? '—'}</TableCell>
                <TableCell className="hidden sm:table-cell text-right text-sm">
                  {formatCurrency(li.unit_price ?? 0, 'QAR')}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(li.total ?? 0, 'QAR')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="rounded-md border p-3 space-y-1 text-sm">
        {(soInvoice.subtotal ?? 0) !== (soInvoice.total_amount ?? 0) && (
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatCurrency(soInvoice.subtotal ?? 0, 'QAR')}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total</span>
          <span>{formatCurrency(soInvoice.total_amount ?? 0, 'QAR')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paid</span>
          <span className="text-green-700">{formatCurrency(totalInvoicePaid, 'QAR')}</span>
        </div>
        <div className="flex justify-between font-semibold border-t pt-1">
          <span>Outstanding</span>
          <span className={invoiceOutstanding > 0 ? 'text-amber-700' : 'text-green-700'}>
            {formatCurrency(invoiceOutstanding, 'QAR')}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <InvoicePdfButton
          invoice={soInvoice}
          amountPaid={totalInvoicePaid}
          outstanding={invoiceOutstanding}
        />
        {soInvoice.doc_status === 'ready_to_send' && (
          <Button
            size="sm"
            disabled={sendInvoice.isPending}
            onClick={handleSendInvoice}
          >
            {sendInvoice.isPending ? 'Sending…' : 'Send to Customer'}
          </Button>
        )}
        {invoiceOutstanding > 0 && soInvoice.doc_status !== 'draft' && (
          <Button variant="outline" size="sm" onClick={() => setInvoicePayOpen(true)}>
            Record Payment
          </Button>
        )}
        {soInvoice.invoice_type === 'credit' &&
          invoiceOutstanding >= PAYMENT_PLAN_THRESHOLD &&
          !hasActivePlan && (
          <Button variant="outline" size="sm" onClick={() => setInvoicePlanOpen(true)}>
            Set Up Payment Plan
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/sales/invoices/${soInvoice.id}`)}
        >
          View Invoice ({soInvoice.invoice_id})
        </Button>
      </div>

      {invoicePayOpen && (
        <CustomerPaymentDialog
          open
          onOpenChange={setInvoicePayOpen}
          invoice={soInvoice}
          alreadyPaid={totalInvoicePaid}
          plans={paymentPlans ?? []}
        />
      )}
      {invoicePlanOpen && (
        <PaymentPlanDialog
          open
          onOpenChange={setInvoicePlanOpen}
          invoiceId={soInvoice.id}
          outstanding={invoiceOutstanding}
          labels={AR_LABELS}
        />
      )}
    </div>
  )
}
