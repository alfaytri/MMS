'use client'

import { CheckCircle, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContractStatus } from '@/types/contracts'

interface WorkflowStep {
  key: string
  label: string
  statuses: ContractStatus[]
}

const STEPS: WorkflowStep[] = [
  { key: 'draft', label: 'Draft', statuses: ['draft'] },
  { key: 'review', label: 'Manager Review', statuses: ['manager_review'] },
  { key: 'customer', label: 'Customer', statuses: ['customer_pending'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
]

interface Props {
  currentStatus: ContractStatus
}

export function WorkflowProgressBar({ currentStatus }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.statuses.includes(currentStatus))
  const isRejected = currentStatus === 'rejected'

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx
        const isFuture = idx > currentIdx

        if (isRejected && idx === currentIdx) {
          return (
            <span
              key={step.key}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700"
            >
              Rejected
            </span>
          )
        }

        return (
          <div key={step.key} className="flex items-center gap-1">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
                isCompleted && 'bg-green-100 text-green-700',
                isCurrent && 'bg-primary text-primary-foreground',
                isFuture && 'bg-muted text-muted-foreground',
              )}
            >
              {isCompleted ? (
                <CheckCircle className="h-3 w-3" />
              ) : (
                <Circle className="h-3 w-3" />
              )}
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <span className="text-muted-foreground text-xs">&rarr;</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
