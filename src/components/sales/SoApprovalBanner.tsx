'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useResubmitSaleOrder } from '@/hooks/useSaleOrders'

type Row = {
  id: string; approval_type: 'margin' | 'credit'; status: string;
  step_role: string | null; step_order: number; is_active: boolean;
  iteration: number; decided_by_name: string | null; created_at: string;
}

interface Props { soId: string; soStatus: string }

export function SoApprovalBanner({ soId, soStatus }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const resubmit = useResubmitSaleOrder()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('approval_requests')
        .select('id, approval_type, status, step_role, step_order, is_active, iteration, decided_by_name, created_at')
        .eq('source_type', 'sale_order')
        .eq('source_id', soId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (!cancelled) setRows((data as unknown as Row[]) ?? [])
    })()
    return () => { cancelled = true }
  }, [soId])

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

  function summary(group: Row[] | null, label: string) {
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

  const allRejected =
    (margin && margin.find((r) => r.status === 'rejected')) ||
    (credit && credit.find((r) => r.status === 'rejected'))

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
      {soStatus === 'quotation' && allRejected && (
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
