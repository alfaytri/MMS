'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then((m) => m.PDFDownloadLink),
  { ssr: false, loading: () => <Button variant="outline" size="sm" disabled>Loading PDF…</Button> }
)

const QuotationDocument = dynamic(
  () => import('./SoQuotationPdf').then((m) => m.QuotationDocument),
  { ssr: false }
) as any
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
  type SaleOrder,
} from '@/hooks/useSaleOrders'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatCurrency, formatDate, formatRelative } from '@/lib/utils/formatters'
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

  const { data: fullSO, isLoading, isError } = useSaleOrder(open ? (so?.id ?? null) : null)
  const { data: payments } = useSOPayments(open ? (so?.id ?? null) : null)
  const { data: activityLogs } = useActivityLog(
    open && so?.id ? { module: 'sale_orders', entity_id: so.id } : {}
  )

  const current = fullSO ?? so

  const canRecordPayment = current && ['confirmed', 'partial_delivery', 'delivered', 'invoiced'].includes(current.status)
  const canDeliver = current && ['confirmed', 'partial_delivery'].includes(current.status)
  const canConfirm = current?.status === 'quotation'
  const canEdit = current?.status === 'quotation'

  const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount_qar ?? p.amount), 0)
  const payPct = current ? Math.min(100, (totalPaid / (current.total || 1)) * 100) : 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle>{current?.so_number}</DialogTitle>
              {current && <SoStatusBadge status={current.status} />}
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
                <TabsTrigger value="activity">Activity</TabsTrigger>
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
                        <Badge variant="outline" className="text-xs">{d.status}</Badge>
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

              {/* ── Activity ─────────────────────────────────────── */}
              <TabsContent value="activity" className="flex-1 overflow-y-auto">
                {(activityLogs ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
                ) : (
                  <div className="space-y-2">
                    {(activityLogs ?? []).map((log) => (
                      <div key={log.id} className="flex gap-3 text-sm">
                        <span className="text-muted-foreground shrink-0 text-xs pt-0.5">{formatRelative(log.created_at)}</span>
                        <div>
                          <span className="font-medium">{log.action}</span>
                          {log.performer_name && <span className="text-muted-foreground"> · {log.performer_name}</span>}
                          {log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                <PDFDownloadLink
                  document={
                    <QuotationDocument
                      so={fullSO}
                      lines={fullSO.sale_order_lines ?? []}
                      customerName={current.customer_name ?? ''}
                      customerPhone={current.customer_phone ?? null}
                    />
                  }
                  fileName={`Quotation-${current.so_number}.pdf`}
                >
                  {({ loading }: { loading: boolean }) => (
                    <Button variant="outline" size="sm" disabled={loading}>
                      {loading ? 'Preparing…' : 'Download PDF'}
                    </Button>
                  )}
                </PDFDownloadLink>
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
    </>
  )
}
