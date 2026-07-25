'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Clock, Check, X, User, MessageSquare, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCancelCreditGroupChange, type CreditGroupRequest } from '@/hooks/useCreditGroupApprovals'
import { formatDate } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  request: CreditGroupRequest
  customerName: string
}

export function CreditGroupPendingDialog({ open, onOpenChange, request, customerName }: Props) {
  const cancelReq = useCancelCreditGroupChange()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')

  const rows = (request.rows ?? []).slice().sort((a, b) => a.step_order - b.step_order)
  const currentStep = rows.find((r) => r.status === 'pending' && r.is_active)

  function handleCancel() {
    cancelReq.mutate(
      { requestId: request.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Request cancelled')
          setConfirming(false); setReason('')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setConfirming(false); setReason('') } onOpenChange(o) }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-amber-600" />
            Credit Group Request — {customerName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-sm">
          {/* Summary */}
          <div className="rounded-lg border bg-muted/30 px-3 py-2.5 space-y-1.5">
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Requested group</span>
              <span className="font-semibold">{request.requested_group_name ?? '—'}</span>
            </div>
            {request.previous_group_name && (
              <div className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">Previous group</span>
                <span>{request.previous_group_name}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">Submitted</span>
              <span>{formatDate(request.created_at)}</span>
            </div>
          </div>

          {/* Chain */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Approval Chain
            </div>
            {rows.length === 0 && (
              <div className="text-xs text-muted-foreground italic">No approval steps.</div>
            )}
            {rows.map((row) => {
              const isDone = row.status === 'approved'
              const isRejected = row.status === 'rejected'
              const isCurrent = row.status === 'pending' && row.is_active
              const iconClass = isDone
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : isRejected
                ? 'bg-destructive/10 text-destructive'
                : isCurrent
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-2 ring-amber-300'
                : 'bg-muted text-muted-foreground'
              return (
                <div key={row.id} className={`rounded-lg border px-3 py-2 flex items-start gap-3 ${isCurrent ? 'border-amber-300' : ''}`}>
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${iconClass}`}>
                    {isDone ? <Check className="h-3 w-3" /> : isRejected ? <X className="h-3 w-3" /> : row.step_order}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-medium capitalize">{row.step_role.replaceAll('_', ' ')}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {isDone && 'Approved'}
                        {isRejected && 'Rejected'}
                        {isCurrent && 'Waiting'}
                        {!isDone && !isRejected && !isCurrent && 'Pending'}
                        {row.decided_at && ` · ${formatDate(row.decided_at)}`}
                      </span>
                    </div>
                    {row.decided_by_name && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <User className="h-2.5 w-2.5" />
                        {row.decided_by_name}
                      </div>
                    )}
                    {(row.comment || row.reason) && (
                      <div className="text-[11px] mt-1 flex items-start gap-1 text-muted-foreground">
                        <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                        <span className="italic">{row.comment ?? row.reason}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {currentStep && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <Clock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Waiting on <span className="font-semibold capitalize">{currentStep.step_role.replaceAll('_', ' ')}</span> to review.</span>
            </div>
          )}

          {confirming && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>Cancelling withdraws the request. If the customer was blocked pending this approval, they will be unblocked.</span>
              </div>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for cancelling (optional)…"
                className="text-xs min-h-[52px] resize-none"
              />
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 mt-4 border-t border-border flex-col-reverse sm:flex-row gap-2">
          {!confirming ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => setConfirming(true)}
              >
                Cancel Request
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => { setConfirming(false); setReason('') }}>Back</Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cancelReq.isPending}
                onClick={handleCancel}
              >
                {cancelReq.isPending ? 'Cancelling…' : 'Confirm Cancel'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
