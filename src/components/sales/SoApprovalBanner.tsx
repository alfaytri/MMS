'use client'

import { AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useResubmitSaleOrder } from '@/hooks/useSaleOrders'
import { useSoApprovalRows, type SoApprovalRow } from '@/hooks/useSalesApprovals'

interface Props { soId: string; soStatus: string }

export function SoApprovalBanner({ soId, soStatus }: Props) {
  const { data: rows } = useSoApprovalRows(soId)
  const resubmit = useResubmitSaleOrder()

  if (!rows || rows.length === 0) return null

  // Most-recent iteration per chain
  const latest = (type: 'margin' | 'credit') => {
    const filtered = rows.filter((r) => r.approval_type === type)
    if (filtered.length === 0) return null
    const maxIter = Math.max(...filtered.map((r) => r.iteration))
    return filtered.filter((r) => r.iteration === maxIter)
  }
  const margin = latest('margin')
  const credit = latest('credit')

  function summary(group: SoApprovalRow[] | null, label: string) {
    if (!group) return null
    const rejected = group.find((r) => r.status === 'rejected')
    const allApproved = group.every((r) => r.status === 'approved')
    const active = group.find((r) => r.is_active && r.status === 'pending')
    if (rejected) return { label, tone: 'red' as const, text: `Rejected${rejected.decided_by_name ? ` by ${rejected.decided_by_name}` : ''}` }
    if (allApproved) return { label, tone: 'green' as const, text: 'Approved' }
    if (active) return { label, tone: 'amber' as const, text: `Pending — ${active.step_role}` }
    return null
  }

  const items = [summary(margin, 'Margin'), summary(credit, 'Credit')].filter(Boolean) as Array<NonNullable<ReturnType<typeof summary>>>

  if (items.length === 0) return null

  const anyRejected = Boolean(
    (margin && margin.some((r) => r.status === 'rejected')) ||
    (credit && credit.some((r) => r.status === 'rejected')),
  )

  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2">
      <div className="font-medium">Approval Status</div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <Badge
            key={it.label}
            variant="outline"
            className={
              it.tone === 'green' ? 'border-green-500/40 bg-green-500/10 text-green-700' :
              it.tone === 'red'   ? 'border-red-500/40 bg-red-500/10 text-red-700'     :
                                    'border-amber-500/40 bg-amber-500/10 text-amber-700'
            }
          >
            {it.tone === 'green' && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {it.tone === 'red'   && <XCircle className="h-3 w-3 mr-1" />}
            {it.tone === 'amber' && <AlertTriangle className="h-3 w-3 mr-1" />}
            {it.label}: {it.text}
          </Badge>
        ))}
      </div>
      {soStatus === 'quotation' && anyRejected && (
        <Button
          size="sm"
          variant="default"
          onClick={() => resubmit.mutate(soId, {
            onSuccess: () => toast.success('Resubmitted for approval'),
            onError:   (e: unknown) => toast.error(e instanceof Error ? e.message : 'Error'),
          })}
          disabled={resubmit.isPending}
        >
          {resubmit.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Resubmit for approval
        </Button>
      )}
    </div>
  )
}
