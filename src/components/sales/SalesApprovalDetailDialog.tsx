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
import { useSaleOrder } from '@/hooks/useSaleOrders'
import { ItemLabel } from '@/components/shared/ItemLabel'
import { useVariantItemMeta } from '@/hooks/useVariantCategoryPaths'

function fmtMoney(n: number, currency: string): string {
  return `${currency} ${Number(n).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props { slip: SalesApprovalSlip | null; onClose: () => void }

export function SalesApprovalDetailDialog({ slip, onClose }: Props) {
  const [comment, setComment] = useState('')
  const approve = useApproveSalesRequest()
  const reject  = useRejectSalesRequest()
  const { data: myRoles = [] } = useMyApprovalRoleNames()
  // Load the SO's lines so the approver sees WHAT is being ordered, not just a
  // total. Null id disables the query until a slip is open.
  const { data: fullSO } = useSaleOrder(slip?.so.id ?? null)
  // Resolve the app-wide item block (tree > brand > origin) once for all lines.
  const soLines = fullSO?.sale_order_lines ?? []
  const metaMap = useVariantItemMeta(
    soLines.map((li) => li.brand_variant_id).filter((id): id is string => !!id),
  )

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
      <DialogContent className="w-full max-w-full h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:max-w-2xl sm:rounded-lg flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>
            {slip.approval_type === 'margin' ? 'Margin Approval' : 'Credit Approval'} · {slip.so.so_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2 overflow-y-auto flex-1 sm:flex-initial">
          <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium text-right">{slip.so.customer_name}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{fmtMoney(slip.so.total, slip.so.currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Iteration</span>
              <Badge variant="outline">#{slip.iteration}</Badge>
            </div>
          </div>

          {/* Ordered items — so the approver sees WHAT is being ordered, not just a total. */}
          {soLines.length > 0 && (
            <div className="rounded-md border text-xs">
              <div className="border-b bg-muted/30 px-3 py-2 font-medium">Ordered items</div>
              <div className="divide-y">
                {soLines.map((li) => {
                  const meta = li.brand_variant_id ? metaMap.get(li.brand_variant_id) : null
                  const resolvedName = li.item_name?.trim() || meta?.name || null
                  return (
                    <div key={li.id} className="flex items-start justify-between gap-3 px-3 py-1.5">
                      <ItemLabel
                        meta={meta}
                        name={resolvedName ?? <span className="italic text-muted-foreground">Unnamed item</span>}
                        nameClassName="font-medium truncate"
                        className="min-w-0"
                      />
                      <div className="shrink-0 text-right">
                        <div className="font-medium tabular-nums">{fmtMoney(li.total, slip.so.currency)}</div>
                        <div className="text-muted-foreground tabular-nums">
                          {li.qty} × {fmtMoney(li.unit_price, slip.so.currency)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Trigger payload — margin / credit thresholds are stored + compared in QAR
              (credit-limit + avg_cost are QAR baseline), regardless of the SO's own currency. */}
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-xs space-y-1">
            {slip.approval_type === 'credit' ? (
              <>
                <div>Available credit: QAR {Number(payload.available ?? 0).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="font-medium text-amber-700">
                  Over limit by: QAR {Number(payload.overage ?? 0).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </>
            ) : (
              <>
                <div className="font-medium">Below-cost lines:</div>
                {(Array.isArray(payload.lines) ? payload.lines : []).map((l, i) => (
                  <div key={i} className="text-amber-700">
                    {l.item_name}: unit QAR {Number(l.unit_price).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} &lt; avg cost QAR {Number(l.avg_cost).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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

        <DialogFooter className="mx-0 mb-0 flex-col sm:flex-row gap-2 px-6 py-4 border-t shrink-0 bg-background rounded-b-lg">
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
