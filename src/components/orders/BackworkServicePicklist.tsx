'use client'

import { Checkbox } from '@/components/ui/checkbox'
import type { ParentOrderForFollowUp } from '@/hooks/useParentOrderForFollowUp'

type Props = {
  services: ParentOrderForFollowUp['services']
  selectedIds: Set<string>
  onToggle: (parentServiceId: string, checked: boolean) => void
}

// Checklist of the completed parent order's services. Ticked ones are the
// backwork (0 QAR); untick to drop. Extra work is added via the normal picker.
export function BackworkServicePicklist({ services, selectedIds, onToggle }: Props) {
  if (services.length === 0) {
    return <p className="text-xs text-muted-foreground">This order has no services to redo.</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Tick the service(s) that need a backwork (redo — no charge):
      </p>
      {services.map((s) => (
        <label key={s.id} className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
          <Checkbox
            checked={selectedIds.has(s.id)}
            onCheckedChange={(v) => onToggle(s.id, v === true)}
          />
          <span className="flex flex-col leading-tight">
            <span className="font-medium">{s.qty > 1 ? `${s.qty}× ` : ''}{s.name}</span>
            {s.path.length > 0 && <span className="text-[11px] text-muted-foreground">{s.path.join(' › ')}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}
