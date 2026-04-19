'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Printer, Send, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PoStatusBadge } from './PoStatusBadge'
import { PoApprovalChain } from './PoApprovalChain'
import { PoPaymentDialog } from './PoPaymentDialog'
import {
  usePurchaseOrder,
  usePOPayments,
  usePOReceivalsByPO,
  useSubmitPO,
  useCancelPO,
  type PurchaseOrder,
} from '@/hooks/usePurchaseOrders'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatCurrency, formatDate, formatRelative } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder | null
  onEdit?: (po: PurchaseOrder) => void
  onCreateBill?: (poId: string) => void
}

export function PoDetailDialog({ open, onOpenChange, po, onEdit, onCreateBill }: Props) {
  const [paymentOpen, setPaymentOpen] = useState(false)
  const { data: fullPO, isLoading, isError } = usePurchaseOrder(open ? (po?.id ?? null) : null)
  const { data: payments } = usePOPayments(open ? (po?.id ?? null) : null)
  const { data: receivals } = usePOReceivalsByPO(open ? (po?.id ?? null) : null)
  const { data: activityLogs } = useActivityLog(
    open && po?.id ? { module: 'purchase_orders', entity_id: po.id } : {}
  )
  const submitPO = useSubmitPO()
  const cancelPO = useCancelPO()

  const current = fullPO ?? po

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
          <DialogHeader className="shrink-0 pb-3 border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="font-mono text-lg">{current?.po_number}</DialogTitle>
                  {current && (
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      {
                        draft: 'bg-slate-100 text-slate-700',
                        pending_approval: 'bg-amber-100 text-amber-700',
                        approved: 'bg-blue-100 text-blue-700',
                        partially_received: 'bg-purple-100 text-purple-700',
                        received: 'bg-green-100 text-green-700',
                        cancelled: 'bg-red-100 text-red-700',
                      }[current.status] ?? 'bg-slate-100 text-slate-700'
                    )}>
                      {current.status.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                {current && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {current.supplier_name} · {current.currency} · {formatDate(current.created_date)}
                  </p>
                )}
              </div>
              {current && !isLoading && (
                <div className="flex flex-wrap gap-2">
                  {current.status === 'draft' && onEdit && (
                    <Button variant="outline" size="sm" onClick={() => { onEdit(current); onOpenChange(false) }}>
                      Edit PO
                    </Button>
                  )}
                  {current.status === 'draft' && (
                    <Button
                      size="sm"
                      disabled={submitPO.isPending}
                      onClick={async () => {
                        try {
                          await submitPO.mutateAsync(current.id)
                          toast.success('PO submitted for approval')
                        } catch {
                          toast.error('Failed to submit PO')
                        }
                      }}
                    >
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      Submit for Approval
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { toast.info('Print functionality coming soon') }}
                  >
                    <Printer className="h-3.5 w-3.5 mr-1.5" />
                    Print
                  </Button>
                  {!['received', 'cancelled'].includes(current.status) && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={cancelPO.isPending}
                      onClick={async () => {
                        if (!confirm('Cancel this purchase order?')) return
                        try {
                          await cancelPO.mutateAsync(current.id)
                          toast.success('PO cancelled')
                          onOpenChange(false)
                        } catch {
                          toast.error('Failed to cancel PO')
                        }
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      Cancel PO
                    </Button>
                  )}
                  {onCreateBill && (
                    <Button variant="outline" size="sm" onClick={() => { onCreateBill(current.id); onOpenChange(false) }}>
                      Create Bill
                    </Button>
                  )}
                </div>
              )}
            </div>
            {current?.po_approvals && current.po_approvals.length > 0 && (
              <PoApprovalChain steps={current.po_approvals} />
            )}
          </DialogHeader>

          {isLoading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : isError ? (
            <div className="p-4 text-sm text-destructive">Failed to load purchase order details.</div>
          ) : (
            <Tabs defaultValue="items" className="flex-1 overflow-hidden flex flex-col min-h-0">
              <TabsList className="shrink-0 mx-0 overflow-x-auto">
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
                                  <TableCell className="text-xs text-right">{formatCurrency(ri.unit_cost, current?.currency)}</TableCell>
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
                  <div className="relative pl-6 space-y-0">
                    {(activityLogs ?? []).map((log, idx) => (
                      <div key={log.id} className="relative pb-4">
                        {idx < (activityLogs ?? []).length - 1 && (
                          <span className="absolute left-[-16px] top-3 bottom-0 w-px bg-border" />
                        )}
                        <span className="absolute left-[-20px] top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                        <div className="text-sm">
                          <span className="font-medium">{log.action}</span>
                          {log.performer_name && (
                            <span className="text-muted-foreground"> · {log.performer_name}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(log.created_at)}</p>
                        {log.details && (
                          <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
