'use client'

import { useState } from 'react'
import { AlertTriangle, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useSendInvoice, useDismissRefresh } from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { usePaymentPlans } from '@/hooks/usePaymentPlans'
import { CustomerPaymentDialog } from './CustomerPaymentDialog'
import { PaymentPlanDialog } from '@/components/purchase/PaymentPlanDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { PAYMENT_PLAN_THRESHOLD, type ArInvoice } from '@/types/invoice'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  invoice: ArInvoice
}

const DOC_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:          { label: 'Draft',          className: 'bg-slate-100 text-slate-700' },
  ready_to_send:  { label: 'Ready to Send',  className: 'bg-blue-100 text-blue-700' },
  sent:           { label: 'Sent',           className: 'bg-green-100 text-green-700' },
}

const PAY_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  unpaid:         { label: 'Unpaid',         className: 'bg-slate-100 text-slate-600' },
  partially_paid: { label: 'Partially Paid', className: 'bg-amber-100 text-amber-700' },
  paid:           { label: 'Paid',           className: 'bg-green-100 text-green-700' },
  overdue:        { label: 'Overdue',        className: 'bg-red-100 text-red-700' },
}

export function InvoiceDetail({ open, onOpenChange, invoice }: Props) {
  const sendInvoice = useSendInvoice()
  const dismissRefresh = useDismissRefresh()
  const { data: payments } = useCustomerPayments(invoice.id)
  const { data: plans } = usePaymentPlans(invoice.id)
  const [payOpen, setPayOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)

  const totalPaid = (payments ?? []).reduce((s, p) => s + p.amount, 0)
  const outstanding = (invoice.total_amount ?? 0) - totalPaid
  const docCfg = DOC_STATUS_CONFIG[invoice.doc_status] ?? DOC_STATUS_CONFIG.draft
  const payCfg = PAY_STATUS_CONFIG[invoice.payment_status] ?? PAY_STATUS_CONFIG.unpaid
  const hasActivePlan = (plans ?? []).some((p) => p.status === 'active')

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full h-full rounded-none md:h-auto md:max-w-2xl md:rounded-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle>{invoice.invoice_id}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {invoice.customer_name} · SO #{invoice.so_number}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <Badge className={cn('text-xs', docCfg.className)}>{docCfg.label}</Badge>
                <Badge className={cn('text-xs', payCfg.className)}>{payCfg.label}</Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {invoice.needs_refresh && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Invoice regenerated — the Sale Order was modified.</p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    Review the changes below before resending to the customer.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => {
                    dismissRefresh.mutate(invoice.id)
                    toast.success('Refresh flag cleared')
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-right py-2 px-2">Qty</th>
                    <th className="text-right py-2 px-2 hidden sm:table-cell">Unit Price</th>
                    <th className="text-right py-2 pl-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(invoice.invoice_line_items ?? []).map((li) => (
                    <tr key={li.id}>
                      <td className="py-2 pr-2">{li.description}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{li.qty ?? '—'}</td>
                      <td className="text-right py-2 px-2 hidden sm:table-cell">{formatCurrency(li.unit_price ?? 0, 'QAR')}</td>
                      <td className="text-right py-2 pl-2 font-medium">{formatCurrency(li.total ?? 0, 'QAR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span>{formatCurrency(invoice.total_amount ?? 0, 'QAR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-green-700">{formatCurrency(totalPaid, 'QAR')}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Outstanding</span>
                <span className={outstanding > 0 ? 'text-amber-700' : 'text-green-700'}>
                  {formatCurrency(outstanding, 'QAR')}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {invoice.doc_status === 'ready_to_send' && (
                <Button
                  className="min-h-11"
                  onClick={() => {
                    sendInvoice.mutate(invoice.id)
                    toast.success('Invoice marked as sent')
                  }}
                >
                  <Send className="w-4 h-4 mr-2" /> Send to Customer
                </Button>
              )}
              {outstanding > 0 && invoice.doc_status !== 'draft' && (
                <Button variant="outline" className="min-h-11" onClick={() => setPayOpen(true)}>
                  Pay Now
                </Button>
              )}
              {outstanding >= PAYMENT_PLAN_THRESHOLD && !hasActivePlan && (
                <Button variant="outline" className="min-h-11" onClick={() => setPlanOpen(true)}>
                  Set Up Payment Plan
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>Issued: <span className="text-foreground">{formatDate(invoice.issued_date)}</span></div>
              <div>Due: <span className="text-foreground">{formatDate(invoice.due_date)}</span></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {payOpen && (
        <CustomerPaymentDialog
          open
          onOpenChange={setPayOpen}
          invoice={invoice}
          alreadyPaid={totalPaid}
          plans={plans ?? []}
        />
      )}
      {planOpen && (
        <PaymentPlanDialog
          open
          onOpenChange={setPlanOpen}
          invoiceId={invoice.id}
          outstanding={outstanding}
        />
      )}
    </>
  )
}
