'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const SoPdfButton = dynamic(
  () => import('./SoPdfButton').then((m) => m.SoPdfButton),
  { ssr: false, loading: () => <Button variant="outline" size="sm" disabled>Loading PDF…</Button> }
)

const InvoicePdfButton = dynamic(
  () => import('./InvoicePdfButton').then((m) => m.InvoicePdfButton),
  { ssr: false, loading: () => <Button variant="outline" size="sm" disabled>Loading PDF…</Button> }
)
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SoStatusBadge } from './SoStatusBadge'
import { SoPaymentDialog } from './SoPaymentDialog'
import { SoDeliveryDialog } from './SoDeliveryDialog'
import {
  useSaleOrder,
  useSOPayments,
  useApproveSO,
  type SaleOrder,
} from '@/hooks/useSaleOrders'
import { useCancelDelivery } from '@/hooks/useSaleDeliveries'
import {
  useInvoicesBySO,
  useGenerateInvoice,
  useSendInvoice,
} from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { useReturnsBySO, useCreateSaleReturn, type SaleReturn } from '@/hooks/useSaleReturns'
import { useWarehouses } from '@/hooks/useWarehouses'
import { usePaymentPlans } from '@/hooks/usePaymentPlans'
import { CustomerPaymentDialog } from './CustomerPaymentDialog'
import { PaymentPlanDialog } from '@/components/purchase/PaymentPlanDialog'
import { PAYMENT_PLAN_THRESHOLD } from '@/types/invoice'
import { toast } from 'sonner'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface SoDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder | null
  onEdit?: (so: SaleOrder) => void
  onConfirm?: (so: SaleOrder) => void
}

