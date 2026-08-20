'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, X, AlertTriangle, ShieldAlert, CheckCircle2, XCircle, FileText, ExternalLink, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'
import { useMyApprovalSlotRoles } from '@/hooks/useRoles'
import {
  usePendingCreditGroupRequests,
  useCompletedCreditGroupRequests,
  useApproveCreditGroupChange,
  useRejectCreditGroupChange,
  useForceApproveCreditGroupChange,
  type CreditGroupRequest,
  type CreditGroupApprovalRow,
} from '@/hooks/useCreditGroupApprovals'

const ROLE_SHORT: Record<string, string> = {
  'Purchase Manager': 'PM',
  'Accountant':       'AC',
  'Owner':            'OW',
}

function shortRole(name: string): string {
  if (ROLE_SHORT[name]) return ROLE_SHORT[name]
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || '?'
}

function CreditGroupChain({ rows }: { rows: CreditGroupApprovalRow[] }) {
  if (!rows || rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.step_order - b.step_order)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {sorted.map((s, idx) => (
        <div key={s.id} className="flex items-center gap-0.5">
          {idx > 0 && <div className="h-px w-2 bg-muted-foreground/20" />}
          <div
            title={`${s.step_role}: ${s.status}${s.force_approved ? ' (force-approved)' : ''}${s.decided_by_name ? ` — ${s.decided_by_name}` : ''}`}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold relative',
              s.status === 'approved' && 'border-success bg-success/10 text-success',
              s.status === 'rejected' && 'border-destructive bg-destructive/10 text-destructive',
              s.status === 'pending' && s.is_active && 'border-primary/40 bg-primary/5 text-primary animate-pulse',
              s.status === 'pending' && !s.is_active && 'border-muted-foreground/20 bg-muted text-muted-foreground/50',
            )}
          >
            {s.status === 'approved' ? (
              <Check className="h-3 w-3" />
            ) : s.status === 'rejected' ? (
              <X className="h-3 w-3" />
            ) : (
              <span>{shortRole(s.step_role)}</span>
            )}
            {s.force_approved && (
              <span className="absolute -top-1 -right-1">
                <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

interface DialogState {
  request: CreditGroupRequest
  step:    CreditGroupApprovalRow
  matchingSteps: CreditGroupApprovalRow[]
}

export function CreditGroupApprovalsContent() {
  const [dialogState, setDialogState] = useState<DialogState | null>(null)
  const [comment, setComment] = useState('')
  const [showRejectMode, setShowRejectMode] = useState(false)

  const { data: pending = [],   isLoading: pendingLoading }   = usePendingCreditGroupRequests()
  const { data: completed = [], isLoading: completedLoading } = useCompletedCreditGroupRequests()
  const { data: myRoles = [] } = useMyApprovalSlotRoles()
  const approve      = useApproveCreditGroupChange()
  const reject       = useRejectCreditGroupChange()
  const forceApprove = useForceApproveCreditGroupChange()

  const myCreditGroupRoles = new Set(
    myRoles
      .filter((r) => r.scopes === null || r.scopes.includes('credit_group'))
      .map((r) => r.name),
  )
  const isOwner = myCreditGroupRoles.has('Owner')

  function openDialog(request: CreditGroupRequest) {
    const rows = request.rows ?? []
    const pendingActive = rows.filter((s) => s.status === 'pending' && s.is_active)
    const matchingSteps = pendingActive.filter((s) => myCreditGroupRoles.has(s.step_role))
    const fallback = pendingActive[0]
    const step = matchingSteps[matchingSteps.length - 1] ?? fallback
    if (!step) return
    setDialogState({ request, step, matchingSteps })
    setComment('')
    setShowRejectMode(false)
  }

  function handleApprove() {
    if (!dialogState) return
    approve.mutate(
      { approvalId: dialogState.step.id, requestId: dialogState.request.id, comment },
      {
        onSuccess: () => { toast.success('Step approved'); setDialogState(null) },
        onError:   (e) => toast.error(e.message),
      },
    )
  }

  function handleReject() {
    if (!dialogState) return
    if (!comment.trim()) { toast.error('A reason is required to reject'); return }
    reject.mutate(
      { approvalId: dialogState.step.id, requestId: dialogState.request.id, reason: comment },
      {
        onSuccess: () => {
          toast.success('Request rejected — customer keeps previous group')
          setDialogState(null)
        },
        onError:   (e) => toast.error(e.message),
      },
    )
  }

  function handleForceApprove(request: CreditGroupRequest) {
    forceApprove.mutate(
      { requestId: request.id },
      {
        onSuccess: ({ data: count }) => {
          toast.success(
            count > 1
              ? `Force-approved ${count} remaining steps`
              : 'Force-approved',
          )
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Error'),
      },
    )
  }

  const [docUrls, setDocUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!dialogState) { setDocUrls({}); return }
    const req = dialogState.request
    const paths: { key: string; path: string }[] = []
    if (req.cr_url) paths.push({ key: 'cr', path: req.cr_url })
    if (req.establishment_id_url) paths.push({ key: 'establishment', path: req.establishment_id_url })
    if (req.signed_credit_form_url) paths.push({ key: 'signed', path: req.signed_credit_form_url })
    if (paths.length === 0) return
    const supabase = createClient()
    Promise.all(
      paths.map(async ({ key, path }) => {
        const { data } = await supabase.storage.from('customer-credit-docs').createSignedUrl(path, 3600)
        return { key, url: data?.signedUrl ?? '' }
      }),
    ).then((results) => {
      const map: Record<string, string> = {}
      for (const r of results) if (r.url) map[r.key] = r.url
      setDocUrls(map)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogState?.request.id])

  const isMutating = approve.isPending || reject.isPending || forceApprove.isPending

  return (
    <>
      {/* Pending */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pending Approvals</h2>
        {pendingLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No pending credit-group changes
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r, i) => {
              const rows = r.rows ?? []
              const pendingActive = rows.filter((s) => s.status === 'pending' && s.is_active)
              const pendingRoles = pendingActive.map((s) => s.step_role)
              const callerCanAct = pendingActive.some((s) => myCreditGroupRoles.has(s.step_role))
              return (
                <div key={r.id} className={cn('rounded-lg border p-4 space-y-3', STAGGER_IN)} style={staggerDelay(i)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold truncate">{r.customer_name ?? '—'}</span>
                      <Badge variant="secondary">Credit Group Change</Badge>
                    </div>
                    <div className="text-sm font-semibold whitespace-nowrap">
                      {r.requested_group_limit != null
                        ? `Limit ${formatCurrency(Number(r.requested_group_limit), 'QAR')}`
                        : '—'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      <span className="text-muted-foreground">{r.previous_group_name ?? (r.previous_group_id ? 'Cash' : 'New')}</span>
                      <span className="mx-1.5">→</span>
                      <span className="font-medium text-foreground">{r.requested_group_name ?? '—'}</span>
                      <> · {formatDate(r.created_at)}</>
                    </span>
                    <CreditGroupChain rows={rows} />
                  </div>

                  {pendingRoles.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Waiting for:{' '}
                      <span className="font-medium text-foreground">{pendingRoles.join(', ')}</span>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {callerCanAct ? (
                      <Button size="sm" onClick={() => openDialog(r)}>Review</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => openDialog(r)}>
                        View
                      </Button>
                    )}
                    {isOwner && pendingActive.length > 0 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={forceApprove.isPending}
                            className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" /> Force Approve
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Force-approve {pendingActive.length} remaining {pendingActive.length === 1 ? 'step' : 'steps'}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will approve {pendingRoles.join(', ')} on the credit-group request for{' '}
                              <span className="font-medium">{r.customer_name}</span>. Already-approved roles keep their original attribution; only the remaining steps are marked as Force Approved.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleForceApprove(r)}
                              className="bg-amber-500 hover:bg-amber-600 text-white"
                            >
                              Confirm
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Completed */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Completed Approvals</h2>
        {completedLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell text-right">Limit</TableHead>
                  <TableHead className="hidden md:table-cell">Decided</TableHead>
                  <TableHead className="hidden sm:table-cell">Chain</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="p-0"><EmptyState title="No completed credit-group changes yet" /></TableCell>
                  </TableRow>
                ) : completed.map((r, i) => {
                  const rows  = r.rows ?? []
                  const wasForced = rows.some((s) => s.force_approved)
                  return (
                    <TableRow key={r.id} className={STAGGER_IN} style={staggerDelay(i)}>
                      <TableCell className="font-medium">{r.customer_name ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">{r.previous_group_name ?? (r.previous_group_id ? 'Cash' : 'New')}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium">{r.requested_group_name ?? '—'}</span>
                      </TableCell>
                      <TableCell>
                        {r.status === 'approved' ? (
                          <Badge variant="outline" className="border-success text-success gap-1">
                            {wasForced && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                            Approved
                          </Badge>
                        ) : r.status === 'rejected' ? (
                          <Badge variant="outline" className="border-destructive text-destructive">Rejected</Badge>
                        ) : (
                          <Badge variant="outline">{r.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right text-sm">
                        {r.requested_group_limit != null
                          ? formatCurrency(Number(r.requested_group_limit), 'QAR')
                          : '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {r.decided_at ? formatDate(r.decided_at) : '—'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <CreditGroupChain rows={rows} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Review Dialog */}
      <Dialog open={!!dialogState} onOpenChange={(o) => { if (!o) setDialogState(null) }}>
        <DialogContent className="w-full max-w-full h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:max-w-2xl sm:rounded-lg flex flex-col p-0 gap-0">
          {dialogState && (
            <>
              <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
                <DialogTitle>
                  Credit Group Change — {dialogState.request.customer_name}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 px-6 pb-2 overflow-y-auto flex-1">
                {/* Summary */}
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From</span>
                    <span>{dialogState.request.previous_group_name ?? (dialogState.request.previous_group_id ? 'Cash' : 'New Customer')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To</span>
                    <span className="font-medium">{dialogState.request.requested_group_name ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New limit</span>
                    <span className="font-semibold">
                      {dialogState.request.requested_group_limit != null
                        ? formatCurrency(Number(dialogState.request.requested_group_limit), 'QAR')
                        : '—'}
                    </span>
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
                              className={cn(
                                'rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
                                isPicked
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-input bg-background hover:bg-muted',
                              )}
                              aria-pressed={isPicked}
                            >
                              {s.step_role}
                            </button>
                          )
                        })
                      ) : (
                        <Badge variant="outline">{dialogState.step.step_role}</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Customer Details */}
                {(dialogState.request.customer_phone || dialogState.request.customer_email || dialogState.request.customer_entity_type || dialogState.request.customer_type) && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <User className="h-4 w-4 text-primary" /> Customer Details
                    </div>
                    <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      {dialogState.request.customer_entity_type && (
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-muted-foreground text-xs">Entity Type</span>
                          <span className="font-medium capitalize">{dialogState.request.customer_entity_type.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {dialogState.request.customer_type && (
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-muted-foreground text-xs">Customer Type</span>
                          <span className="font-medium capitalize">{dialogState.request.customer_type.replace(/_/g, ' ')}</span>
                        </div>
                      )}
                      {dialogState.request.customer_phone && (
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-muted-foreground text-xs">Phone</span>
                          <span className="font-medium">{dialogState.request.customer_phone}</span>
                        </div>
                      )}
                      {dialogState.request.customer_email && (
                        <div className="flex justify-between sm:flex-col sm:gap-0.5">
                          <span className="text-muted-foreground text-xs">Email</span>
                          <span className="font-medium">{dialogState.request.customer_email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {dialogState.matchingSteps.length === 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    You don&apos;t hold any of the pending roles on this chain. Approve is disabled — use Force Approve from the list if you need to push it through as Owner.
                  </div>
                )}

                {/* Trigger banner */}
                <div className="rounded-md border-l-4 border-amber-500 bg-amber-500/5 p-3 text-xs space-y-1">
                  <div className="font-medium">Why this needs approval</div>
                  <div className="text-amber-700">
                    Moving <span className="font-medium">{dialogState.request.customer_name}</span> to
                    <span className="font-medium"> {dialogState.request.requested_group_name}</span>
                    {dialogState.request.requested_group_limit != null && (
                      <> grants a credit limit of <span className="font-medium">{formatCurrency(Number(dialogState.request.requested_group_limit), 'QAR')}</span></>
                    )}.
                  </div>
                </div>

                {/* Documents */}
                {(dialogState.request.cr_url || dialogState.request.establishment_id_url || dialogState.request.signed_credit_form_url) && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-primary" /> Submitted Documents
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {([
                        { key: 'cr', label: 'Commercial Registration', path: dialogState.request.cr_url },
                        { key: 'establishment', label: 'Establishment ID', path: dialogState.request.establishment_id_url },
                        { key: 'signed', label: 'Signed Credit Form', path: dialogState.request.signed_credit_form_url },
                      ] as const).map((doc) => (
                        <div key={doc.key} className="rounded-md border p-2.5 text-xs space-y-1">
                          <div className="font-medium text-muted-foreground">{doc.label}</div>
                          {doc.path ? (
                            docUrls[doc.key] ? (
                              <a
                                href={docUrls[doc.key]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                              >
                                View <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">Loading...</span>
                            )
                          ) : (
                            <span className="text-destructive">Not uploaded</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Chain visual */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Chain:</span>
                  <CreditGroupChain rows={dialogState.request.rows ?? []} />
                </div>

                {/* Timeline */}
                <div className="text-xs space-y-1">
                  <div className="font-medium">Steps</div>
                  {[...(dialogState.request.rows ?? [])]
                    .sort((a, b) => a.step_order - b.step_order)
                    .map((row) => (
                      <div key={row.id} className="flex items-center gap-2">
                        <span className={cn(
                          row.status === 'approved' ? 'text-green-600' :
                          row.status === 'rejected' ? 'text-red-600' :
                          row.is_active             ? 'text-amber-600' :
                                                      'text-muted-foreground',
                        )}>
                          {row.status === 'approved' ? '✓' : row.status === 'rejected' ? '✕' : row.is_active ? '●' : '○'}
                        </span>
                        <span>Step {row.step_order} — {row.step_role}</span>
                        {row.decided_by_name && (
                          <span className="text-muted-foreground">
                            · {row.decided_by_name}{row.force_approved && ' (force)'}
                          </span>
                        )}
                      </div>
                    ))}
                </div>

                {/* Comment */}
                <div className="space-y-1">
                  <label htmlFor="cg-comment" className="text-sm font-medium">
                    {showRejectMode
                      ? <>Reason for rejection <span className="text-destructive">*</span></>
                      : <>Comment <span className="text-muted-foreground">(required to reject)</span></>}
                  </label>
                  <Textarea
                    id="cg-comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Notes for the audit trail…"
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter className="!mx-0 !mb-0 flex-col sm:flex-row gap-2 px-6 pb-4 pt-3 border-t shrink-0 rounded-b-lg">
                {!showRejectMode ? (
                  <>
                    <Button
                      variant="outline"
                      className="text-destructive border-destructive hover:bg-destructive/5"
                      onClick={() => setShowRejectMode(true)}
                      disabled={isMutating}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                    <Button
                      onClick={handleApprove}
                      disabled={isMutating || dialogState.matchingSteps.length === 0}
                      className="bg-success hover:bg-success/90 text-white"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      {approve.isPending ? 'Approving…' : 'Approve'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowRejectMode(false)} disabled={isMutating}>
                      Back
                    </Button>
                    <Button variant="destructive" onClick={handleReject} disabled={isMutating || !comment.trim()}>
                      {reject.isPending ? 'Rejecting…' : 'Confirm Reject'}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
