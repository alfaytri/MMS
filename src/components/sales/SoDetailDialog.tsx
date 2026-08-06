'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { DocumentExchangeTab } from '@/components/shared/DocumentExchangeTab'
import { PaymentSummaryTab } from '@/components/shared/PaymentSummaryTab'
import { PaymentPlanSection } from '@/components/finance/PaymentPlanSection'
import { SoApprovalBanner } from '@/components/sales/SoApprovalBanner'
import {
  useSaleOrder,
  useSOPayments,
  useCancelSO,
  type SaleOrder,
  type SaleDelivery,
} from '@/hooks/useSaleOrders'
import { useCancelDelivery, useCompleteDelivery, useUpdateDelivery, useCreateReplacementDelivery, useRecordInventoryDisposition } from '@/hooks/useSaleDeliveries'
import { useWarehouseStockByItems } from '@/hooks/useWarehouseOperations'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { useInvoicesBySO } from '@/hooks/useCustomerInvoices'
import { useCustomerPayments } from '@/hooks/useCustomerPayments'
import { usePaymentPlans } from '@/hooks/usePaymentPlans'
import { PaymentPlanDialog, AR_LABELS } from '@/components/finance/PaymentPlanDialog'
import { PAYMENT_PLAN_THRESHOLD } from '@/types/invoice'
import { useReturnsBySO, useUnresolvedReturns, type SaleReturn } from '@/hooks/useSaleReturns'
import { useActivityLog } from '@/hooks/useActivityLog'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useWarehouses } from '@/hooks/useWarehouses'
import { DeliveryFormDialog } from '@/components/sales/DeliveryFormDialog'
import type { SaleDelivery as HookSaleDelivery } from '@/hooks/useSaleDeliveries'