export function SoDetailDialog({ open, onOpenChange, so, onEdit, onConfirm }: SoDetailDialogProps) {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [invoicePayOpen, setInvoicePayOpen] = useState(false)
  const [invoicePlanOpen, setInvoicePlanOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10))
  const [returnReason, setReturnReason] = useState('')
  const [returnWarehouseId, setReturnWarehouseId] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnItems, setReturnItems] = useState<{ item_name: string; sku: string | null; qty: number; condition: 'good' | 'damaged'; brand_variant_id: string | null }[]>([])

  const approveSO = useApproveSO()
  const cancelDelivery = useCancelDelivery()
  const createReturn = useCreateSaleReturn()
  const generateInvoice = useGenerateInvoice()
  const sendInvoice = useSendInvoice()
  const { data: fullSO, isLoading, isError } = useSaleOrder(open ? (so?.id ?? null) : null)
  const { data: soInvoice } = useInvoicesBySO(open ? (so?.id ?? null) : null)
  const { data: invoicePayments } = useCustomerPayments(soInvoice?.id)
  const { data: paymentPlans } = usePaymentPlans(soInvoice?.id ?? null)
  const { data: payments } = useSOPayments(open ? (so?.id ?? null) : null)
  const { data: activityLogs } = useActivityLog(
    open && so?.id ? { module: 'sale_orders', entity_id: so.id } : {}
  )
  const { data: soReturns = [] } = useReturnsBySO(open ? (so?.id ?? null) : null)
  const { data: warehouses = [] } = useWarehouses()

  const current = fullSO ?? so
  const router = useRouter()

  const canRecordPayment = current && ['confirmed', 'partial_delivery', 'delivered', 'invoiced'].includes(current.status)
  const canDeliver = current && ['confirmed', 'partial_delivery'].includes(current.status)
  const canConfirm = current?.status === 'quotation'
  const canEdit = current?.status === 'quotation'
  const canApprove = current?.status === 'pending_approval'

  function handleApprove() {
    if (!current) return
    approveSO.mutate(current.id, {
      onSuccess: () => toast.success('Order approved and confirmed'),
      onError: (err) => toast.error((err as Error).message),
    })
  }

  const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount_qar ?? p.amount), 0)
  const payPct = current ? Math.min(100, (totalPaid / (current.total || 1)) * 100) : 0

  // Payment status badge
  const paymentStatus: 'paid' | 'partial' | 'unpaid' =
    payments !== undefined && current
      ? totalPaid >= current.total
        ? 'paid'
        : totalPaid > 0
        ? 'partial'
        : 'unpaid'
      : 'unpaid'

  // Invoice tab computed values
  const totalInvoicePaid = (invoicePayments ?? []).reduce((s, p) => s + p.amount, 0)
  const invoiceOutstanding = (soInvoice?.total_amount ?? 0) - totalInvoicePaid
  const hasActivePlan = (paymentPlans ?? []).some((p) => p.status === 'active')
  // soInvoice is undefined while loading, null when query returned no invoice,
  // or an ArInvoice object when one exists.
  const canGenerateInvoice =
    current !== null &&
    soInvoice === null &&
    ['confirmed', 'partial_delivery', 'delivered'].includes(current?.status ?? '')

  function handleGenerateInvoice() {
    if (!current) return
    generateInvoice.mutate(current.id, {
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

  function handleCancelDelivery(deliveryId: string) {
    if (!current) return
    cancelDelivery.mutate(
      { id: deliveryId, soId: current.id },
      {
        onSuccess: () => toast.success('Delivery cancelled'),
        onError: (err) => toast.error((err as Error).message),
      }
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle>{current?.so_number}</DialogTitle>
              {current && <SoStatusBadge status={current.status} />}
              {payments !== undefined && current && (
                <Badge
                  variant="outline"
                  className={
                    paymentStatus === 'paid'
                      ? 'border-green-500 text-green-700 bg-green-50'
                      : paymentStatus === 'partial'
                      ? 'border-amber-500 text-amber-700 bg-amber-50'
                      : 'border-muted-foreground/40 text-muted-foreground'
                  }
                >
                  {paymentStatus === 'paid' ? 'Paid' : paymentStatus === 'partial' ? 'Partially Paid' : 'Unpaid'}
                </Badge>
              )}
              {current?.customer_name && (
                <span className="text-sm text-muted-foreground">{current.customer_name}</span>
              )}
            </div>
            {current && (
              <div className="text-sm text-muted-foreground">
                Total: {formatCurrency(current.total, 'QAR')} · {formatDate(current.created_at)}
              </div>
            )}
          </DialogHeader>

          {canApprove && (
            <div className="shrink-0 rounded-md bg-yellow-50 border border-yellow-200 px-4 py-2.5 text-sm text-yellow-800 flex items-center gap-2">
              <span className="font-medium">Pending Owner Approval</span>
              <span className="text-yellow-700">— this order exceeded the customer's credit limit.</span>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : isError ? (
            <div className="p-4 text-sm text-destructive">Failed to load sale order details.</div>
          ) : (
            <Tabs defaultValue="items" className="flex-1 overflow-hidden flex flex-col min-h-0">
              <TabsList className="shrink-0 mx-0 overflow-x-auto">
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="returns">Returns {soReturns.length > 0 && `(${soReturns.length})`}</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="invoice">Invoice</TabsTrigger>
              </TabsList>

              {/* ── Items ────────────────────────────────────────── */}
              <TabsContent value="items" className="flex-1 overflow-y-auto">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="hidden sm:table-cell">SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Delivered</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fullSO?.sale_order_lines ?? []).map((li) => (
                        <TableRow key={li.id}>
                          <TableCell className="font-medium">{li.item_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{li.sku ?? '—'}</TableCell>
                          <TableCell className="text-right">{li.qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(li.unit_price, 'QAR')}</TableCell>
                          <TableCell className="hidden md:table-cell text-right">{li.delivered_qty}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(li.total, 'QAR')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {current && (
                  <div className="mt-4 space-y-1 text-sm text-right pr-2">
                    <div className="text-muted-foreground">Subtotal: <span className="text-foreground font-medium">{formatCurrency(current.subtotal, 'QAR')}</span></div>
                    {(current.discount_amount_resolved > 0) && (
                      <div className="text-muted-foreground">
                        Discount{current.discount_label ? ` (${current.discount_label})` : ''}: <span className="text-destructive">-{formatCurrency(current.discount_amount_resolved, 'QAR')}</span>
                      </div>
                    )}
                    {current.tax > 0 && (
                      <div className="text-muted-foreground">Tax: <span className="text-foreground">{formatCurrency(current.tax, 'QAR')}</span></div>
                    )}
                    <div className="font-semibold">Total: {formatCurrency(current.total, 'QAR')}</div>
                  </div>
                )}
              </TabsContent>

              {/* ── Deliveries ───────────────────────────────────── */}
              <TabsContent value="deliveries" className="flex-1 overflow-y-auto space-y-3">
                {(fullSO?.sale_deliveries ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No deliveries yet</p>
                ) : (
                  (fullSO?.sale_deliveries ?? []).map((d) => (
                    <div key={d.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{d.delivery_number}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">{d.status}</Badge>
                          {(d.status === 'pending' || d.status === 'in_progress' || d.status === 'delivered') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={cancelDelivery.isPending}
                              onClick={() => handleCancelDelivery(d.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(d.date)} · {d.warehouse_name ?? 'Unknown warehouse'}
                      </div>
                      {d.items && d.items.length > 0 && (
                        <div className="rounded border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Item</TableHead>
                                <TableHead className="text-xs text-right">Qty Delivered</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {d.items.map((item, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="text-xs">{item.item_name}</TableCell>
                                  <TableCell className="text-xs text-right">{item.qty_delivered}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </TabsContent>

              {/* ── Payments ─────────────────────────────────────── */}
              <TabsContent value="payments" className="flex-1 overflow-y-auto space-y-4">
                {canRecordPayment && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => setPaymentOpen(true)}>+ Record Payment</Button>
                  </div>
                )}
                {(payments ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No payments yet</p>
                ) : (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead className="hidden sm:table-cell">Method</TableHead>
                            <TableHead className="hidden md:table-cell">Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(payments ?? []).map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-sm">{formatDate(p.date)}</TableCell>
                              <TableCell className="font-medium">{formatCurrency(p.amount_qar ?? p.amount, 'QAR')}</TableCell>
                              <TableCell className="hidden sm:table-cell capitalize">{p.method.replace(/_/g, ' ')}</TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{p.reference ?? '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {current && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Paid: {formatCurrency(totalPaid, 'QAR')}</span>
                          <span>Total: {formatCurrency(current.total, 'QAR')}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-success transition-all"
                            style={{ width: `${payPct}%` }}
                            role="progressbar"
                            aria-valuenow={Math.round(payPct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label="Payment progress"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ── Returns ──────────────────────────────────────── */}
              <TabsContent value="returns" className="flex-1 overflow-y-auto space-y-3">
                {current && ['delivered', 'invoiced', 'closed'].includes(current.status) && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => {
                      setReturnItems((fullSO?.sale_order_lines ?? []).map((li) => ({
                        item_name: li.item_name,
                        sku: li.sku ?? null,
                        qty: li.qty,
                        condition: 'good' as const,
                        brand_variant_id: li.brand_variant_id ?? null,
                      })))
                      setReturnOpen(true)
                    }}>
                      + Create Return
                    </Button>
                  </div>
                )}
                {soReturns.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No returns for this order</p>
                ) : (
                  soReturns.map((ret) => (
                    <div key={ret.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-medium">{ret.return_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                          ret.status === 'restocked' ? 'bg-green-100 text-green-700' :
                          ret.status === 'received'  ? 'bg-blue-100 text-blue-700' :
                          ret.status === 'closed'    ? 'bg-slate-100 text-slate-600' :
                                                       'bg-amber-100 text-amber-700'
                        }`}>{ret.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(ret.date)} · {ret.reason}</p>
                      <div className="rounded border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Item</TableHead>
                              <TableHead className="text-xs text-right">Qty</TableHead>
                              <TableHead className="text-xs">Condition</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ret.items.map((item, i) => (
                              <TableRow key={i}>
                                <TableCell className="text-xs">{item.item_name}</TableCell>
                                <TableCell className="text-xs text-right">{item.qty}</TableCell>
                                <TableCell className="text-xs">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    item.condition === 'good' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                  }`}>{item.condition}</span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {ret.notes && <p className="text-xs text-muted-foreground italic">{ret.notes}</p>}
                    </div>
                  ))
                )}
              </TabsContent>

              {/* ── Activity ─────────────────────────────────────── */}
              <TabsContent value="activity" className="flex-1 overflow-y-auto">
                {(activityLogs ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                ) : (
                  <div className="relative pl-6">
                    {(activityLogs ?? []).map((log, idx) => {
                      const a = log.action ?? ''
                      const dotClass =
                        a.includes('Cancelled') || a.includes('Rejected')
                          ? 'bg-destructive border-destructive'
                          : a.includes('Delivered') || a.includes('Confirmed') || a.includes('Approved')
                          ? 'bg-green-500 border-green-500'
                          : a.includes('Payment')
                          ? 'bg-purple-500 border-purple-500'
                          : a.includes('Return')
                          ? 'bg-orange-500 border-orange-500'
                          : 'bg-primary border-primary'
                      return (
                        <div key={log.id} className="relative pb-4">
                          {idx < (activityLogs ?? []).length - 1 && (
                            <span className="absolute left-[-16px] top-3 bottom-0 w-px bg-border" />
                          )}
                          <span className={cn('absolute left-[-20px] top-1.5 h-3 w-3 rounded-full border-2', dotClass)} />
                          <div className="text-sm flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{log.action}</span>
                            {log.performer_name && (
                              <span className="text-muted-foreground text-xs">· {log.performer_name}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatDate(log.created_at)}</p>
                          {log.details && (
                            <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>

              {/* ── Invoice ──────────────────────────────────────── */}
              <TabsContent value="invoice" className="flex-1 overflow-y-auto space-y-4">
                {soInvoice === null && !canGenerateInvoice && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Invoice will be available once the order is confirmed.
                  </p>
                )}

                {soInvoice === null && canGenerateInvoice && (
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
                )}

                {soInvoice !== null && soInvoice !== undefined && (
                  <>
                    {/* Header badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{soInvoice.invoice_id}</span>
                      <Badge className={
                        soInvoice.doc_status === 'sent'           ? 'bg-green-100 text-green-700' :
                        soInvoice.doc_status === 'ready_to_send'  ? 'bg-blue-100 text-blue-700' :
                                                                    'bg-slate-100 text-slate-700'
                      }>
                        {soInvoice.doc_status === 'ready_to_send' ? 'Ready to Send' :
                         soInvoice.doc_status === 'sent'          ? 'Sent' : 'Draft'}
                      </Badge>
                      <Badge className={
                        soInvoice.payment_status === 'paid'           ? 'bg-green-100 text-green-700' :
                        soInvoice.payment_status === 'partially_paid' ? 'bg-amber-100 text-amber-700' :
                        soInvoice.payment_status === 'overdue'        ? 'bg-red-100 text-red-700' :
                                                                        'bg-slate-100 text-slate-600'
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
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}

          {/* Action buttons */}
          {current && !isLoading && (
            <div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t justify-end">
              {canApprove && (
                <Button
                  size="sm"
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  disabled={approveSO.isPending}
                  onClick={handleApprove}
                >
                  {approveSO.isPending ? 'Approving…' : 'Approve Order'}
                </Button>
              )}
              {canConfirm && onConfirm && (
                <Button size="sm" onClick={() => { onConfirm(current); onOpenChange(false) }}>
                  Confirm Order
                </Button>
              )}
              {canDeliver && (
                <Button variant="outline" size="sm" onClick={() => setDeliveryOpen(true)}>
                  + Create Delivery
                </Button>
              )}
              {canEdit && onEdit && (
                <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { onEdit(current); onOpenChange(false) }}>
                  Edit SO
                </Button>
              )}
              {(current?.status === 'quotation' || current?.status === 'pending_approval') && fullSO && (
                <SoPdfButton so={fullSO} />
              )}
              {soInvoice && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onOpenChange(false); router.push(`/sales/invoices/${soInvoice.id}`) }}
                >
                  View Invoice ({soInvoice.invoice_id})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {current && (
        <>
          <SoPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} so={current} />
          <SoDeliveryDialog open={deliveryOpen} onOpenChange={setDeliveryOpen} so={current} />
        </>
      )}
      {soInvoice && invoicePayOpen && (
        <CustomerPaymentDialog
          open
          onOpenChange={setInvoicePayOpen}
          invoice={soInvoice}
          alreadyPaid={totalInvoicePaid}
          plans={paymentPlans ?? []}
        />
      )}
      {soInvoice && invoicePlanOpen && (
        <PaymentPlanDialog
          open
          onOpenChange={setInvoicePlanOpen}
          invoiceId={soInvoice.id}
          outstanding={invoiceOutstanding}
        />
      )}

      {/* Create Return Dialog */}
      {returnOpen && current && (
        <Dialog open onOpenChange={(o) => { if (!o) { setReturnOpen(false); setReturnReason(''); setReturnNotes(''); setReturnWarehouseId('') } }}>
          <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Create Return — {current.so_number}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Return Date</label>
                  <input
                    type="date"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Restock Warehouse</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={returnWarehouseId}
                    onChange={(e) => setReturnWarehouseId(e.target.value)}
                  >
                    <option value="">None / Inspect first</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reason <span className="text-destructive">*</span></label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Wrong item, damaged on arrival…"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Items</label>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Item</TableHead>
                        <TableHead className="text-xs text-right w-20">Qty</TableHead>
                        <TableHead className="text-xs w-28">Condition</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnItems.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium">{item.item_name}</TableCell>
                          <TableCell className="text-right">
                            <input
                              type="number" min={0}
                              className="w-16 h-7 text-xs text-right rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                              value={item.qty}
                              onChange={(e) => setReturnItems((prev) => prev.map((it, j) => j === i ? { ...it, qty: Number(e.target.value) } : it))}
                            />
                          </TableCell>
                          <TableCell>
                            <select
                              className="h-7 text-xs rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                              value={item.condition}
                              onChange={(e) => setReturnItems((prev) => prev.map((it, j) => j === i ? { ...it, condition: e.target.value as 'good' | 'damaged' } : it))}
                            >
                              <option value="good">Good</option>
                              <option value="damaged">Damaged</option>
                            </select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</label>
                <textarea
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="Optional notes…"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setReturnOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                disabled={!returnReason.trim() || createReturn.isPending || returnItems.every((it) => it.qty === 0)}
                onClick={() => {
                  createReturn.mutate(
                    {
                      source_id: current.id,
                      date: returnDate,
                      reason: returnReason,
                      items: returnItems.filter((it) => it.qty > 0),
                      restock_warehouse_id: returnWarehouseId || null,
                      notes: returnNotes || null,
                    },
                    {
                      onSuccess: () => { toast.success('Return created'); setReturnOpen(false); setReturnReason(''); setReturnNotes(''); setReturnWarehouseId('') },
                      onError: (err) => toast.error((err as Error).message),
                    }
                  )
                }}
              >
                {createReturn.isPending ? 'Creating…' : 'Create Return'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
