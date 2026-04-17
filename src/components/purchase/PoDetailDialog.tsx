'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PoStatusBadge } from './PoStatusBadge'
import { PoApprovalChain } from './PoApprovalChain'
import { PoPaymentDialog } from './PoPaymentDialog'
import {
  usePurchaseOrder,
  usePOPayments,
  usePOReceivalsByPO,
  type PurchaseOrder,
} from '@/hooks/usePurchaseOrders'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatCurrency, formatDate, formatRelative } from '@/lib/utils/formatters'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface PoDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder | null
  onEdit?: (po: PurchaseOrder) => void
}

export function PoDetailDialog({ open, onOpenChange, po, onEdit }: PoDetailDialogProps) {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const { data: fullPO, isLoading } = usePurchaseOrder(open ? (po?.id ?? null) : null)
  const { data: payments } = usePOPayments(open ? (po?.id ?? null) : null)
  const { data: receivals } = usePOReceivalsByPO(open ? (po?.id ?? null) : null)
  const { data: activityLogs } = useActivityLog(
    open && po?.id ? { module: 'purchase_orders' } : {}
  )

  const current = fullPO ?? po

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle>{current?.po_number}</DialogTitle>
              {current && <PoStatusBadge status={current.status} />}
              {current?.po_approvals && current.po_approvals.length > 0 && (
                <PoApprovalChain steps={current.po_approvals} />
              )}
            </div>
            {current && (
              <div className="text-sm text-muted-foreground">
                {current.supplier_name} · {current.currency} · {formatDate(current.created_date)}
              </div>
            )}
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <Tabs defaultValue="items" className="flex-1 overflow-hidden flex flex-col min-h-0">
              <TabsList className="shrink-0 mx-0">
                <TabsTrigger value="items">Line Items</TabsTrigger>
                <TabsTrigger value="receivals">Receivals</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              {/* ── Line Items ───────────────────────────────────── */}
              <TabsContent value="items" className="flex-1 overflow-y-auto">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="hidden sm:table-cell">SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Free</TableHead>
                        <TableHead className="hidden md:table-cell text-right">Received</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(fullPO?.po_line_items ?? []).map((li) => (
                        <TableRow key={li.id}>
                          <TableCell className="font-medium">{li.item_name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{li.sku ?? '—'}</TableCell>
                          <TableCell className="text-right">{li.qty}</TableCell>
                          <TableCell className="hidden md:table-cell text-right text-muted-foreground">{li.free_qty || '—'}</TableCell>
                          <TableCell className="hidden md:table-cell text-right">{li.received_qty}</TableCell>
                          <TableCell className="text-right">{formatCurrency(li.unit_price, current?.currency)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(li.total_price, current?.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {current && (
                  <div className="mt-4 space-y-1 text-sm text-right pr-2">
                    <div className="text-muted-foreground">Subtotal: <span className="text-foreground font-medium">{formatCurrency(current.subtotal, current.currency)}</span></div>
                    {current.discount_amount > 0 && (
                      <div className="text-muted-foreground">
                        Discount{current.discount_label ? ` (${current.discount_label})` : ''}: <span className="text-destructive">-{formatCurrency(current.discount_amount, current.currency)}</span>
                      </div>
                    )}
                    <div className="font-semibold">Total (QAR): {formatCurrency(current.total_qar, 'QAR')}</div>
                  </div>
                )}
              </TabsContent>

              {/* ── Receivals ────────────────────────────────────── */}
              <TabsContent value="receivals" className="flex-1 overflow-y-auto space-y-3">
                {(receivals ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No receivals yet</p>
                ) : (
                  (receivals ?? []).map((r) => (
                    <div key={r.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.receival_number}</span>
                        <Badge variant="outline" className="text-xs">{r.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(r.date)} · {r.received_by_name ?? 'Unknown'}</div>
                      {r.receival_items && r.receival_items.length > 0 && (
                        <div className="rounded border overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Item</TableHead>
                                <TableHead className="text-xs text-right">Qty</TableHead>
                                <TableHead className="text-xs text-right">Unit Cost</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {r.receival_items.map((ri) => (
                                <TableRow key={ri.id}>
                                  <TableCell className="text-xs">{ri.item_name}{ri.is_free && <Badge variant="outline" className="ml-1 text-[10px] h-4">Free</Badge>}</TableCell>
                                  <TableCell className="text-xs text-right">{ri.qty_received}</TableCell>
                                  <TableCell className="text-xs text-right">{formatCurrency(ri.unit_cost)}</TableCell>
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
                {current && ['approved', 'partially_received', 'received'].includes(current.status) && (
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
                            <TableHead className="hidden sm:table-cell">QAR</TableHead>
                            <TableHead className="hidden sm:table-cell">Method</TableHead>
                            <TableHead className="hidden md:table-cell">Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(payments ?? []).map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-sm">{formatDate(p.date)}</TableCell>
                              <TableCell className="font-medium">{formatCurrency(p.amount, p.currency)}</TableCell>
                              <TableCell className="hidden sm:table-cell text-muted-foreground">{formatCurrency(p.amount_qar ?? p.amount)}</TableCell>
                              <TableCell className="hidden sm:table-cell capitalize">{p.method.replace(/_/g, ' ')}</TableCell>
                              <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{p.reference ?? '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {/* Payment progress bar */}
                    {current && (() => {
                      const totalPaid = (payments ?? []).reduce((s, p) => s + (p.amount_qar ?? p.amount), 0)
                      const pct = Math.min(100, (totalPaid / current.total_qar) * 100)
                      return (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Paid: {formatCurrency(totalPaid)}</span>
                            <span>Total: {formatCurrency(current.total_qar)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })()}
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
            <div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t">
              {current.status === 'draft' && onEdit && (
                <Button variant="outline" size="sm" onClick={() => { onEdit(current); onOpenChange(false) }}>
                  Edit PO
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
        <PoPaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          po={current}
        />
      )}
    </>
  )
}
