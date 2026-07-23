'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Check, X, Lock, Unlock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useReviewEditRequest, type EditRequest } from '@/hooks/usePoEditRequests'

interface Props {
  request:    EditRequest
  canReview:  boolean
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

export function EditRequestBanner({ request, canReview }: Props) {
  const review = useReviewEditRequest()
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineComment, setDeclineComment] = useState('')

  const requesterName = request.user_data?.full_name ?? 'a team member'

  if (request.status === 'pending') {
    return (
      <>
        <div className="mx-4 my-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
                <Lock className="h-3.5 w-3.5" />
                Edit request from {requesterName} · {relativeTime(request.created_at)}
              </div>
              <p className="text-amber-900 break-words">{request.reason}</p>
            </div>
            {canReview && (
              <div className="flex gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  onClick={() => setDeclineOpen(true)}
                  disabled={review.isPending}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Decline
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    review.mutate(
                      { requestId: request.id, decision: 'approved' },
                      {
                        onSuccess: () => toast.success('Edit request approved'),
                        onError: (err) => toast.error(err.message),
                      },
                    )
                  }}
                  disabled={review.isPending}
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Approve
                </Button>
              </div>
            )}
          </div>
        </div>

        <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Decline edit request?</AlertDialogTitle>
              <AlertDialogDescription>
                The requester will see your comment. Briefly explain why.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Textarea
              value={declineComment}
              onChange={(e) => setDeclineComment(e.target.value)}
              placeholder="e.g. PO already received — open a new PO for the extra item."
              rows={3}
            />
            <AlertDialogFooter>
              <AlertDialogCancel disabled={review.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={review.isPending || !declineComment.trim()}
                onClick={() => {
                  review.mutate(
                    { requestId: request.id, decision: 'declined', comment: declineComment },
                    {
                      onSuccess: () => {
                        toast.success('Edit request declined')
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

  // status === 'approved' (unused)
  return (
    <div className="mx-4 my-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm">
      <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
        <Unlock className="h-3.5 w-3.5" />
        Edit unlocked · {relativeTime(request.reviewed_at ?? request.created_at)}
      </div>
      <p className="text-emerald-900 mt-1">
        Any team member can amend this PO. The first submission will close the window.
      </p>
    </div>
  )
}
