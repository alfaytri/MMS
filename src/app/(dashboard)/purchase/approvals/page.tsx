'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PoStatusBadge } from '@/components/purchase/PoStatusBadge'
import { PoApprovalChain } from '@/components/purchase/PoApprovalChain'
import { usePendingApprovals, useCompletedApprovals, useApproveStep, useRejectPO } from '@/hooks/usePOApprovals'
import { type PurchaseOrder, type POApprovalStep } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface ApprovalDialogState {
  po: PurchaseOrder
  step: POApprovalStep
}

const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export default function ApprovalsPage() {
  const [dialogState, setDialogState] = useState<ApprovalDialogState | null>(null)
  const [comment, setComment] = useState('')
  const [rejectMode, setRejectMode] = useState<'full_rejection' | 'send_back_to_draft'>('full_rejection')
  const [showRejectOptions, setShowRejectOptions] = useState(false)

  const { data: pending, isLoading: pendingLoading, isError: pendingError } = usePendingApprovals()
  const { data: completed, isLoading: completedLoading, isError: completedError } = useCompletedApprovals()
  const approveStep = useApproveStep()
  const rejectPO = useRejectPO()

  function openDialog(po: PurchaseOrder) {
    const step = (po.po_approvals ?? []).find((s) => s.status === 'pending')
    if (!step) return
    setDialogState({ po, step })
    setComment('')
    setShowRejectOptions(false)
    setRejectMode('full_rejection')
  }

  function handleApprove() {
    if (!dialogState) return
    const { po, step } = dialogState

    approveStep.mutate(
      {
        stepId: step.id,
        poId: po.id,
        comment,
      },
      {
        onSuccess: () => {
          toast.success('Step approved')
          setDialogState(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleReject() {
    if (!dialogState) return
    const { po, step } = dialogState
    rejectPO.mutate(
      {
        poId: po.id,
        stepId: step.id,
        comment,
        mode: rejectMode,
      },
      {
        onSuccess: () => {
          toast.success(rejectMode === 'full_rejection' ? 'PO cancelled' : 'PO sent back to draft')
          setDialogState(null)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const isMutating = approveStep.isPending || rejectPO.isPending

  return (
    <PageWrapper>
      <PageHeader title="PO Approvals" description="Review and action pending purchase order approvals" />

      {/* Pending Approvals */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        {pendingError ? (
          <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
            Failed to load pending approvals. Please refresh.
          </div>
        ) : pendingLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : (pending ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No pending approvals
          </div>
        ) : (
          <div className="space-y-3">
            {(pending ?? []).map((po) => {
              const pendingStep = (po.po_approvals ?? []).find((s) => s.status === 'pending')
              return (
                <button
                  key={po.id}
                  type="button"
                  className="w-full text-left rounded-lg border p-4 space-y-3 hover:bg-muted/50 transition-colors"
                  onClick={() => openDialog(po)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{po.po_number}</span>
                      <PoStatusBadge status={po.status} />
                    </div>
                    <div className="text-sm font-semibold">{formatCurrency(po.total_qar, 'QAR')}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      {po.supplier_name} · {formatDate(po.created_date)}
                    </span>
                    <PoApprovalChain steps={po.po_approvals ?? []} />
                  </div>
                  {pendingStep && (
                    <div className="text-xs text-muted-foreground">
                      Waiting for:{' '}
                      <span className="font-medium text-foreground">
                        {ROLE_LABELS[pendingStep.role] ?? pendingStep.role}
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Completed Approvals */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Completed Approvals</h2>
        {completedError ? (
          <div className="text-sm text-destructive p-4">Failed to load completed approvals.</div>
        ) : completedLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Approvals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(completed ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground h-16">
                      No completed approvals
                    </TableCell>
                  </TableRow>
                ) : (
                  (completed ?? []).map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-mono text-sm font-medium">{po.po_number}</TableCell>
                      <TableCell>{po.supplier_name}</TableCell>
                      <TableCell><PoStatusBadge status={po.status} /></TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(po.total_qar, 'QAR')}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <PoApprovalChain steps={po.po_approvals ?? []} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Approval Dialog */}
      <Dialog open={!!dialogState} onOpenChange={(open) => { if (!open) setDialogState(null) }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
          {dialogState && (
            <>
              <DialogHeader>
                <DialogTitle>Approve / Reject — {dialogState.po.po_number}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* PO Summary */}
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supplier</span>
                    <span className="font-medium">{dialogState.po.supplier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total (QAR)</span>
                    <span className="font-semibold">{formatCurrency(dialogState.po.total_qar, 'QAR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Approval step</span>
                    <Badge variant="outline">
                      {ROLE_LABELS[dialogState.step.role] ?? dialogState.step.role}
                    </Badge>
                  </div>
                </div>

                {/* Line items summary */}
                {(dialogState.po.po_line_items ?? []).length > 0 && (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(dialogState.po.po_line_items ?? []).map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="text-sm">{li.item_name}</TableCell>
                            <TableCell className="text-right text-sm">{li.qty}</TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {formatCurrency(li.total_price, dialogState.po.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Approval chain */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Chain:</span>
                  <PoApprovalChain steps={dialogState.po.po_approvals ?? []} />
                </div>

                {/* Comment */}
                <div className="space-y-1">
                  <label htmlFor="approval-comment" className="text-sm font-medium">Comment</label>
                  <Textarea
                    id="approval-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Optional comment…"
                    rows={3}
                  />
                </div>

                {/* Rejection options */}
                {showRejectOptions && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">Rejection type:</p>
                    {[
                      { value: 'full_rejection' as const, label: 'Full Rejection', desc: 'Cancel the PO entirely' },
                      { value: 'send_back_to_draft' as const, label: 'Send Back to Draft', desc: 'Reset to draft for revision' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={rejectMode === opt.value}
                        onClick={() => setRejectMode(opt.value)}
                        className={`flex w-full min-h-11 items-start gap-3 rounded-md border p-2 text-left transition-colors ${
                          rejectMode === opt.value
                            ? 'border-destructive bg-destructive/5'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <div
                          className={`mt-0.5 h-3 w-3 rounded-full border-2 shrink-0 ${
                            rejectMode === opt.value
                              ? 'border-destructive bg-destructive'
                              : 'border-muted-foreground'
                          }`}
                        />
                        <div>
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {!showRejectOptions ? (
                  <>
                    <Button
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/5"
                      onClick={() => setShowRejectOptions(true)}
                      disabled={isMutating}
                    >
                      ✗ Reject
                    </Button>
                    <Button
                      onClick={handleApprove}
                      disabled={isMutating}
                      className="bg-success hover:bg-success/90 text-white"
                    >
                      {approveStep.isPending ? 'Approving…' : '✓ Approve'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowRejectOptions(false)} disabled={isMutating}>
                      Back
                    </Button>
                    <Button variant="destructive" onClick={handleReject} disabled={isMutating}>
                      {rejectPO.isPending
                        ? 'Rejecting…'
                        : `Confirm — ${rejectMode === 'full_rejection' ? 'Cancel PO' : 'Send to Draft'}`
                      }
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
