import { Check, X, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { POApprovalStep } from '@/hooks/usePurchaseOrders'

const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'PM',
  accountant: 'AC',
  owner: 'OW',
}

export function PoApprovalChain({ steps, showIteration }: { steps: POApprovalStep[]; showIteration?: number }) {
  if (!steps || steps.length === 0) return null

  const iteration = showIteration ?? Math.max(...steps.map((s) => s.iteration ?? 1))
  const iterationSteps = steps.filter((s) => (s.iteration ?? 1) === iteration)

  // Group by tier_rank
  const tiers = [...new Set(iterationSteps.map((s) => s.tier_rank ?? 1))].sort((a, b) => a - b)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {tiers.map((rank, ti) => {
        const tierSteps = iterationSteps.filter((s) => (s.tier_rank ?? 1) === rank)
        return (
          <div key={rank} className="flex items-center gap-1">
            {ti > 0 && <div className="h-px w-4 bg-muted-foreground/30" />}
            {tierSteps.map((step, idx) => (
              <div key={step.id} className="flex items-center gap-0.5">
                {idx > 0 && <div className="h-px w-1.5 bg-muted-foreground/20" />}
                <div
                  title={`${step.role}: ${step.status}${step.force_approved ? ' (force-approved)' : ''}`}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold relative',
                    step.status === 'approved' && 'border-success bg-success/10 text-success',
                    step.status === 'rejected' && 'border-destructive bg-destructive/10 text-destructive',
                    step.status === 'cancelled' && 'border-muted-foreground/20 bg-muted/50 text-muted-foreground/40',
                    step.status === 'pending' && step.is_active && 'border-primary/40 bg-primary/5 text-primary animate-pulse',
                    step.status === 'pending' && !step.is_active && 'border-muted-foreground/20 bg-muted text-muted-foreground/50',
                  )}
                >
                  {step.status === 'approved' ? (
                    <Check className="h-3 w-3" />
                  ) : step.status === 'rejected' ? (
                    <X className="h-3 w-3" />
                  ) : (
                    <span>{ROLE_LABELS[step.role] ?? '?'}</span>
                  )}
                  {step.force_approved && (
                    <span className="absolute -top-1 -right-1">
                      <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