const inventoryTypeBadge: Record<string, { label: string; className: string }> = {
  'products':    { label: 'Product',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  'spare-parts': { label: 'Spare Part', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  'consumables': { label: 'Consumable', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  'tools':       { label: 'Tool',       className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
}

interface SoDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  so: SaleOrder | null
  onEdit?: (so: SaleOrder) => void
  onConfirm?: (so: SaleOrder) => void
}

export function SoDetailDialog({ open, onOpenChange, so, onEdit, onConfirm }: SoDetailDialogProps) {
  const [activeTab, setActiveTab] = useState('items')
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)

  const soId = so?.id
  useEffect(() => { if (open) setActiveTab('items') }, [soId, open])

  const [confirmDeliveryId, setConfirmDeliveryId] = useState<string | null>(null)
  const [editDeliveryId, setEditDeliveryId] = useState<string | null>(null)
  const [formDeliveryId, setFormDeliveryId] = useState<string | null>(null)

  const cancelSO = useCancelSO()
  const [cancelSOOpen, setCancelSOOpen] = useState(false)
  const cancelDelivery = useCancelDelivery()
  const completeDelivery = useCompleteDelivery()
  const updateDelivery = useUpdateDelivery()
  const { data: fullSO, isLoading, isError } = useSaleOrder(open ? (so?.id ?? null) : null)
  const { data: soInvoice } = useInvoicesBySO(open ? (so?.id ?? null) : null)
  const { data: payments } = useSOPayments(open ? (so?.id ?? null) : null)
  const { data: invoicePayments } = useCustomerPayments(soInvoice?.id)
  const { data: paymentPlans } = usePaymentPlans(soInvoice?.id ?? null)
  const [paymentPlanOpen, setPaymentPlanOpen] = useState(false)
  const { data: activityLogs } = useActivityLog(
    open && so?.id ? { module: 'sale_orders', entity_id: so.id } : {}
  )
  const { data: soReturns = [] } = useReturnsBySO(open ? (so?.id ?? null) : null)
  const { data: warehouses = [] } = useWarehouses()

  const [replacementOpen, setReplacementOpen] = useState(false)
  const [selectedReturn, setSelectedReturn] = useState<SaleReturn | null>(null)
  const { data: unresolvedReturns = [] } = useUnresolvedReturns(open ? (so?.id ?? null) : null)
  const createReplacement = useCreateReplacementDelivery()
  const recordDisposition = useRecordInventoryDisposition()

  const current = fullSO ?? so

  const bvInfoMap = useMemo(() => {
    const map = new Map<string, { chain: string[]; type: string | null; brand: string | null }>()
    for (const li of fullSO?.sale_order_lines ?? []) {
      if (!li.brand_variant_id) continue
      const bv = li.inventory_item_brand_variants
      const cat = bv?.inventory_items?.inventory_categories
      map.set(li.brand_variant_id, {
        chain: cat?.ancestor_chain ?? [],
        type: cat?.type ?? null,
        brand: bv?.brand ?? null,
      })
    }
    return map
  }, [fullSO?.sale_order_lines])

  const canRecordPayment = current && ['confirmed', 'partial_delivery', 'delivered', 'invoiced'].includes(current.status)
  const canDeliver = current && ['confirmed', 'partial_delivery'].includes(current.status)
  const canConfirm = current?.status === 'quotation'
  const canEdit = current?.status === 'quotation'
  const canCancel = current && ['quotation', 'confirmed'].includes(current.status)

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
                Total: {formatCurrency(current.total, current.currency ?? 'QAR')} · {formatDate(current.created_at)}
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
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col min-h-0">
              <TabsList className="shrink-0 mx-0 max-w-full overflow-x-auto whitespace-nowrap">
                <TabsTrigger value="items">Items</TabsTrigger>
                <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="returns">Returns {soReturns.length > 0 && `(${soReturns.length})`}</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="invoice">Invoice</TabsTrigger>
                {current && current.currency && current.currency !== 'QAR' && (
                  <TabsTrigger value="exchange">Exchange</TabsTrigger>
                )}
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
                      {(() => {
                        // Map summary rows by line id so the Delivered column can
                        // read the net_delivered (shipped − returned_good + replacement)
                        // rather than the raw shipment counter delivered_qty.
                        const summaryById = new Map(
                          (fullSO?.sale_order_lines_summary ?? []).map((s) => [s.sale_order_line_id, s])
                        )
                        return (fullSO?.sale_order_lines ?? []).map((li) => {
                        const bv = li.inventory_item_brand_variants
                        const cat = bv?.inventory_items?.inventory_categories
                        const chain = cat?.ancestor_chain ?? []
                        const itemType = cat?.type ?? null
                        const typeBadge = itemType ? inventoryTypeBadge[itemType] : null
                        const brandName = bv?.brand ?? null
                        const summary = summaryById.get(li.id)
                        const netDelivered = summary?.net_delivered_qty ?? li.delivered_qty
                        return (
                        <TableRow key={li.id}>
                          <TableCell className="py-2.5">
                            <div className="space-y-0.5">
                              {chain.length > 0 && (
                                <div className="flex items-center gap-1 text-[11px] text-muted-foreground leading-tight flex-wrap">
                                  {chain.map((name, i) => (
                                    <span key={i} className="flex items-center gap-1">
                                      {i > 0 && <span className="text-muted-foreground/40">›</span>}
                                      <span>{name}</span>
                                    </span>
                                  ))}
                                  {typeBadge && (
                                    <Badge variant="secondary" className={cn('h-4 text-[10px] px-1.5 border-0 ml-1', typeBadge.className)}>
                                      {typeBadge.label}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{li.item_name}</span>
                                {brandName && (
                                  <span className="text-xs text-muted-foreground">— {brandName}</span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{li.sku ?? '—'}</TableCell>
                          <TableCell className="text-right">{li.qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(li.unit_price, current?.currency ?? 'QAR')}</TableCell>
                          <TableCell className="hidden md:table-cell text-right">
                            <span title={summary ? `${summary.shipped_qty} shipped · ${summary.returned_good_qty} returned · ${summary.replacement_qty} replaced` : undefined}>
                              {netDelivered}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(li.total, current?.currency ?? 'QAR')}</TableCell>
                        </TableRow>
                        )
                        })
                      })()}
                    </TableBody>
                  </Table>
                </div>
                {current && (
                  <div className="mt-4 space-y-1 text-sm text-right pr-2">
                    <div className="text-muted-foreground">Subtotal: <span className="text-foreground font-medium">{formatCurrency(current.subtotal, current.currency ?? 'QAR')}</span></div>
                    {(current.discount_amount_resolved > 0) && (
                      <div className="text-muted-foreground">
                        Discount{current.discount_label ? ` (${current.discount_label})` : ''}: <span className="text-destructive">-{formatCurrency(current.discount_amount_resolved, current.currency ?? 'QAR')}</span>
                      </div>
                    )}
                    {current.tax > 0 && (
                      <div className="text-muted-foreground">Tax: <span className="text-foreground">{formatCurrency(current.tax, current.currency ?? 'QAR')}</span></div>
                    )}
                    <div className="font-semibold">Total: {formatCurrency(current.total, current.currency ?? 'QAR')}</div>
                  </div>
                )}
              </TabsContent>

              {/* ── Deliveries ───────────────────────────────────── */}
              <TabsContent value="deliveries" className="flex-1 overflow-y-auto space-y-3">
                {/* Send Replacement for unresolved returns */}
                {unresolvedReturns.length > 0 && (
                  <div className="space-y-2">
                    {unresolvedReturns.map((ret) => (
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
                          {d.type === 'replacement' && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                              Replacement
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {(d.status === 'pending' || d.status === 'in_progress') ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setEditDeliveryId(d.id)}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                disabled={completeDelivery.isPending}
                                onClick={() => {
                                  // When the SO has no division set (legacy or replacement flows),
                                  // the operator must pick a sub-container explicitly — route to
                                  // the full DeliveryFormDialog which shows the picker.
                                  if (!current?.division_id) {
                                    setFormDeliveryId(d.id)
                                  } else {
                                    setConfirmDeliveryId(d.id)
                                  }
                                }}
                              >
                                Delivered
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={cancelDelivery.isPending}
                                onClick={() => handleCancelDelivery(d.id)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Badge variant="outline" className={cn('text-xs capitalize', d.status === 'delivered' ? 'border-green-200 bg-green-50 text-green-700' : d.status === 'cancelled' ? 'border-red-200 bg-red-50 text-red-700' : '')}>{d.status}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(d.date)} · {d.warehouse_name ?? 'Unknown warehouse'}
                      </div>
                      {d.sale_delivery_lines && d.sale_delivery_lines.length > 0 && (
                        <div className="rounded border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Item</TableHead>
                                <TableHead className="text-xs text-right">Qty Delivered</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {d.sale_delivery_lines.map((item, idx) => {
                                const info = item.brand_variant_id ? bvInfoMap.get(item.brand_variant_id) : null
                                const typeBadge = info?.type ? inventoryTypeBadge[info.type] : null
                                return (
                                  <TableRow key={idx}>
                                    <TableCell className="text-xs py-2">
                                      <div className="space-y-0.5">
                                        {info && info.chain.length > 0 && (
                                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground leading-tight flex-wrap">
                                            {info.chain.map((name, i) => (
                                              <span key={i} className="flex items-center gap-1">
                                                {i > 0 && <span className="text-muted-foreground/40">›</span>}
                                                <span>{name}</span>
                                              </span>
                                            ))}
                                            {typeBadge && (
                                              <Badge variant="secondary" className={cn('h-4 text-[9px] px-1 border-0 ml-0.5', typeBadge.className)}>
                                                {typeBadge.label}
                                              </Badge>
                                            )}
                                          </div>
                                        )}
                                        <div className="flex items-center gap-1">
                                          <span className="font-medium">{item.item_name}</span>
                                          {info?.brand && <span className="text-muted-foreground">— {info.brand}</span>}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-right">{item.qty_delivered}</TableCell>
                                  </TableRow>
                                )
                              })}
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
                {(() => {
                  const totalInvoicePaid = (invoicePayments ?? []).reduce((s, p) => s + p.amount, 0)
                  const invoiceOutstanding = (soInvoice?.total_amount ?? 0) - totalInvoicePaid
                  const hasActivePlan = (paymentPlans ?? []).some((p) => p.status === 'active')
                  const canOfferPaymentPlan =
                    soInvoice &&
                    soInvoice.invoice_type === 'credit' &&
                    invoiceOutstanding >= PAYMENT_PLAN_THRESHOLD &&
                    !hasActivePlan &&
                    !(current?.payment_milestones && current.payment_milestones.length > 0)
                  return (
                    <>
                      {canOfferPaymentPlan && (
                        <div className="flex justify-end mb-3">
                          <Button variant="outline" size="sm" onClick={() => setPaymentPlanOpen(true)}>
                            Set Up Payment Plan
                          </Button>
                        </div>
                      )}
                      {(paymentPlans ?? []).length > 0 && (
                        <div className="mb-4">
                          <PaymentPlanSection
                            plans={paymentPlans ?? []}
                            currency={current?.currency ?? 'QAR'}
                            canSettle={!!canRecordPayment}
                          />
                        </div>
                      )}
                      <PaymentSummaryTab
                        payments={payments ?? []}
                        totalAmount={current?.total ?? 0}
                        currency={current?.currency}
                        canRecord={!!canRecordPayment}
                        onRecordPayment={() => setPaymentOpen(true)}
                      />
                    </>
                  )
                })()}
              </TabsContent>

              {/* ── Returns ──────────────────────────────────────── */}
              <TabsContent value="returns" className="flex-1 overflow-y-auto">
                {current && (
                  <SoReturnsTab
                    so={current}
                    fullSO={fullSO ?? null}
                    soReturns={soReturns}
                    invoiceId={soInvoice?.invoice_id}
                    onSendReplacement={(ret) => { setSelectedReturn(ret); setReplacementOpen(true) }}
                  />
                )}
              </TabsContent>

              {/* ── Activity ─────────────────────────────────────── */}
              <TabsContent value="activity" className="flex-1 overflow-y-auto">
                <ActivityTimeline logs={activityLogs ?? []} />
              </TabsContent>

              {/* ── Invoice ──────────────────────────────────────── */}
              <TabsContent value="invoice" className="flex-1 overflow-y-auto">
                {current && <SoInvoiceTab so={current} onClose={() => onOpenChange(false)} />}
              </TabsContent>

              {/* ── Exchange (foreign-currency only) ─────────────── */}
              {current && current.currency && current.currency !== 'QAR' && (
                <TabsContent value="exchange" className="flex-1 overflow-y-auto">
                  <DocumentExchangeTab documentType="so" documentId={current.id} />
                </TabsContent>
              )}
            </Tabs>
          )}

          {/* Action buttons */}
          {current && !isLoading && (
            <div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t justify-end">
              {canCancel && activeTab === 'items' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  disabled={cancelSO.isPending}
                  onClick={() => setCancelSOOpen(true)}
                >
                  {cancelSO.isPending ? 'Cancelling…' : 'Cancel SO'}
                </Button>
              )}
              {canConfirm && onConfirm && (
                <Button size="sm" onClick={() => { onConfirm(current); onOpenChange(false) }}>
                  Confirm Order
                </Button>
              )}
              {canDeliver && activeTab === 'deliveries' && (
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

      {paymentPlanOpen && soInvoice && (
        <PaymentPlanDialog
          open
          onOpenChange={setPaymentPlanOpen}
          invoiceId={soInvoice.id}
          outstanding={(soInvoice.total_amount ?? 0) - (invoicePayments ?? []).reduce((s, p) => s + p.amount, 0)}
          currency={soInvoice.currency ?? current?.currency ?? 'QAR'}
          labels={AR_LABELS}
        />
      )}

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
              currency={current.currency ?? 'QAR'}
              isPending={createReplacement.isPending || recordDisposition.isPending}
              onConfirm={async ({ warehouseId, lines, dispositions, giftItems }) => {
                try {
                  // Phase 7: when both replacement lines AND dispositions are
                  // present, rpc_create_partial_replacement handles both in
                  // one atomic call. When only dispositions, use the dedicated
                  // rpc_record_inventory_disposition path.
                  if (lines.length > 0) {
                    await createReplacement.mutateAsync({
                      soId:       current.id,
                      returnId:   selectedReturn.id,
                      warehouseId,
                      lines,
                      dispositions,
                      giftItems: giftItems.map((g) => ({
                        item_name:        g.item_name,
                        sku:              g.sku,
                        qty:              g.qty,
                        brand_variant_id: g.brand_variant_id,
                      })),
                    })
                  } else if (dispositions.length > 0) {
                    await recordDisposition.mutateAsync({
                      returnId:     selectedReturn.id,
                      warehouseId,
                      dispositions,
                    })
                  }
                  const dispQty = dispositions.reduce((s, d) => s + d.qty, 0)
                  if (lines.length > 0 && dispQty > 0) {
                    toast.success('Replacement delivery created; damaged units dispositioned')
                  } else if (lines.length > 0) {
                    toast.success('Replacement delivery created')
                  } else if (dispQty > 0) {
                    toast.success(`Damaged units dispositioned (${dispQty})`)
                  }
                  setReplacementOpen(false)
                  setSelectedReturn(null)
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            />
          )}
        </>
      )}

      {/* Confirm Delivery dialog */}
      <AlertDialog open={!!confirmDeliveryId} onOpenChange={(o) => { if (!o) setConfirmDeliveryId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delivery</AlertDialogTitle>
            <AlertDialogDescription>
              This delivery will be marked as <span className="font-semibold text-foreground">Delivered</span>.
              Once confirmed, the items will be deducted from warehouse stock and <span className="font-semibold text-foreground">no further editing will be possible</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={completeDelivery.isPending}
              onClick={() => {
                if (!confirmDeliveryId || !current) return
                const del = (fullSO?.sale_deliveries ?? []).find((d) => d.id === confirmDeliveryId)
                if (!del) return
                const soLines = fullSO?.sale_order_lines ?? []
                const remaining = soLines
                  .map((li) => {
                    const delItem = (del.sale_delivery_lines ?? []).find((di) => di.brand_variant_id === li.brand_variant_id)
                    const thisQty = delItem?.qty_delivered ?? 0
                    const leftover = Math.max(0, li.qty - li.delivered_qty - thisQty)
                    return leftover > 0 ? { item_name: li.item_name, sku: li.sku ?? null, qty_delivered: leftover, brand_variant_id: li.brand_variant_id ?? null } : null
                  })
                  .filter(Boolean) as { item_name: string; sku: string | null; qty_delivered: number; brand_variant_id: string | null }[]

                completeDelivery.mutate(
                  {
                    deliveryId: confirmDeliveryId,
                    soId: current.id,
                    remainingItems: remaining,
                  },
                  {
                    onSuccess: () => { toast.success('Delivery marked as delivered'); setConfirmDeliveryId(null) },
                    onError: (err) => toast.error((err as Error).message),
                  }
                )
              }}
            >
              {completeDelivery.isPending ? 'Processing…' : 'Yes, Mark Delivered'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel SO confirmation */}
      <AlertDialog open={cancelSOOpen} onOpenChange={setCancelSOOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Sale Order</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel <span className="font-semibold text-foreground">{current?.so_number}</span> and release any reserved stock.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelSO.isPending}
              onClick={() => {
                if (!current) return
                cancelSO.mutate(current.id, {
                  onSuccess: () => {
                    toast.success('Sale order cancelled')
                    setCancelSOOpen(false)
                    onOpenChange(false)
                  },
                  onError: (err) => toast.error((err as Error).message),
                })
              }}
            >
              {cancelSO.isPending ? 'Cancelling…' : 'Yes, Cancel Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delivery form (used when SO has no division and the operator must pick a sub-container) */}
      {formDeliveryId && (() => {
        const del = (fullSO?.sale_deliveries ?? []).find((d) => d.id === formDeliveryId)
        if (!del) return null
        return (
          <DeliveryFormDialog
            key={formDeliveryId}
            open={!!formDeliveryId}
            onOpenChange={(o) => { if (!o) setFormDeliveryId(null) }}
            delivery={del as unknown as HookSaleDelivery}
          />
        )
      })()}

      {/* Edit Delivery dialog */}
      {editDeliveryId && (() => {
        const del = (fullSO?.sale_deliveries ?? []).find((d) => d.id === editDeliveryId)
        if (!del) return null
        return (
          <EditDeliveryDialog
            key={editDeliveryId}
            delivery={del}
            warehouses={warehouses}
            onClose={() => setEditDeliveryId(null)}
            onSave={(updates) => {
              updateDelivery.mutate(
                { id: editDeliveryId, ...updates },
                {
                  onSuccess: () => { toast.success('Delivery updated'); setEditDeliveryId(null) },
                  onError: (err) => toast.error((err as Error).message),
                }
              )
            }}
            isPending={updateDelivery.isPending}
          />
        )
      })()}
    </>
  )
}

/* ── Edit Delivery (inline dialog) ────────────────────────── */

function EditDeliveryDialog({
  delivery,
  warehouses,
  onClose,
  onSave,
  isPending,
}: {
  delivery: SaleDelivery
  warehouses: { id: string; name: string }[]
  onClose: () => void
  onSave: (updates: { warehouse_id: string; warehouse_name: string; date: string; items: { item_name: string; sku: string | null; qty_delivered: number; brand_variant_id: string | null }[] }) => void
  isPending: boolean
}) {
  const [warehouseId, setWarehouseId] = useState(delivery.warehouse_id ?? '')
  const [date, setDate] = useState(delivery.date ?? new Date().toISOString().split('T')[0])
  const [items, setItems] = useState((delivery.sale_delivery_lines ?? []).map((i) => ({ ...i })))

  // Per-warehouse stock hints so the operator knows availability while
  // editing qtys. Same pattern as SoDeliveryDialog.
  const bvIds = useMemo(
    () => items.map((i) => i.brand_variant_id).filter(Boolean) as string[],
    [items],
  )

  // Scope the qty chip to the picked warehouse's sub-container when it can be
  // resolved unambiguously — a single active sub means the delivery will land
  // there. When the warehouse has multiple subs and we don't have SO division
  // context here, pass null and fall back to the warehouse-aggregated total.
  const { data: activeSubs = [] } = useWarehouseSubContainers(warehouseId || null)
  const resolvedSubContainerId = useMemo(() => {
    if (!warehouseId) return null
    const eligible = activeSubs.filter((sc) => sc.is_active)
    return eligible.length === 1 ? eligible[0].id : null
  }, [warehouseId, activeSubs])

  const { data: whStockMap } = useWarehouseStockByItems(bvIds, resolvedSubContainerId)

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Delivery — {delivery.delivery_number}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Warehouse *</Label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Items</Label>
            {items.map((item, idx) => {
              const whEntries = item.brand_variant_id ? (whStockMap.get(item.brand_variant_id) ?? []) : []
              const selectedWhStock = whEntries.find((w) => w.warehouse_id === warehouseId)?.qty ?? 0
              const overSelected = warehouseId && item.qty_delivered > selectedWhStock
              return (
                <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{item.item_name}</div>
                    {item.sku && <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>}
                    {item.brand_variant_id && (
                      whEntries.length > 0 ? (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {whEntries.map((w) => {
                            const whName = warehouses.find((wh) => wh.id === w.warehouse_id)?.name ?? '?'
                            const isSelected = w.warehouse_id === warehouseId
                            return (
                              <span
                                key={w.warehouse_id}
                                className={`text-[10px] ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                              >
                                {whName}: <span className={`font-medium ${isSelected ? 'text-primary' : 'text-foreground'}`}>{w.qty}</span>
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-600 mt-0.5">No stock in any warehouse</div>
                      )
                    )}
                    {overSelected && (
                      <div className="text-[10px] text-destructive mt-0.5">
                        Requested {item.qty_delivered} but only {selectedWhStock} in the selected warehouse
                      </div>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={item.qty_delivered}
                    onChange={(e) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, qty_delivered: Math.max(0, Number(e.target.value)) } : it))}
                    className="w-20 text-right"
                  />
                </div>
              )
            })}
          </div>
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            disabled={!warehouseId || isPending || items.every((i) => i.qty_delivered === 0)}
            onClick={() => {
              const wh = warehouses.find((w) => w.id === warehouseId)
              onSave({
                warehouse_id: warehouseId,
                warehouse_name: wh?.name ?? '',
                date,
                items: items.filter((i) => i.qty_delivered > 0),
              })
            }}
          >
            {isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
