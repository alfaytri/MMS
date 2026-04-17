import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { POApprovalStep } from '@/hooks/usePurchaseOrders'

const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'PM',
  accountant: 'AC',
  owner: 'OW',
}

export function PoApprovalChain({ steps }: { steps: POApprovalStep[] }) {
  if (!steps || steps.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-1">
          {idx > 0 && <div className="h-px w-3 bg-muted-foreground/30" />}
          <div
            title={`${step.role}: ${step.status}`}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold',
              step.status === 'approved' && 'border-success bg-success/10 text-success',
              step.status === 'rejected' && 'border-destructive bg-destructive/10 text-destructive',
              step.status === 'pending' && 'border-muted-foreground/40 bg-muted text-muted-foreground',
            )}
          >
            {step.status === 'approved' ? <Check className="h-3 w-3" /> :
             step.status === 'rejected' ? <X className="h-3 w-3" /> :
             <span>{ROLE_LABELS[step.role] ?? '?'}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
