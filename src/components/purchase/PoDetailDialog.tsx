'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Send, XCircle, Pencil, Undo2, Receipt, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { PoApprovalChain } from './PoApprovalChain'
import { CreateBillFromPODialog } from './CreateBillFromPODialog'
import { PoPaymentDialog } from './PoPaymentDialog'
import { SupplierPaymentEditDialog, type EditablePayment } from './SupplierPaymentEditDialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useDeleteSupplierPayment } from '@/hooks/useSupplierPayments'
import { useHasPermission } from '@/hooks/usePermissions'
import { PoReceiveTab } from './PoReceiveTab'
import { ReceivalSerialsStep } from './ReceivalSerialsStep'
import { PoVersionTabs } from './PoVersionTabs'
import { stageOf, type Stage } from '@/lib/poVersionHelper'
import { PoReturnsTab } from './PoReturnsTab'
import { PoPdfButton } from './PoPdfButton'
import type { PoPdfVariant } from '@/lib/purchase/generate-po-pdf'
import { ActivityTimeline } from '@/components/shared/ActivityTimeline'
import { DocumentExchangeTab } from '@/components/shared/DocumentExchangeTab'
import { PaymentSummaryTab } from '@/components/shared/PaymentSummaryTab'
import {
  usePurchaseOrder,
  usePOPayments,
  usePOReceivalsByPO,
  usePoVersions,
  useSubmitPOForApproval,
  useCancelPO,
  useRecallPOToDraft,
  BILLABLE_PO_STATUSES,
  type PurchaseOrder,
} from '@/hooks/usePurchaseOrders'
import { useBillsByPO } from '@/hooks/useSupplierBills'
import { usePurchaseReturnsByPO } from '@/hooks/usePurchaseReturns'
import { useActivityLog } from '@/hooks/useActivityLog'
import { useMyApprovalRoles } from '@/hooks/usePOApprovals'
import { usePoEditRequest } from '@/hooks/usePoEditRequests'
import { useDivisions } from '@/hooks/useDivisions'
import { EditRequestBanner } from './EditRequestBanner'
import { RequestEditDialog } from './RequestEditDialog'
import { RfqQuotesTab } from './RfqQuotesTab'
import { ReceivalCheckButton } from './ReceivalCheckButton'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { Badge } from '@/components/ui/badge'
import { variantPickerLabel, GENERIC_VARIANT_LABEL } from '@/lib/inventory/variantPickerLabel'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

