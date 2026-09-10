// src/components/team-leader/shared/ServiceStatusList.tsx
'use client'

import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { PhotoCapture } from './PhotoCapture'
import type { TlService } from '@/types/team-leader'

type Status = 'done' | 'skipped' | 'issue'
export type ServiceDetail = { reason?: string; photos?: Blob[] }

interface Props {
  services: TlService[]
  statuses: Record<string, Status>
  onChange: (serviceId: string, status: Status) => void
  /**
   * Per-service reason (skipped) / photos (issue) enforcement. It renders the
   * required inputs only when BOTH `visitId` and `onDetailChange` are provided;
   * completion dialogs that don't opt in (contract / site-visit / …) omit them
   * and get the plain status buttons, unchanged.
   */
  visitId?: string
  details?: Record<string, ServiceDetail>
  onDetailChange?: (serviceId: string, patch: ServiceDetail) => void
}

const OPTIONS: { value: Status; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'done',    label: 'Done',    icon: CheckCircle2, color: 'text-success' },
  { value: 'skipped', label: 'Skipped', icon: XCircle,      color: 'text-muted-foreground' },
  { value: 'issue',   label: 'Issue',   icon: AlertCircle,  color: 'text-destructive' },
]

export function ServiceStatusList({ services, statuses, onChange, visitId, details = {}, onDetailChange }: Props) {
  return (
    <div className="space-y-3">
      {services.map((svc) => {
        const current = statuses[svc.id] ?? 'done'
        const detail = details[svc.id] ?? {}
        const reasonMissing = current === 'skipped' && !(detail.reason ?? '').trim()
        const photoMissing  = current === 'issue'   && (detail.photos?.length ?? 0) === 0
        return (
          <div key={svc.id} className="space-y-1.5">
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

            {/* Skipped → required reason */}
            {onDetailChange && current === 'skipped' && (
              <div className="pt-0.5">
                <Textarea
                  placeholder="Why was this service skipped? (required)"
                  value={detail.reason ?? ''}
                  onChange={(e) => onDetailChange(svc.id, { reason: e.target.value })}
                  rows={2}
                  className={cn('text-sm', reasonMissing && 'border-destructive focus-visible:ring-destructive')}
                />
                {reasonMissing && (
                  <p className="text-[11px] text-destructive mt-1">A reason is required to skip this service.</p>
                )}
              </div>
            )}

            {/* Issue → required photo */}
            {onDetailChange && visitId && current === 'issue' && (
              <div className={cn('pt-0.5 rounded-md', photoMissing && 'ring-1 ring-destructive p-2')}>
                <PhotoCapture
                  visitId={`${visitId}-issue-${svc.id}`}
                  label="Issue Photos"
                  photos={detail.photos ?? []}
                  onChange={(photos) => onDetailChange(svc.id, { photos })}
                  maxPhotos={5}
                />
                {photoMissing && (
                  <p className="text-[11px] text-destructive mt-1">At least one photo is required to log an issue.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
