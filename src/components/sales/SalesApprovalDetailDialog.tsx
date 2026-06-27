'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  useApproveSalesRequest, useRejectSalesRequest, useMyApprovalRoleNames,
  type SalesApprovalSlip,
} from '@/hooks/useSalesApprovals'

interface Props { slip: SalesApprovalSlip | null; onClose: () => void }

export function SalesApprovalDetailDialog({ slip, onClose }: Props) {
  const [comment, setComment] = useState('')
  const approve = useApproveSalesRequest()
  const reject  = useRejectSalesRequest()
  const { data: myRoles = [] } = useMyApprovalRoleNames()

  if (!slip) return null

  // Parallel chains: every step is active; pick the row matching one of the
  // caller's roles. Fall back to the first pending row if none matches (the
  // caller is e.g. an Owner viewing a slip that's not assigned to them) — the
  // RPC's role check will reject the action server-side.
  const mySet = new Set(myRoles)
  const currentRow =
    slip.rows.find(
      (r) => r.status === 'pending' && r.step_role !== null && mySet.has(r.step_role),
    ) ?? slip.rows.find((r) => r.status === 'pending')
  // Reason was stored as the full JSON payload in sale_order_approvals.reason on slip creation
  const payload: { available?: number; overage?: number; lines?: Array<{ item_name?: string; unit_price?: number; avg_cost?: number }> } = (() => {
    try { return JSON.parse(currentRow?.reason ?? '{}') } catch { return {} }
  })()

  function handleApprove() {
    if (!currentRow) return
    approve.mutate({ id: currentRow.id, comment }, {
      onSuccess: () => { toast.success('Approved'); setComment(''); onClose() },
      onError:   (e: unknown) => toast.error(e instanceof Error ? e.message : 'Error'),
    })
  }

  function handleReject() {
    if (!currentRow) return
    if (!comment.trim()) { toast.error('Reason is required to reject'); return }
    reject.mutate({ id: currentRow.id, reason: comment }, {
      onSuccess: () => { toast.success('Rejected — SO returned to salesperson'); setComment(''); onClose() },
      onError:   (e: unknown) => toast.error(e instanceof Error ? e.message : 'Error'),
    })
  }

  return (
    <Dialog open={!!slip} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {slip.approval_type === 'margin' ? 'Margin Approval' : 'Credit Approval'} · {slip.so.so_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{slip.so.customer_name}</span>
              <Badge variant="outline">Iteration #{slip.iteration}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Total: {slip.so.total.toLocaleString()}
            </div>
          </div>

          {/* Trigger payload */}
          <div className="rounded-md border-l-4 border-amber-500 bg-amber-500/5 p-3 text-xs space-y-1">
            {slip.approval_type === 'credit' ? (
              <>
                <div>Available credit: {Number(payload.available ?? 0).toLocaleString()}</div>
                <div className="font-medium text-amber-700">
                  Over limit by: {Number(payload.overage ?? 0).toLocaleString()}
                </div>
              </>
            ) : (
              <>
                <div className="font-medium">Below-cost lines:</div>
                {(Array.isArray(payload.lines) ? payload.lines : []).map((l, i) => (
                  <div key={i} className="text-amber-700">
                    {l.item_name}: unit {Number(l.unit_price).toLocaleString()} &lt; avg cost {Number(l.avg_cost).toLocaleString()}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Timeline */}
          <div className="text-xs space-y-1">
            <div className="font-medium">Chain</div>
            {[...slip.rows].sort((a, b) => a.step_order - b.step_order).map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <span className={
                  row.status === 'approved' ? 'text-green-600' :
                  row.status === 'rejected' ? 'text-red-600' :
                  row.is_active ? 'text-amber-600' :
                  'text-muted-foreground'
                }>
                  {row.status === 'approved' ? '✓' : row.status === 'rejected' ? '✕' : row.is_active ? '●' : '○'}
                </span>
                <span>Step {row.step_order} — {row.step_role}</span>
                {row.decided_by_name && <span className="text-muted-foreground">· {row.decided_by_name}</span>}
              </div>
            ))}
          </div>

          <div>
            <Textarea
              placeholder="Add a comment (required for reject)…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="destructive" onClick={handleReject} disabled={reject.isPending}>
            <XCircle className="h-4 w-4 mr-1" /> Reject
          </Button>
          <Button onClick={handleApprove} disabled={approve.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
