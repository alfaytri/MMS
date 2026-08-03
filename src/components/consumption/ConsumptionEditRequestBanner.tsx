'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Lock, ShieldCheck, ShieldX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useDecideConsumptionEdit,
  type ConsumptionEditRequest,
} from '@/hooks/useConsumption'

interface Props {
  request:   ConsumptionEditRequest
  canReview: boolean
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

/**
 * Renders the current state of a consumption's most recent edit request
 * inline in the detail dialog. Three visual states:
 *
 *   pending    — amber, shows requester + reason + Approve/Decline buttons
 *                to users who hold a consumption_edit approval role.
 *   approved   — muted, notes that stock was restored + who approved.
 *                Only shown briefly; the consumption itself flips to
 *                Cancelled and the parent dialog surfaces that state.
 *   rejected   — muted, shows the review comment.
 */
export function ConsumptionEditRequestBanner({ request, canReview }: Props) {
  const decide = useDecideConsumptionEdit()
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineComment, setDeclineComment] = useState('')

  const requesterName = request.requester_name ?? 'a team member'

  if (request.status === 'pending') {
    return (
      <>
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-warning-foreground font-medium text-[12px]">
                <Lock className="h-3.5 w-3.5" />
                Cancellation requested by {requesterName} · {relativeTime(request.created_at)}
              </div>
              <p className="text-[11px] text-foreground/80 break-words whitespace-pre-wrap">{request.reason}</p>
            </div>
            {canReview && (
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => setDeclineOpen(true)}
                  disabled={decide.isPending}
                >
                  <X className="h-3 w-3 mr-1" /> Decline
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[11px] bg-success text-success-foreground hover:bg-success/90"
                  onClick={() => {
                    decide.mutate(
                      {
                        request_id:     request.id,
                        decision:       'approved',
                        consumption_id: request.consumption_id,
                      },
                      {
                        onSuccess: () => toast.success('Approved — stock restored'),
                        onError:   (err) => toast.error(err.message),
                      },
                    )
                  }}
                  disabled={decide.isPending}
                >
                  <Check className="h-3 w-3 mr-1" /> Approve
                </Button>
              </div>
            )}
            {!canReview && (
              <span className="text-[10px] text-muted-foreground italic shrink-0 self-center">
                Awaiting approver
              </span>
            )}
          </div>
        </div>

        <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Decline cancellation request?</AlertDialogTitle>
              <AlertDialogDescription>
                The requester will see your comment. Briefly explain why.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              value={declineComment}
              onChange={(e) => setDeclineComment(e.target.value)}
              placeholder="e.g. Consumption looks correct — the shortage is downstream."
              rows={3}
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={decide.isPending}>Keep pending</AlertDialogCancel>
              <AlertDialogAction
                disabled={decide.isPending || !declineComment.trim()}
                onClick={() => {
                  decide.mutate(
                    {
                      request_id:     request.id,
                      decision:       'rejected',
                      comment:        declineComment,
                      consumption_id: request.consumption_id,
                    },
                    {
                      onSuccess: () => {
                        toast.success('Cancellation request declined')
                        setDeclineOpen(false)
                        setDeclineComment('')
                      },
                      onError: (err) => toast.error(err.message),
                    },
                  )
                }}
              >
                Decline
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  if (request.status === 'approved') {
    return (
      <div className="rounded-md border border-success/40 bg-success/10 p-3">
        <div className="flex items-center gap-1.5 text-success font-medium text-[12px]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Cancellation approved
          {request.reviewer_name && <> · by {request.reviewer_name}</>}
          {request.reviewed_at && <> · {relativeTime(request.reviewed_at)}</>}
        </div>
        <p className="text-[11px] text-foreground/80 mt-1">Stock restored to the source sub-container.</p>
      </div>
    )
  }

  // rejected
  return (
    <div className="rounded-md border border-muted-foreground/30 bg-muted/40 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground font-medium text-[12px]">
        <ShieldX className="h-3.5 w-3.5" />
        Cancellation declined
        {request.reviewer_name && <> · by {request.reviewer_name}</>}
        {request.reviewed_at && <> · {relativeTime(request.reviewed_at)}</>}
      </div>
      {request.review_comment && (
        <p className="text-[11px] text-foreground/80 whitespace-pre-wrap break-words">{request.review_comment}</p>
      )}
    </div>
  )
}
