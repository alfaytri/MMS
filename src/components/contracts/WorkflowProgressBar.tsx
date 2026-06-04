'use client'

import { cn } from '@/lib/utils'
import type { ContractStatus } from '@/types/contracts'

interface WorkflowStep {
  key: string
  label: string
  statuses: ContractStatus[]
}

const STEPS: WorkflowStep[] = [
  { key: 'draft',    label: 'Draft',          statuses: ['draft'] },
  { key: 'review',   label: 'Manager Review', statuses: ['manager_review'] },
  { key: 'customer', label: 'Customer',       statuses: ['customer_pending'] },
  { key: 'approved', label: 'Approved',       statuses: ['approved'] },
]

interface Props {
  currentStatus: ContractStatus
}

export function WorkflowProgressBar({ currentStatus }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.statuses.includes(currentStatus))
  const isRejected = currentStatus === 'rejected'

  if (isRejected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Rejected
      </span>
    )
  }

  return (
    <div className="flex items-center">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const isLast = idx === STEPS.length - 1

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  isCompleted && 'bg-foreground',
                  isCurrent && 'bg-primary ring-2 ring-primary/20',
                  !isCompleted && !isCurrent && 'bg-muted-foreground/30',
                )}
              />
              <span
                className={cn(
                  'text-xs transition-colors',
                  isCurrent && 'font-medium text-foreground',
                  isCompleted && 'text-foreground/70',
                  !isCompleted && !isCurrent && 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <span
                className={cn(
                  'mx-2 h-px w-6 transition-colors',
                  isCompleted ? 'bg-foreground/40' : 'bg-muted-foreground/20',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