const inventoryTypeBadge: Record<string, { label: string; className: string }> = {
  'products':    { label: 'Product',    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  'spare-parts': { label: 'Spare Part', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  'consumables': { label: 'Consumable', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  'tools':       { label: 'Tool',       className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
}

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
  const [requestEditOpen, setRequestEditOpen] = useState(false)
  const [serialsReceival, setSerialsReceival] = useState<{ id: string; number: string } | null>(null)
  const [editPaymentTarget, setEditPaymentTarget] = useState<EditablePayment | null>(null)
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<{ id: string; amount: number; date: string; currency: string } | null>(null)
  const canManagePayments = useHasPermission('purchase.payments.manage')
  // Per-tab view gates (Line Items is the base tab, always shown). System admins
  // bypass via useHasPermission. Rolled out on-by-default to existing PO viewers.
  const canTabReceivals = useHasPermission('purchase.orders.tab.receivals.view')
  const canTabPayments  = useHasPermission('purchase.orders.tab.payments.view')
  const canTabBills     = useHasPermission('purchase.orders.tab.bills.view')
  const canTabReturns   = useHasPermission('purchase.orders.tab.returns.view')
  const canTabActivity  = useHasPermission('purchase.orders.tab.activity.view')
  const canTabExchange  = useHasPermission('purchase.orders.tab.exchange.view')
  const deletePaymentMut = useDeleteSupplierPayment()

  const resolvedId = po?.id ?? poId ?? null

  const { data: fullPO, isLoading, isError } = usePurchaseOrder(open ? resolvedId : null)
  const { data: divisions = [] } = useDivisions()
  const isMultiDivPO = (fullPO?.division_ids?.length ?? 0) > 1
  const divisionShort = (id: string | null) => {
    if (!id) return null
    const d = divisions.find((x) => x.id === id)
    return d ? (d.short_name || d.name) : null
  }
  const { data: payments } = usePOPayments(open ? resolvedId : null)
  const { data: receivals } = usePOReceivalsByPO(open ? resolvedId : null)
  const { data: versions = [] } = usePoVersions(open ? resolvedId : null)
  const { data: activityLogs } = useActivityLog(
    open && resolvedId ? { module: 'purchase_orders', entity_id: resolvedId, pageSize: 500 } : {}
  )
  const { data: existingBills = [] } = useBillsByPO(open ? resolvedId : null)
  const { data: poReturns = [] } = usePurchaseReturnsByPO(open ? resolvedId : null)
  const submitPO = useSubmitPOForApproval()
  const cancelPO = useCancelPO()
  const recallPO = useRecallPOToDraft()
  const { data: myRoles = [] } = useMyApprovalRoles()
  const { data: editRequest = null } = usePoEditRequest(open ? resolvedId : null)

  const current = fullPO ?? po
  const hasOpenRequest    = !!editRequest
  const hasApprovedUnlock = editRequest?.status === 'approved'
  const hasApprovalRole   = myRoles.length > 0  // any approval-slot holder

  // Edit visibility: Owner always sees it on approved/pending POs (Phase C).
  // ANY user sees it when an approved-unused request unlocks the PO (Phase D).
  const canEdit =
    ['approved', 'pending_approval'].includes(current?.status ?? '') &&
    (myRoles.includes('Owner') || hasApprovedUnlock)
  // Owner can also recall a pending PO straight back to draft without editing.
  const canRecall = current?.status === 'pending_approval' && myRoles.includes('Owner')
  // Non-Owners see Request Edit when the PO is locked AND no open request exists yet.
  const canRequestEdit =
    ['approved', 'pending_approval'].includes(current?.status ?? '') &&
    !myRoles.includes('Owner') &&
    !hasOpenRequest
  const isBillableLive = !!current && BILLABLE_PO_STATUSES.includes(current.status)
  const liveStage: Stage = current?.po_type ? stageOf(current.po_type) : 'draft'
  const [activeStage, setActiveStage] = useState<Stage>(liveStage)
  const [activeVersion, setActiveVersion] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      setActiveStage(liveStage)
      setActiveVersion(null)
    }
  }, [open, liveStage])

  const isViewingSnapshot = activeVersion !== null
  const snapshotVersion = isViewingSnapshot
    ? versions.find((v) => v.stage === activeStage && v.version_number === activeVersion) ?? null
    : null

  if (open && !current && isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg h-[85vh] overflow-hidden flex flex-col">
          <div className="p-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // 'completed' included: a PO can be fully received while still carrying an
  // outstanding balance (e.g. after a payment edit) — the operator must be
  // able to record the remainder. PaymentSummaryTab hides the button once
  // totalPaid >= totalAmount, so fully-paid POs never show it.
  const canRecordPayment = current && ['approved', 'partially_received', 'received', 'completed'].includes(current.status)
  const showReturns = !isViewingSnapshot && current && ['partially_received', 'received', 'completed'].includes(current.status)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0 pb-3 border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="font-mono text-lg">{current?.po_number}</DialogTitle>
                  {current && (
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                      {
                        draft: 'bg-muted text-foreground',
                        pending_approval: 'bg-amber-100 text-amber-700',
                        approved: 'bg-blue-100 text-blue-700',
                        partially_received: 'bg-purple-100 text-purple-700',
                        received: 'bg-green-100 text-green-700',
                        completed: 'bg-teal-100 text-teal-700',
                        cancelled: 'bg-red-100 text-red-700',
                      }[current.status] ?? 'bg-muted text-foreground'
                    )}>
                      {current.status.replace(/_/g, ' ')}
                    </span>
                  )}
                  {current && !['draft', 'pending_approval', 'cancelled'].includes(current.status) && (() => {
                    const billedTotal = existingBills.reduce((s, b) => s + b.total_amount, 0)
                    const poTotal = current.total_qar ?? 0
                    if (existingBills.length === 0) return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                        <Receipt className="h-3 w-3" /> Not Billed
                      </span>
                    )
                    if (billedTotal < poTotal) return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <Receipt className="h-3 w-3" /> Partially Billed
                      </span>
                    )
                    return (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <Receipt className="h-3 w-3" /> Fully Billed
                      </span>
                    )
                  })()}
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
                  {(() => {
                    const variant: PoPdfVariant =
                      activeStage === 'rfq'   ? 'rfq'   :
                      activeStage === 'draft' ? 'draft' :
                      current.status === 'approved' ? 'confirmed' : 'po'
                    return (
                      <PoPdfButton
                        poId={current.id}
                        poNumber={current.po_number}
                        variant={variant}
                        snapshotVersion={isViewingSnapshot ? activeVersion ?? undefined : undefined}
                      />
                    )
                  })()}
                  {!isViewingSnapshot && canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onOpenChange(false)
                        router.push(`/purchase/edit-po/${current.id}`)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                  )}
                  {!isViewingSnapshot && canRequestEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRequestEditOpen(true)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Request Edit
                    </Button>
                  )}
                  {!isViewingSnapshot && canRecall && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={recallPO.isPending}
                      onClick={async () => {
                        if (!confirm('Recall this PO to Draft? The pending approval will be cancelled.')) return
                        try {
                          await recallPO.mutateAsync(current.id)
                          toast.success('PO recalled to Draft')
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Failed to recall PO')
                        }
                      }}
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1.5" />
                      {recallPO.isPending ? 'Recalling…' : 'Recall to Draft'}
                    </Button>
                  )}
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
                  {!isViewingSnapshot && isBillableLive && (
                    existingBills.length > 0 ? (
                      <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); router.push(`/purchase/bills/${existingBills[0].id}`) }}>
                        View Bill ({existingBills[0].bill_number})
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

          {editRequest && (
            <EditRequestBanner request={editRequest} canReview={hasApprovalRole} />
          )}

          {current && (
            <div className="-mx-4">
              <PoVersionTabs
                versions={versions}
                currentPoType={current.po_type ?? 'draft'}
                activeStage={activeStage}
                activeVersion={activeVersion}
                onChange={(stage, version) => {
                  setActiveStage(stage)
                  setActiveVersion(version)
                }}
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
              <TabsList className="shrink-0 mx-0 max-w-full overflow-x-auto whitespace-nowrap">
                <TabsTrigger value="items">Line Items</TabsTrigger>
                {!isViewingSnapshot && canTabReceivals && <TabsTrigger value="receivals">Receivals</TabsTrigger>}
                {!isViewingSnapshot && current && ['approved', 'partially_received'].includes(current.status) && (
                  <TabsTrigger value="receive">Receive</TabsTrigger>
                )}
                {!isViewingSnapshot && canTabPayments && <TabsTrigger value="payments">Payments</TabsTrigger>}
                {!isViewingSnapshot && canTabBills && (
                  <TabsTrigger value="bills">
                    Bills{existingBills.length > 0 ? ` (${existingBills.length})` : ''}
                  </TabsTrigger>
                )}
                {canTabActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
                {showReturns && canTabReturns && (
                  <TabsTrigger value="returns">
                    Returns{poReturns.length > 0 ? ` (${poReturns.length})` : ''}
                  </TabsTrigger>
                )}
                {!isViewingSnapshot && current?.po_type === 'rfq' && (
                  <TabsTrigger value="quotes">Quotes</TabsTrigger>
                )}
                {!isViewingSnapshot && current && current.currency && current.currency !== 'QAR' && canTabExchange && (
                  <TabsTrigger value="exchange">Exchange</TabsTrigger>
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
                          {(snapshotVersion.po_version_lines ?? []).map((li, idx) => (
                            <TableRow key={idx} className={STAGGER_IN} style={staggerDelay(idx)}>
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
                          {(fullPO?.po_line_items ?? []).map((li, ri) => {
                            const bv = li.inventory_item_brand_variants
                            const cat = bv?.inventory_items?.inventory_categories
                            const chain = cat?.ancestor_chain ?? []
                            const itemType = cat?.type ?? null
                            const typeBadge = itemType ? inventoryTypeBadge[itemType] : null
                            const vlabel = variantPickerLabel({
                              brand_name: bv?.brands?.name ?? null,
                              brand: bv?.brand ?? null,
                              country_name: bv?.country_codes?.name ?? null,
                            })
                            // "Brand · Origin" (or just one, or origin-only). Suppress the
                            // "Generic" fallback so plain lines stay uncluttered as before.
                            const brandOrigin = vlabel.primary === GENERIC_VARIANT_LABEL
                              ? null
                              : vlabel.origin ? `${vlabel.primary} · ${vlabel.origin}` : vlabel.primary
                            return (
                            <TableRow key={li.id} className={STAGGER_IN} style={staggerDelay(ri)}>
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
                                    {isMultiDivPO && divisionShort(li.division_id) && (
                                      <Badge variant="outline" className="h-4 text-[10px] px-1.5">
                                        {divisionShort(li.division_id)}
                                      </Badge>
                                    )}
                                    {brandOrigin && (
                                      <span className="text-xs text-muted-foreground">— {brandOrigin}</span>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{li.sku ?? '—'}</TableCell>
                              <TableCell className="text-right">{li.qty}</TableCell>
                              <TableCell className="hidden md:table-cell text-right text-muted-foreground">{li.free_qty || '—'}</TableCell>
                              <TableCell className="hidden md:table-cell text-right">{li.received_qty}</TableCell>
                              <TableCell className="text-right">{formatCurrency(li.unit_price, current?.currency ?? 'QAR')}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(li.total_price, current?.currency ?? 'QAR')}</TableCell>
                            </TableRow>
                            )
                          })}
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
                {current && (
                  <div className="flex items-center justify-end">
                    <ReceivalCheckButton
                      poId={current.id}
                      poNumber={current.po_number}
                      mode="blank"
                    />
                  </div>
                )}
                {(receivals ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No receivals yet</p>
                ) : (
                  (receivals ?? []).map((r) => (
                    <div key={r.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.receival_number}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-medium">{r.status}</span>
                          {current && (
                            <ReceivalCheckButton
                              poId={current.id}
                              poNumber={current.po_number}
                              mode="per_receival"
                              receivalId={r.id}
                              receivalNumber={r.receival_number}
                            />
                          )}
                        </div>
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
                              {r.receival_items.map((ri, i) => (
                                <TableRow key={ri.id} className={STAGGER_IN} style={staggerDelay(i)}>
                                  <TableCell className="text-xs">{ri.item_name}{ri.is_free && <span className="ml-1 text-[10px] px-1 py-0.5 rounded border">Free</span>}</TableCell>
                                  <TableCell className="text-xs text-right">{ri.qty_received}</TableCell>
                                  <TableCell className="text-xs text-right">{formatCurrency(ri.unit_cost, current?.currency ?? 'QAR')}</TableCell>
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
                  <PoReceiveTab po={current} onReceivalCreated={setSerialsReceival} />
                </TabsContent>
              )}

              {/* ── Payments ─────────────────────────────────────── */}
              <TabsContent value="payments" className="flex-1 overflow-y-auto">
                <PaymentSummaryTab
                  payments={payments ?? []}
                  totalAmount={(current?.subtotal ?? 0) - (current?.discount_amount ?? 0)}
                  currency={current?.currency ?? 'QAR'}
                  canRecord={!!canRecordPayment}
                  onRecordPayment={() => setPaymentOpen(true)}
                  onEditPayment={canManagePayments ? (p) => setEditPaymentTarget({
                    id: p.id,
                    amount: p.amount,
                    method: p.method,
                    date: p.date,
                    reference: p.reference,
                    notes: p.notes ?? null,
                    currency: p.currency ?? current?.currency ?? 'QAR',
                    exchange_rate: p.exchange_rate ?? 1,
                    po_id: resolvedId,
                  }) : undefined}
                  onDeletePayment={canManagePayments ? (p) => setDeletePaymentTarget({
                    id: p.id,
                    amount: p.amount,
                    date: p.date,
                    currency: p.currency ?? current?.currency ?? 'QAR',
                  }) : undefined}
                />
              </TabsContent>

              {/* ── Bills ───────────────────────────────────────── */}
              <TabsContent value="bills" className="flex-1 overflow-y-auto">
                {existingBills.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Receipt className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No bills created yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Bills are created from approved purchase orders</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                      <span>{existingBills.length} bill{existingBills.length !== 1 ? 's' : ''}</span>
                      <span>
                        Total billed: <span className="font-semibold text-foreground">{formatCurrency(existingBills.reduce((s, b) => s + b.total_amount, 0), current?.currency ?? 'QAR')}</span>
                      </span>
                    </div>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bill #</TableHead>
                            <TableHead className="hidden sm:table-cell">Issued</TableHead>
                            <TableHead className="hidden md:table-cell">Due Date</TableHead>
                            <TableHead className="text-center hidden sm:table-cell">Payment</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">Paid</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {existingBills.map((bill, i) => (
                              <TableRow key={bill.id} className={cn('group', STAGGER_IN)} style={staggerDelay(i)}>
                                <TableCell>
                                  <button
                                    type="button"
                                    onClick={() => { onOpenChange(false); router.push(`/purchase/bills/${bill.id}`) }}
                                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-sm cursor-pointer"
                                  >
                                    {bill.bill_number}
                                    <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                  {bill.issued_date ? formatDate(bill.issued_date) : '—'}
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-sm">
                                  {bill.due_date ? formatDate(bill.due_date) : '—'}
                                </TableCell>
                                <TableCell className="text-center hidden sm:table-cell">
                                  <span className={cn(
                                    'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                                    {
                                      unpaid: 'bg-red-100 text-red-700',
                                      partially_paid: 'bg-amber-100 text-amber-700',
                                      paid: 'bg-green-100 text-green-700',
                                      overdue: 'bg-red-200 text-red-800',
                                    }[bill.payment_status] ?? 'bg-muted text-foreground'
                                  )}>
                                    {bill.payment_status.replace(/_/g, ' ')}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm font-medium">
                                  {formatCurrency(bill.total_amount, current?.currency ?? 'QAR')}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">
                                  {(bill.paid_amount ?? 0) > 0 ? (
                                    <span className="text-emerald-600">{formatCurrency(bill.paid_amount ?? 0, current?.currency ?? 'QAR')}</span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* ── Activity ─────────────────────────────────────── */}
              <TabsContent value="activity" className="flex-1 overflow-y-auto">
                <ActivityTimeline logs={activityLogs?.rows ?? []} />
              </TabsContent>

              {/* ── Returns ──────────────────────────────────────── */}
              {showReturns && fullPO && (
                <TabsContent value="returns" className="flex-1 overflow-y-auto">
                  <PoReturnsTab po={fullPO} poReturns={poReturns} />
                </TabsContent>
              )}

              {/* ── Quotes (RFQ only) ────────────────────────────── */}
              {!isViewingSnapshot && current?.po_type === 'rfq' && (
                <TabsContent value="quotes" className="flex-1 overflow-y-auto p-4">
                  <RfqQuotesTab
                    poId={current.id}
                    poNumber={current.po_number}
                    currency={current.currency ?? 'QAR'}
                    lineItems={(fullPO?.po_line_items ?? []).map((li) => ({
                      id: li.id,
                      item_name: li.item_name,
                      qty: li.qty,
                      unit: li.unit,
                      unit_price: li.unit_price,
                    }))}
                  />
                </TabsContent>
              )}

              {/* ── Exchange (foreign-currency only) ─────────────── */}
              {!isViewingSnapshot && current && current.currency && current.currency !== 'QAR' && (
                <TabsContent value="exchange" className="flex-1 overflow-y-auto">
                  <DocumentExchangeTab documentType="po" documentId={current.id} />
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
      {current && (
        <RequestEditDialog
          open={requestEditOpen}
          onOpenChange={setRequestEditOpen}
          poId={current.id}
          poNumber={current.po_number ?? null}
        />
      )}

      <SupplierPaymentEditDialog
        open={!!editPaymentTarget}
        onOpenChange={(v) => { if (!v) setEditPaymentTarget(null) }}
        payment={editPaymentTarget}
      />

      <AlertDialog
        open={!!deletePaymentTarget}
        onOpenChange={(v) => { if (!v) setDeletePaymentTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <span className="font-mono font-medium">
                {deletePaymentTarget ? formatCurrency(deletePaymentTarget.amount, deletePaymentTarget.currency) : ''}
              </span>
              {deletePaymentTarget && ` recorded on ${formatDate(deletePaymentTarget.date)}`}.
              The bill&apos;s outstanding balance will be restored automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deletePaymentTarget) return
                try {
                  await deletePaymentMut.mutateAsync({
                    payment_id: deletePaymentTarget.id,
                    po_id: resolvedId,
                    amount: deletePaymentTarget.amount,
                    currency: deletePaymentTarget.currency,
                  })
                  toast.success('Payment deleted')
                } catch (err: unknown) {
                  toast.error((err as Error).message ?? 'Delete failed')
                } finally {
                  setDeletePaymentTarget(null)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm tool serials — opens after any receival finishes.
          Lives here (not inside PoReceiveTab) so it survives the Receive tab
          unmounting when the PO status flips to completed. */}
      <Dialog open={!!serialsReceival} onOpenChange={(o) => { if (!o) setSerialsReceival(null) }}>
        <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[54rem] sm:h-[85vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
            <DialogTitle className="text-sm font-semibold">Confirm Tool Serials</DialogTitle>
          </DialogHeader>
          {serialsReceival && (
            <ReceivalSerialsStep
              receivalId={serialsReceival.id}
              receivalNumber={serialsReceival.number}
              onDone={() => setSerialsReceival(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
