'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Printer, Send, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PoApprovalChain } from './PoApprovalChain'
import { CreateBillFromPODialog } from './CreateBillFromPODialog'
import { PoPaymentDialog } from './PoPaymentDialog'
import { PoReceiveTab } from './PoReceiveTab'
import { PoVersionTabs } from './PoVersionTabs'
import {
  usePurchaseOrder,
  usePOPayments,
  usePOReceivalsByPO,
  usePoVersions,
  useSubmitPOForApproval,
  useCancelPO,
  type PurchaseOrder,
} from '@/hooks/usePurchaseOrders'
import { useBillsByPO } from '@/hooks/useSupplierBills'
import { usePurchaseReturnsByPO, useCreatePurchaseReturn, useUpdatePOReturnStatus, type POReturn, type POReturnItem } from '@/hooks/usePurchaseReturns'
import { useWarehouses } from '@/hooks/useWarehouses'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useActivityLog } from '@/hooks/useActivityLog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  po?: PurchaseOrder | null
  poId?: string
  onEdit?: (po: PurchaseOrder) => void
}

export function PoDetailDialog({ open, onOpenChange, po, poId, onEdit }: Props) {
  const router = useRouter()
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [createBillOpen, setCreateBillOpen] = useState(false)

  const resolvedId = po?.id ?? poId ?? null

  const { data: fullPO, isLoading, isError } = usePurchaseOrder(open ? resolvedId : null)
  const { data: payments } = usePOPayments(open ? resolvedId : null)
  const { data: receivals } = usePOReceivalsByPO(open ? resolvedId : null)
  const { data: versions = [] } = usePoVersions(open ? resolvedId : null)
  const { data: activityLogs } = useActivityLog(
    open && resolvedId ? { module: 'purchase_orders', entity_id: resolvedId } : {}
  )
  const { data: existingBills = [] } = useBillsByPO(open ? resolvedId : null)
  const { data: poReturns = [] } = usePurchaseReturnsByPO(open ? resolvedId : null)
  const { data: warehouses = [] } = useWarehouses()
  const createPOReturn = useCreatePurchaseReturn()
  const updatePOReturnStatus = useUpdatePOReturnStatus()

  const [returnCreateOpen, setReturnCreateOpen] = useState(false)
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0])
  const [returnReason, setReturnReason] = useState('')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnWarehouseId, setReturnWarehouseId] = useState('')
  const [returnItems, setReturnItems] = useState<(POReturnItem & { _max: number })[]>([])
  const [expandedReturnId, setExpandedReturnId] = useState<string | null>(null)
  const submitPO = useSubmitPOForApproval()
  const cancelPO = useCancelPO()

  const current = fullPO ?? po
  const currentVersionNumber = current?.version_number ?? 1
  const [activeVersionTab, setActiveVersionTab] = useState(currentVersionNumber)

  // Reset to current version whenever the dialog opens or the PO changes
  useEffect(() => {
    if (open) setActiveVersionTab(currentVersionNumber)
  }, [open, currentVersionNumber])

  const isViewingSnapshot = activeVersionTab !== currentVersionNumber
  const snapshotVersion = versions.find((v) => v.version_number === activeVersionTab) ?? null

  function openCreateReturn() {
    const receivedLines = (fullPO?.po_line_items ?? []).filter((li) => li.received_qty > 0)
    setReturnItems(
      receivedLines.map((li) => ({
        item_name: li.item_name,
        sku: li.sku ?? null,
        qty: 0,
        brand_variant_id: li.brand_variant_id ?? null,
        _max: li.received_qty,
      }))
    )
    const latestReceival = (receivals ?? []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    setReturnWarehouseId(latestReceival?.warehouse_id ?? '')
    setReturnDate(new Date().toISOString().split('T')[0])
    setReturnReason('')
    setReturnNotes('')
    setReturnCreateOpen(true)
  }

  function handleCreatePOReturn() {
    if (!returnReason) { toast.error('Reason is required'); return }
    const items = returnItems.filter((i) => i.qty > 0)
    if (items.length === 0) { toast.error('Enter qty for at least one item'); return }
    if (!resolvedId) return
    createPOReturn.mutate(
      {
        source_id: resolvedId,
        date: returnDate,
        reason: returnReason,
        items: items.map(({ item_name, sku, qty, brand_variant_id }) => ({ item_name, sku, qty, brand_variant_id })),
        restock_warehouse_id: returnWarehouseId || null,
        notes: returnNotes || null,
      },
      {
        onSuccess: () => { toast.success('Return created'); setReturnCreateOpen(false) },
        onError: (err: Error) => toast.error(err.message),
      }
    )
  }

  // Show skeleton header while PO loads when only an ID was provided
  if (open && !current && isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
          <div className="p-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

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
                        completed: 'bg-teal-100 text-teal-700',
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
                <div className="flex flex-wrap gap-2 pr-6">
                  {!isViewingSnapshot && current.status === 'draft' && onEdit && (
                    <Button variant="outline" size="sm" onClick={() => { onEdit(current); onOpenChange(false) }}>
                      Edit PO
                    </Button>
                  )}
                  {!isViewingSnapshot && current.status === 'draft' && (
                    <Button
                      size="sm"
                      disabled={submitPO.isPending}
                      onClick={async () => {
                        try {
                          await submitPO.mutateAsync({ id: current.id })
                          toast.success('PO submitted for approval')
                        } catch (err: unknown) {
                          toast.error((err as Error)?.message ?? 'Failed to submit PO')
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
                  {!isViewingSnapshot && !['received', 'cancelled'].includes(current.status) && (
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
                  {!isViewingSnapshot && current.status !== 'cancelled' && (
                    existingBills.length > 0 ? (
                      <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); router.push(`/purchase/bills/${existingBills[0].id}`) }}>
                        View Bill ({existingBills[0].invoice_id})
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setCreateBillOpen(true)}>
                        Create Bill
                      </Button>
                    )
                  )}
                </div>
              )}
            </div>
            {current?.po_approvals && current.po_approvals.length > 0 && (
              <PoApprovalChain steps={current.po_approvals} />
            )}
          </DialogHeader>

          {versions.length > 0 && current && (
            <div className="-mx-4">
              <PoVersionTabs
                versions={versions}
                currentVersionNumber={currentVersionNumber}
                activeTab={activeVersionTab}
                onTabChange={setActiveVersionTab}
              />
            </div>
          )}

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
                {!isViewingSnapshot && <TabsTrigger value="receivals">Receivals</TabsTrigger>}
                {!isViewingSnapshot && current && ['approved', 'partially_received'].includes(current.status) && (
                  <TabsTrigger value="receive">Receive</TabsTrigger>
                )}
                {!isViewingSnapshot && <TabsTrigger value="payments">Payments</TabsTrigger>}
                <TabsTrigger value="activity">Activity</TabsTrigger>
                {!isViewingSnapshot && current && ['partially_received', 'received', 'completed'].includes(current.status) && (
                  <TabsTrigger value="returns">
                    Returns{poReturns.length > 0 ? ` (${poReturns.length})` : ''}
                  </TabsTrigger>
                )}
              </TabsList>

              {/* ── Line Items ───────────────────────────────────── */}
              <TabsContent value="items" className="flex-1 overflow-y-auto">
                {isViewingSnapshot && snapshotVersion ? (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="hidden sm:table-cell">SKU</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="hidden md:table-cell text-right">Free</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {snapshotVersion.line_items.map((li, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{li.item_name}</TableCell>
                              <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{li.sku || '—'}</TableCell>
                              <TableCell className="text-right">{li.qty}</TableCell>
                              <TableCell className="hidden md:table-cell text-right text-muted-foreground">{li.free_qty || '—'}</TableCell>
                              <TableCell className="text-right">{formatCurrency(li.unit_price, snapshotVersion.currency)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(li.total_price, snapshotVersion.currency)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-4 space-y-1 text-sm text-right pr-2">
                      <div className="text-muted-foreground">
                        Subtotal: <span className="text-foreground font-medium">{formatCurrency(snapshotVersion.subtotal, snapshotVersion.currency)}</span>
                      </div>
                      {snapshotVersion.discount_amount > 0 && (
                        <div className="text-muted-foreground">
                          Discount{snapshotVersion.discount_label ? ` (${snapshotVersion.discount_label})` : ''}: <span className="text-destructive">-{formatCurrency(snapshotVersion.discount_amount, snapshotVersion.currency)}</span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
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
                      <div className="text-xs text-muted-foreground">
                        {formatDate(r.date)}
                        {r.warehouse_name && <span> · {r.warehouse_name}</span>}
                        {r.received_by_name && <span> · {r.received_by_name}</span>}
                      </div>
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

              {/* ── Receive ──────────────────────────────────────── */}
              {current && ['approved', 'partially_received'].includes(current.status) && (
                <TabsContent value="receive" className="flex-1 overflow-y-auto">
                  <PoReceiveTab po={current} />
                </TabsContent>
              )}

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
                    {(activityLogs ?? []).map((log, idx) => {
                      const a = log.action ?? ''
                      const dotClass = a.includes('Cancelled') || a.includes('Rejected')
                        ? 'bg-destructive border-destructive'
                        : a.includes('Force Approved') || a.includes('Force)')
                          ? 'bg-orange-500 border-orange-500'
                          : a.includes('Approved') || a.includes('Received')
                            ? 'bg-green-500 border-green-500'
                            : a.includes('Payment')
                              ? 'bg-purple-500 border-purple-500'
                              : a.includes('Receival')
                                ? 'bg-teal-500 border-teal-500'
                                : 'bg-primary border-primary'
                      return (
                        <div key={log.id} className="relative pb-4">
                          {idx < (activityLogs ?? []).length - 1 && (
                            <span className="absolute left-[-16px] top-3 bottom-0 w-px bg-border" />
                          )}
                          <span className={cn('absolute left-[-20px] top-1.5 h-3 w-3 rounded-full border-2', dotClass)} />
                          <div className="text-sm flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{log.action}</span>
                            {log.severity === 'warning' && (
                              <span className="text-xs text-yellow-700 bg-yellow-100 px-1.5 py-0.5 rounded">Warning</span>
                            )}
                            {log.severity === 'critical' && (
                              <span className="text-xs text-red-700 bg-red-100 px-1.5 py-0.5 rounded">Critical</span>
                            )}
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

              {/* ── Returns ──────────────────────────────────────── */}
              {!isViewingSnapshot && current && ['partially_received', 'received', 'completed'].includes(current.status) && (
                <TabsContent value="returns" className="flex-1 overflow-y-auto space-y-3">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={(fullPO?.po_line_items ?? []).every((li) => li.received_qty === 0)}
                      title={(fullPO?.po_line_items ?? []).every((li) => li.received_qty === 0) ? 'No items received yet' : undefined}
                      onClick={openCreateReturn}
                    >
                      + Create Return
                    </Button>
                  </div>

                  {poReturns.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No returns for this order</p>
                  ) : (
                    poReturns.map((ret) => {
                      const PO_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
                        pending:            { label: 'Pending',            className: 'border-warning text-warning' },
                        dispatched:         { label: 'Dispatched',         className: 'border-blue-500 text-blue-500' },
                        supplier_confirmed: { label: 'Supplier Confirmed', className: 'border-success text-success' },
                        closed:             { label: 'Closed',             className: 'border-muted-foreground/50 text-muted-foreground' },
                        cancelled:          { label: 'Cancelled',          className: 'border-muted-foreground/30 text-muted-foreground/60' },
                      }
                      const cfg = PO_STATUS_CONFIG[ret.status] ?? PO_STATUS_CONFIG.pending
                      const PO_STATUS_NEXT: Partial<Record<string, string>> = {
                        pending:            'dispatched',
                        dispatched:         'supplier_confirmed',
                        supplier_confirmed: 'closed',
                      }
                      const PO_STATUS_LABEL: Record<string, string> = {
                        dispatched:         'Mark Dispatched',
                        supplier_confirmed: 'Confirm Supplier Receipt',
                        closed:             'Close Return',
                      }
                      const next = PO_STATUS_NEXT[ret.status]
                      const canCancel = ret.status === 'pending' || ret.status === 'dispatched'
                      return (
                        <div key={ret.id} className="rounded-md border p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="font-mono font-semibold text-sm hover:underline"
                                onClick={() => setExpandedReturnId(expandedReturnId === ret.id ? null : ret.id)}
                              >
                                {ret.return_number}
                              </button>
                              <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              {next && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={updatePOReturnStatus.isPending}
                                  onClick={() => updatePOReturnStatus.mutate(
                                    { id: ret.id, status: next as any, sourceId: resolvedId! },
                                    { onSuccess: () => toast.success(PO_STATUS_LABEL[next] ?? next), onError: (e: Error) => toast.error(e.message) }
                                  )}
                                >
                                  {PO_STATUS_LABEL[next]}
                                </Button>
                              )}
                              {canCancel && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={updatePOReturnStatus.isPending}
                                  onClick={() => updatePOReturnStatus.mutate(
                                    { id: ret.id, status: 'cancelled', sourceId: resolvedId! },
                                    { onSuccess: () => toast.success('Return cancelled'), onError: (e: Error) => toast.error(e.message) }
                                  )}
                                >
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ret.date} · {ret.items.length} item(s) · {ret.reason}
                          </div>
                          {expandedReturnId === ret.id && (
                            <div className="rounded-md border overflow-x-auto mt-2">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-xs">Item</TableHead>
                                    <TableHead className="text-xs text-right">Qty</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {ret.items.map((item, idx) => (
                                    <TableRow key={idx}>
                                      <TableCell className="text-xs">{item.item_name}{item.sku ? ` · ${item.sku}` : ''}</TableCell>
                                      <TableCell className="text-xs text-right">{item.qty}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}

                  {/* Create Return Dialog */}
                  <Dialog open={returnCreateOpen} onOpenChange={(o) => { if (!o) setReturnCreateOpen(false) }}>
                    <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
                      <DialogHeader className="shrink-0">
                        <DialogTitle>Create PO Return</DialogTitle>
                      </DialogHeader>
                      <div className="flex-1 overflow-y-auto space-y-4 py-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <Label htmlFor="por-date">Return Date *</Label>
                            <Input id="por-date" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="por-warehouse">Dispatch From Warehouse</Label>
                            <select
                              id="por-warehouse"
                              value={returnWarehouseId}
                              onChange={(e) => setReturnWarehouseId(e.target.value)}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                            >
                              <option value="">Select warehouse…</option>
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.id}>{w.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="por-reason">Reason *</Label>
                          <Input id="por-reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="e.g. Wrong item, damaged on arrival…" />
                        </div>
                        {returnItems.length > 0 && (
                          <div className="space-y-2">
                            <Label>Items to Return</Label>
                            {returnItems.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-3 rounded-md border p-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{item.item_name}</div>
                                  {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                                  <div className="text-xs text-muted-foreground">Max returnable: {item._max}</div>
                                </div>
                                <Input
                                  type="number"
                                  min="0"
                                  max={item._max}
                                  value={item.qty}
                                  onChange={(e) => {
                                    const updated = [...returnItems]
                                    updated[idx] = { ...updated[idx], qty: Math.min(item._max, Math.max(0, Number(e.target.value))) }
                                    setReturnItems(updated)
                                  }}
                                  className="w-20 text-right"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label htmlFor="por-notes">Notes</Label>
                          <Textarea id="por-notes" value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} />
                        </div>
                      </div>
                      <DialogFooter className="shrink-0">
                        <Button variant="outline" onClick={() => setReturnCreateOpen(false)} disabled={createPOReturn.isPending}>Cancel</Button>
                        <Button onClick={handleCreatePOReturn} disabled={createPOReturn.isPending}>
                          {createPOReturn.isPending ? 'Creating…' : 'Create Return'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </TabsContent>
              )}
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
      <CreateBillFromPODialog
        open={createBillOpen}
        onOpenChange={setCreateBillOpen}
        poId={current?.id ?? ''}
      />
    </>
  )
}
