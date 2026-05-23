// src/components/team-leader/shared/ServiceStatusList.tsx
'use client'

import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import type { TlService } from '@/types/team-leader'

type Status = 'done' | 'skipped' | 'issue'

interface Props {
  services: TlService[]
  statuses: Record<string, Status>
  onChange: (serviceId: string, status: Status) => void
}

const OPTIONS: { value: Status; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'done',    label: 'Done',    icon: CheckCircle2, color: 'text-green-600' },
  { value: 'skipped', label: 'Skipped', icon: XCircle,      color: 'text-muted-foreground' },
  { value: 'issue',   label: 'Issue',   icon: AlertCircle,  color: 'text-destructive' },
]

export function ServiceStatusList({ services, statuses, onChange }: Props) {
  return (
    <div className="space-y-3">
      {services.map((svc) => {
        const current = statuses[svc.id] ?? 'done'
        return (
          <div key={svc.id} className="space-y-1">
            <p className="text-sm font-medium">{svc.name}</p>
            <div className="flex gap-2">
              {OPTIONS.map((opt) => {
                const Icon = opt.icon
                const active = current === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChange(svc.id, opt.value)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 min-h-11 rounded-md border text-xs font-medium transition-colors',
                      active
                        ? cn('border-current bg-current/10', opt.color)
                        : 'border-border text-muted-foreground hover:border-current hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
