'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldAlert, Eye } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PoStatusBadge } from '@/components/purchase/PoStatusBadge'
import { PoApprovalChain } from '@/components/purchase/PoApprovalChain'
import {
  usePendingApprovals, useCompletedApprovals,
  useApproveStep, useRejectPO, useForceApproveAllSteps, useMyApprovalRoles,
} from '@/hooks/usePOApprovals'
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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

interface ApprovalDialogState {
  po: PurchaseOrder
  step: POApprovalStep
  // Pending steps in this PO's latest iteration where the caller holds the
  // approval-slot role. >1 means the dialog shows a role chooser; the caller
  // (e.g. an Owner who also holds Purchase Manager / Accountant slots) must
  // explicitly pick which role they're acting as before the Approve click
  // commits — otherwise we'd silently approve whichever step happened to be
  // first in the chain.
  matchingSteps: POApprovalStep[]
}

// po_approvals.role is stored as the capitalised human-readable name
// (migration 20260615131936). The dialog and chain badges read these
// values directly — this map only exists to translate any legacy slug
// values that might still appear in older rows.
const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'Purchase Manager',
  accountant:       'Accountant',
  owner:            'Owner',
}

export default function ApprovalsPage() {
  const [dialogState, setDialogState] = useState<ApprovalDialogState | null>(null)
  const [comment, setComment] = useState('')
  const [rejectMode, setRejectMode] = useState<'full_rejection' | 'send_back_to_draft'>('full_rejection')
  const [showRejectOptions, setShowRejectOptions] = useState(false)
  const [showPrevIterations, setShowPrevIterations] = useState<Record<string, boolean>>({})
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null)

  const { data: pending, isLoading: pendingLoading } = usePendingApprovals()
  const { data: completed, isLoading: completedLoading } = useCompletedApprovals()
  const { data: myRoles = [] } = useMyApprovalRoles()
  const approveStep = useApproveStep()
  const rejectPO = useRejectPO()
  const forceApprove = useForceApproveAllSteps()

  function openDialog(po: PurchaseOrder) {
    const allSteps = po.po_approvals ?? []
    const maxIteration = Math.max(...allSteps.map((s) => s.iteration ?? 1), 1)
    const activePending = (s: POApprovalStep) => s.status === 'pending' && s.is_active && (s.iteration ?? 1) === maxIteration
    const matchingSteps = (allSteps as POApprovalStep[])
      .filter((s) => activePending(s) && myRoles.includes(s.role))
    // No matching role: fall back to the first pending step so an Owner viewing
    // a PO outside their role set still sees the chain context (the Approve
    // button stays disabled via the matchingSteps.length === 0 guard below).
    const fallback = (allSteps as POApprovalStep[]).find(activePending)
    // Default to the LAST matching step (Owner usually sits at chain bottom).
    // The user can pick a different one in the dialog if they hold more than
    // one role on this chain.
    const step = matchingSteps[matchingSteps.length - 1] ?? fallback
    if (!step) return
    setDialogState({ po, step, matchingSteps })
    setComment('')
    setShowRejectOptions(false)
    setRejectMode('full_rejection')
  }

  function handleApprove() {
    if (!dialogState) return
    const { po, step } = dialogState
    approveStep.mutate(
      { stepId: step.id, poId: po.id, comment },
      { onSuccess: () => { toast.success('Step approved'); setDialogState(null) }, onError: (e) => toast.error(e.message) }
    )
  }

  function handleForceApprove(po: PurchaseOrder) {
    forceApprove.mutate(
      { poId: po.id },
      {
        onSuccess: (data) => {
          const n = data?.approvedCount ?? 0
          toast.success(n > 1 ? `Force-approved ${n} remaining steps` : 'Force-approved')
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function handleReject() {
    if (!dialogState) return
    const { po, step } = dialogState
    rejectPO.mutate(
      { poId: po.id, stepId: step.id, comment, mode: rejectMode },
      { onSuccess: () => { toast.success(rejectMode === 'full_rejection' ? 'PO cancelled' : 'PO sent back to draft'); setDialogState(null) }, onError: (e) => toast.error(e.message) }
    )
  }

  const isMutating = approveStep.isPending || rejectPO.isPending || forceApprove.isPending

  return (
    <PageWrapper>
      <PageHeader title="PO Approvals" description="Review and action pending purchase order approvals" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        {pendingLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : (pending ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">No pending approvals requiring your action</div>
        ) : (
          <div className="space-y-3">
            {(pending ?? []).map((po, i) => {
              const allSteps = po.po_approvals ?? []
              const maxIteration = Math.max(...allSteps.map((s) => s.iteration ?? 1), 1)
              const currentSteps = allSteps.filter((s) => (s.iteration ?? 1) === maxIteration)
              const pendingSteps = currentSteps.filter((s) => s.status === 'pending' && s.is_active)
              const showPrev = showPrevIterations[po.id]
              return (
                <div key={po.id} className={cn('rounded-lg border p-4 space-y-3', STAGGER_IN)} style={staggerDelay(i)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{po.po_number}</span>
                      <PoStatusBadge status={po.status} />
                      {maxIteration > 1 && (
                        <Badge variant="outline" className="text-xs">Attempt #{maxIteration}</Badge>
                      )}
                    </div>
                    <div className="text-sm font-semibold">{formatCurrency(po.total_qar, 'QAR')}</div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{po.supplier_name} · {formatDate(po.created_date)}</span>
                    <PoApprovalChain steps={allSteps} showIteration={maxIteration} />
                  </div>
                  {pendingSteps.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Waiting for: <span className="font-medium text-foreground">{pendingSteps.map((s) => ROLE_LABELS[s.role] ?? s.role).join(', ')}</span>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" className="min-h-11 md:min-h-0" onClick={() => openDialog(po)}>Review</Button>
                    {myRoles.includes('Owner') && pendingSteps.length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={forceApprove.isPending}
                            className="gap-1 min-h-11 md:min-h-0 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" /> Force Approve
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Force-approve {pendingSteps.length} remaining {pendingSteps.length === 1 ? 'step' : 'steps'}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will approve {pendingSteps.map((s) => ROLE_LABELS[s.role] ?? s.role).join(', ')} on PO{' '}
                              <span className="font-mono font-medium">{po.po_number}</span>. The activity log will show each role separately, marked as Force Approved.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleForceApprove(po)}
                              className="bg-amber-500 hover:bg-amber-600 text-white"
                            >
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {maxIteration > 1 && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setShowPrevIterations((s) => ({ ...s, [po.id]: !s[po.id] }))}
                      >
                        {showPrev ? 'Hide' : 'View'} Previous Attempts
                      </button>
                    )}
                  </div>
                  {showPrev && (
                    <div className="space-y-1 pt-1 border-t">
                      {Array.from({ length: maxIteration - 1 }, (_, i) => i + 1).map((iter) => (
                        <div key={iter} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Attempt #{iter}:</span>
                          <PoApprovalChain steps={allSteps} showIteration={iter} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Completed Approvals</h2>
        {completedLoading ? (
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
                  <TableHead className="w-[70px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(completed ?? []).length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="p-0"><EmptyState title="No completed approvals" /></TableCell></TableRow>
                ) : (
                  (completed ?? []).map((po, i) => {
                    const allSteps = po.po_approvals ?? []
                    const maxIteration = Math.max(...allSteps.map((s) => s.iteration ?? 1), 1)
                    return (
                      <TableRow key={po.id} className={STAGGER_IN} style={staggerDelay(i)}>
                        <TableCell className="font-mono text-sm font-medium">{po.po_number}</TableCell>
                        <TableCell>{po.supplier_name}</TableCell>
                        <TableCell><PoStatusBadge status={po.status} /></TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(po.total_qar, 'QAR')}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <PoApprovalChain steps={allSteps} showIteration={maxIteration} />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-8 min-h-11 md:min-h-0 gap-1 px-2" onClick={() => setViewPO(po)}>
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={!!dialogState} onOpenChange={(open) => { if (!open) setDialogState(null) }}>
        <DialogContent className="w-full max-w-full h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:max-w-2xl sm:rounded-lg flex flex-col p-0 gap-0">
          {dialogState && (
            <>
              <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                <DialogTitle>Approve / Reject — {dialogState.po.po_number}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 px-6 pb-2 overflow-y-auto flex-1 sm:flex-initial">
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supplier</span>
                    <span className="font-medium">{dialogState.po.supplier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total (QAR)</span>
                    <span className="font-semibold">{formatCurrency(dialogState.po.total_qar, 'QAR')}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">
                      {dialogState.matchingSteps.length > 1 ? 'Approving as' : 'Approval step'}
                    </span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {dialogState.matchingSteps.length > 1 ? (
                        dialogState.matchingSteps.map((s) => {
                          const isPicked = s.id === dialogState.step.id
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setDialogState({ ...dialogState, step: s })}
                              className={`rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
                                isPicked
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-input bg-background hover:bg-muted'
                              }`}
                              aria-pressed={isPicked}
                            >
                              {ROLE_LABELS[s.role] ?? s.role}
                            </button>
                          )
                        })
                      ) : (
                        <Badge variant="outline">{ROLE_LABELS[dialogState.step.role] ?? dialogState.step.role}</Badge>
                      )}
                    </div>
                  </div>
                </div>
                {dialogState.matchingSteps.length === 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    You don&apos;t hold any of the pending roles on this chain. Approve and Reject are disabled — use Force Approve from the list if you need to push it through as Owner.
                  </div>
                )}

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
                        {(dialogState.po.po_line_items ?? []).map((li, i) => (
                          <TableRow key={li.id} className={STAGGER_IN} style={staggerDelay(i)}>
                            <TableCell className="text-sm">{li.item_name}</TableCell>
                            <TableCell className="text-right text-sm">{li.qty}</TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              <div className="flex flex-col items-end leading-tight">
                                <span>{formatCurrency(li.total_price, dialogState.po.currency)}</span>
                                {dialogState.po.currency !== 'QAR' && dialogState.po.exchange_rate != null && dialogState.po.exchange_rate !== 1 && (
                                  <span className="text-[10px] font-normal text-muted-foreground/70">
                                    ≈ {formatCurrency(li.total_price * dialogState.po.exchange_rate, 'QAR')}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Chain:</span>
                  <PoApprovalChain steps={dialogState.po.po_approvals ?? []} />
                </div>

                <div className="space-y-1">
                  <label htmlFor="approval-comment" className="text-sm font-medium">
                    {showRejectOptions
                      ? <>Reason for rejection <span className="text-destructive">*</span></>
                      : <>Comment <span className="text-muted-foreground">(optional)</span></>}
                  </label>
                  <Textarea
                    id="approval-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Optional comment…"
                    rows={3}
                  />
                </div>

                {showRejectOptions && (
                  <div className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">Rejection type:</p>
                    {[
                      { value: 'full_rejection' as const, label: 'Full Rejection', desc: 'Cancel the PO entirely' },
                      { value: 'send_back_to_draft' as const, label: 'Send Back to Draft', desc: 'Reset to draft for revision and resubmission' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={rejectMode === opt.value}
                        onClick={() => setRejectMode(opt.value)}
                        className={`flex w-full min-h-11 items-start gap-3 rounded-md border p-2 text-left transition-colors ${
                          rejectMode === opt.value ? 'border-destructive bg-destructive/5' : 'hover:bg-muted'
                        }`}
                      >
                        <div className={`mt-0.5 h-3 w-3 rounded-full border-2 shrink-0 ${rejectMode === opt.value ? 'border-destructive bg-destructive' : 'border-muted-foreground'}`} />
                        <div>
                          <div className="text-sm font-medium">{opt.label}</div>
                          <div className="text-xs text-muted-foreground">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="mx-0 mb-0 flex-col sm:flex-row gap-2 px-6 py-4 border-t shrink-0 bg-background rounded-b-lg">
                {!showRejectOptions ? (
                  <>
                    <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/5" onClick={() => setShowRejectOptions(true)} disabled={isMutating}>
                      ✗ Reject
                    </Button>
                    <Button
                      onClick={handleApprove}
                      disabled={isMutating || dialogState.matchingSteps.length === 0}
                      className="bg-success hover:bg-success/90 text-white"
                    >
                      {approveStep.isPending ? 'Approving…' : '✓ Approve'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowRejectOptions(false)} disabled={isMutating}>Back</Button>
                    <Button variant="destructive" onClick={handleReject} disabled={isMutating || !comment.trim() || dialogState.matchingSteps.length === 0}>
                      {rejectPO.isPending ? 'Rejecting…' : `Confirm — ${rejectMode === 'full_rejection' ? 'Cancel PO' : 'Send to Draft'}`}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* View completed PO approval details */}
      <Dialog open={!!viewPO} onOpenChange={(o) => { if (!o) setViewPO(null) }}>
        <DialogContent className="w-full max-w-full h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:max-w-2xl sm:rounded-lg flex flex-col p-0 gap-0">
          {viewPO && (() => {
            const allSteps = viewPO.po_approvals ?? []
            const maxIteration = Math.max(...allSteps.map((s) => s.iteration ?? 1), 1)
            const currentSteps = [...allSteps].filter((s) => (s.iteration ?? 1) === maxIteration)
              .sort((a, b) => (a.tier_rank ?? 0) - (b.tier_rank ?? 0))

            return (
              <>
                <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                  <DialogTitle>Approval Details · {viewPO.po_number}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 px-6 pb-2 overflow-y-auto flex-1 sm:flex-initial">
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Supplier</span>
                      <span className="font-medium">{viewPO.supplier_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total (QAR)</span>
                      <span className="font-semibold">{formatCurrency(viewPO.total_qar, 'QAR')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <PoStatusBadge status={viewPO.status} />
                    </div>
                  </div>

                  {(viewPO.po_line_items ?? []).length > 0 && (
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
                          {(viewPO.po_line_items ?? []).map((li, i) => (
                            <TableRow key={li.id} className={STAGGER_IN} style={staggerDelay(i)}>
                              <TableCell className="text-sm">{li.item_name}</TableCell>
                              <TableCell className="text-right text-sm">{li.qty}</TableCell>
                              <TableCell className="text-right text-sm font-medium">
                                <div className="flex flex-col items-end leading-tight">
                                  <span>{formatCurrency(li.total_price, viewPO.currency)}</span>
                                  {viewPO.currency !== 'QAR' && viewPO.exchange_rate != null && viewPO.exchange_rate !== 1 && (
                                    <span className="text-[10px] font-normal text-muted-foreground/70">
                                      ≈ {formatCurrency(li.total_price * viewPO.exchange_rate, 'QAR')}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Chain:</span>
                    <PoApprovalChain steps={allSteps} showIteration={maxIteration} />
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-medium mb-2">Approval Timeline</div>
                    {currentSteps.map((step) => {
                      const wasActuallyDecided = !!step.approved_by
                      const isRejected = step.status === 'rejected' && wasActuallyDecided
                      const isApproved = step.status === 'approved'
                      const isNotReached = !isRejected && !isApproved
                      return (
                        <div key={step.id} className={`flex items-start gap-3 rounded-md border p-2.5 ${isNotReached ? 'opacity-60' : ''}`}>
                          <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            isApproved ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            isRejected ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {isApproved ? '✓' : isRejected ? '✕' : '—'}
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">
                                {ROLE_LABELS[step.role] ?? step.role}
                                {step.force_approved && (
                                  <span className="ml-1.5 text-[10px] text-amber-600 font-normal">(Force)</span>
                                )}
                              </span>
                              <Badge variant="outline" className={`text-[10px] ${
                                isApproved ? 'border-green-300 text-green-700 dark:text-green-400' :
                                isRejected ? 'border-red-300 text-red-700 dark:text-red-400' :
                                ''
                              }`}>
                                {isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Not reached'}
                              </Badge>
                            </div>
                            {isRejected && step.approved_by && (
                              <p className="text-xs text-muted-foreground">
                                Rejected by {step.approved_by}
                                {step.date && <> · {formatDate(step.date)}</>}
                              </p>
                            )}
                            {isApproved && step.approved_by && (
                              <p className="text-xs text-muted-foreground">
                                Approved by {step.approved_by}
                                {step.date && <> · {formatDate(step.date)}</>}
                              </p>
                            )}
                            {isNotReached && (
                              <p className="text-xs text-muted-foreground">
                                Skipped — chain ended before this step
                              </p>
                            )}
                            {step.comment && wasActuallyDecided && (
                              <div className={`mt-1 rounded px-2 py-1 text-xs italic ${
                                isRejected
                                  ? 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                                  : 'bg-muted text-muted-foreground'
                              }`}>
                                &ldquo;{step.comment}&rdquo;
                              </div>
                            )}
                            {step.force_comment && (
                              <div className="mt-1 rounded px-2 py-1 text-xs italic bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                                Force reason: &ldquo;{step.force_comment}&rdquo;
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <DialogFooter className="mx-0 mb-0 px-6 py-4 border-t shrink-0 bg-background rounded-b-lg">
                  <Button variant="outline" onClick={() => setViewPO(null)}>Close</Button>
                </DialogFooter>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
