'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle2, ShieldCheck, Zap, Loader2 } from 'lucide-react'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/formatters'
import {
  useOrderApprovals, useApproveOrder, useRejectOrder, type OrderApproval,
} from '@/hooks/useOrderApprovals'

export default function OrderApprovalsPage() {
  const { data: approvals = [], isLoading } = useOrderApprovals()
  const approve = useApproveOrder()
  const reject = useRejectOrder()
  const [rejectTarget, setRejectTarget] = useState<OrderApproval | null>(null)
  const [reason, setReason] = useState('')

  async function handleApprove(a: OrderApproval) {
    try {
      await approve.mutateAsync({ approvalId: a.approval_id })
      toast.success(`${a.order_id} approved — order booked`)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to approve')
    }
  }

  async function handleReject() {
    if (!rejectTarget) return
    if (!reason.trim()) { toast.error('Enter a reason'); return }
    try {
      await reject.mutateAsync({ approvalId: rejectTarget.approval_id, reason: reason.trim() })
      toast.success(`${rejectTarget.order_id} rejected — order cancelled`)
      setRejectTarget(null)
      setReason('')
    } catch (e) {
      toast.error((e as Error).message || 'Failed to reject')
    }
  }

  return (
    <PageWrapper>
      <div>
        <h1 className="text-2xl 2xl:text-3xl font-bold">Service Order Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Orders held for approval because the customer is in a high-risk payment tier.
          Approve to book the order, or reject to cancel it and free the slot.
        </p>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : approvals.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No orders awaiting approval</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {approvals.map((a) => (
            <Card key={a.approval_id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-semibold">{a.order_id}</p>
                    {a.is_emergency && (
                      <Badge className="gap-1 bg-red-500 text-white text-xs"><Zap className="h-3 w-3" /> Emergency</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{a.customer_name ?? 'Unknown customer'}</p>
                </div>
                <p className="shrink-0 text-lg font-bold">{formatCurrency(a.total_amount, 'QAR')}</p>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Requested {format(new Date(a.created_at), 'dd MMM yyyy')}</span>
                <span>· Visit {format(new Date(a.scheduled_date), 'dd MMM yyyy')}</span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {a.step_role ?? 'Any approver (orders.approve)'}
                </span>
              </div>

              <div className="flex gap-2 pt-1 border-t">
                <Button
                  className="flex-1 gap-1.5"
                  onClick={() => handleApprove(a)}
                  disabled={approve.isPending}
                >
                  {approve.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Approve &amp; book
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                  onClick={() => { setRejectTarget(a); setReason('') }}
                >
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(v) => { if (!v) setRejectTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {rejectTarget?.order_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              This cancels the order and frees its team slot. Give a reason:
            </p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer must clear outstanding dues first"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleReject}
              disabled={reject.isPending || !reason.trim()}
            >
              {reject.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Reject &amp; cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}
