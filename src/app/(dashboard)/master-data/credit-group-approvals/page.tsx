'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/utils/formatters'
import { useMyApprovalSlotRoles } from '@/hooks/useRoles'
import {
  usePendingCreditGroupRequests,
  useApproveCreditGroupChange,
  useRejectCreditGroupChange,
  type CreditGroupRequest,
  type CreditGroupApprovalRow,
} from '@/hooks/useCreditGroupApprovals'

interface DialogState {
  request: CreditGroupRequest
  step:    CreditGroupApprovalRow
}

export default function CreditGroupApprovalsPage() {
  const [dialogState, setDialogState] = useState<DialogState | null>(null)
  const [comment, setComment] = useState('')

  const { data: requests = [], isLoading } = usePendingCreditGroupRequests()
  const { data: myRoles = [] } = useMyApprovalSlotRoles()
  const approve = useApproveCreditGroupChange()
  const reject  = useRejectCreditGroupChange()

  const myRoleNames = new Set(
    myRoles
      .filter((r) => r.scopes === null || r.scopes.includes('credit_group'))
      .map((r) => r.name)
  )

  function openDialog(request: CreditGroupRequest) {
    const rows = request.rows ?? []
    // Default to the LAST pending step the caller holds the role for.
    const matching = rows.filter(
      (s) => s.status === 'pending' && s.is_active && myRoleNames.has(s.step_role)
    )
    const step = matching[matching.length - 1] ?? rows.find((s) => s.status === 'pending')
    if (!step) return
    setComment('')
    setDialogState({ request, step })
  }

  function handleApprove() {
    if (!dialogState) return
    approve.mutate(
      { approvalId: dialogState.step.id, comment },
      {
        onSuccess: () => { toast.success('Step approved'); setDialogState(null) },
        onError:   (e) => toast.error(e.message),
      }
    )
  }

  function handleReject() {
    if (!dialogState) return
    if (!comment.trim()) { toast.error('A reason is required to reject'); return }
    reject.mutate(
      { approvalId: dialogState.step.id, reason: comment },
      {
        onSuccess: () => { toast.success('Request rejected — customer keeps previous group'); setDialogState(null) },
        onError:   (e) => toast.error(e.message),
      }
    )
  }

  const isMutating = approve.isPending || reject.isPending

  return (
    <PageWrapper>
      <PageHeader
        title="Credit Group Approvals"
        description="Review pending customer credit-group assignments. Chain runs Purchase Manager → Accountant → Owner."
      />

      <section className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}</div>
        ) : requests.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No pending credit-group changes
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>From → To</TableHead>
                  <TableHead className="hidden sm:table-cell">Requested</TableHead>
                  <TableHead>Chain</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => {
                  const rows = (r.rows ?? []).sort((a, b) => a.step_order - b.step_order)
                  const callerCanAct = rows.some(
                    (s) => s.status === 'pending' && s.is_active && myRoleNames.has(s.step_role)
                  )
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.customer_name ?? '—'}</TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">{r.previous_group_name ?? 'Cash'}</span>
                        <span className="mx-1">→</span>
                        <span className="font-medium">{r.requested_group_name ?? '—'}</span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {rows.map((s) => (
                            <span
                              key={s.id}
                              className={
                                s.status === 'approved' ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700 text-[10px] font-medium' :
                                s.status === 'rejected' ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-red-700 text-[10px] font-medium' :
                                'inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium'
                              }
                              title={`${s.step_role} — ${s.status}${s.decided_by_name ? ` by ${s.decided_by_name}` : ''}`}
                            >
                              {s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✕' : s.step_order}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {callerCanAct ? (
                          <Button size="sm" onClick={() => openDialog(r)}>Review</Button>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Awaiting other approver</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Dialog open={!!dialogState} onOpenChange={(o) => { if (!o) setDialogState(null) }}>
        <DialogContent className="sm:max-w-lg">
          {dialogState && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Approve / Reject — {dialogState.request.customer_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From</span>
                    <span>{dialogState.request.previous_group_name ?? 'Cash'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To</span>
                    <span className="font-medium">{dialogState.request.requested_group_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Your role</span>
                    <Badge variant="outline">{dialogState.step.step_role}</Badge>
                  </div>
                </div>

                <div>
                  <label htmlFor="cg-comment" className="text-sm font-medium">
                    Comment <span className="text-muted-foreground">(required to reject)</span>
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
              <DialogFooter>
                <Button
                  variant="outline"
                  className="text-destructive border-destructive hover:bg-destructive/5"
                  onClick={handleReject}
                  disabled={isMutating}
                >
                  ✗ Reject
                </Button>
                <Button onClick={handleApprove} disabled={isMutating} className="bg-success hover:bg-success/90 text-white">
                  {approve.isPending ? 'Approving…' : '✓ Approve'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
