'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { SoPdfButton } from './SoPdfButton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SoStatusBadge } from './SoStatusBadge'
import { SoPaymentDialog } from './SoPaymentDialog'
import { SoDeliveryDialog } from './SoDeliveryDialog'
import { ReplacementDeliveryDialog } from '@/components/sales/ReplacementDeliveryDialog'
import { SoReturnsTab } from './SoReturnsTab'
import { SoInvoiceTab } from './SoInvoiceTab'
import { ActivityTimeline } from '@/components/shared/ActivityTimeline'
import { PaymentSummaryTab } from '@/components/shared/PaymentSummaryTab'
import { SoApprovalBanner } from '@/components/sales/SoApprovalBanner'
import {
  useSaleOrder,
  useSOPayments,
  type SaleOrder,
} from '@/hooks/useSaleOrders'
import { useCancelDelivery, useCreateReplacementDelivery } from '@/hooks/useSaleDeliveries'
import { useInvoicesBySO } from '@/hooks/useCustomerInvoices'
import { useReturnsBySO, useUnresolvedReturns } from '@/hooks/useSaleReturns'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'

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

  const cancelDelivery = useCancelDelivery()
  const { data: fullSO, isLoading, isError } = useSaleOrder(open ? (so?.id ?? null) : null)
  const { data: soInvoice } = useInvoicesBySO(open ? (so?.id ?? null) : null)
  const { data: payments } = useSOPayments(open ? (so?.id ?? null) : null)
  const { data: activityLogs } = useActivityLog(
    open && so?.id ? { module: 'sale_orders', entity_id: so.id } : {}
  )
  const { data: soReturns = [] } = useReturnsBySO(open ? (so?.id ?? null) : null)

  const [replacementOpen, setReplacementOpen] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<any>(null)
  const { data: unresolvedReturns = [] } = useUnresolvedReturns(open ? (so?.id ?? null) : null)
  const createReplacement = useCreateReplacementDelivery()

  const current = fullSO ?? so

  const canRecordPayment = current && ['confirmed', 'partial_delivery', 'delivered', 'invoiced'].includes(current.status)
  const canDeliver = current && ['confirmed', 'partial_delivery'].includes(current.status)
  const canConfirm = current?.status === 'quotation'
  const canEdit = current?.status === 'quotation'

  const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount_qar ?? p.amount), 0)
  const paymentStatus: 'paid' | 'partial' | 'unpaid' =
    payments !== undefined && current
      ? totalPaid >= current.total ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'
      : 'unpaid'

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
                      ? 'border-green-500 text-green-700 bg-success/10'
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

          {current && (
            <div className="shrink-0">
              <SoApprovalBanner soId={current.id} soStatus={current.status} />
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
              <TabsList className="shrink-0 mx-0 max-w-full overflow-x-auto whitespace-nowrap scroll-x-fade">
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
                {/* Send Replacement for unresolved returns */}
                {unresolvedReturns.length > 0 && (
                  <div className="space-y-2">
                    {unresolvedReturns.map((ret: any) => (
                      <div key={ret.id} className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                        <span className="text-sm">
                          Return <span className="font-medium">{ret.return_number}</span> needs resolution
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSelectedReturn(ret); setReplacementOpen(true) }}
                        >
                          Send Replacement
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {(fullSO?.sale_deliveries ?? []).length === 0 && unresolvedReturns.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No deliveries yet</p>
                ) : (
                  (fullSO?.sale_deliveries ?? []).map((d) => (
                    <div key={d.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{d.delivery_number}</span>
                          {(d as any).type === 'replacement' && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                              Replacement
                            </span>
                          )}
                        </div>
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
              <TabsContent value="payments" className="flex-1 overflow-y-auto">
                <PaymentSummaryTab
                  payments={payments ?? []}
                  totalAmount={current?.total ?? 0}
                  canRecord={!!canRecordPayment}
                  onRecordPayment={() => setPaymentOpen(true)}
                />
              </TabsContent>

              {/* ── Returns ──────────────────────────────────────── */}
              <TabsContent value="returns" className="flex-1 overflow-y-auto">
                {current && (
                  <SoReturnsTab
                    so={current}
                    fullSO={fullSO ?? null}
                    soReturns={soReturns}
                    invoiceId={soInvoice?.invoice_id}
                  />
                )}
              </TabsContent>

              {/* ── Activity ─────────────────────────────────────── */}
              <TabsContent value="activity" className="flex-1 overflow-y-auto">
                <ActivityTimeline logs={activityLogs ?? []} />
              </TabsContent>

              {/* ── Invoice ──────────────────────────────────────── */}
              <TabsContent value="invoice" className="flex-1 overflow-y-auto">
                {current && <SoInvoiceTab so={current} />}
              </TabsContent>
            </Tabs>
          )}

          {/* Action buttons */}
          {current && !isLoading && (
            <div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t justify-end">
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
          {selectedReturn && (
            <ReplacementDeliveryDialog
              open={replacementOpen}
              onOpenChange={setReplacementOpen}
              returnData={selectedReturn}
              soId={current.id}
              isPending={createReplacement.isPending}
              onConfirm={(warehouseId, warehouseName) => {
                createReplacement.mutate({
                  soId: current.id,
                  warehouseId,
                  warehouseName,
                  returnData: selectedReturn,
                  returnId: selectedReturn.id,
                  creditNoteId: selectedReturn.credit_notes?.id ?? selectedReturn.credit_note_id,
                }, {
                  onSuccess: () => {
                    toast.success('Replacement delivery created')
                    setReplacementOpen(false)
                    setSelectedReturn(null)
                  },
                  onError: (e) => { toast.error((e as Error).message) },
                })
              }}
            />
          )}
        </>
      )}
    </>
  )
}
