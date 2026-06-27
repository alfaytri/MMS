/**
 * Compact credit utilization bar — used in the customer list and on the
 * SO-create page. Renders nothing for cash customers (limit = 0); otherwise
 * shows a thin horizontal bar with the percentage and the QAR amount the
 * customer still has available beneath it (what the salesperson actually
 * cares about). Hover the row for the full used/limit breakdown.
 */

import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'

interface Props {
  used:    number
  limit:   number
  pct:     number | null
  compact?: boolean
}

export function CreditUtilizationBar({ used, limit, pct, compact = false }: Props) {
  if (!limit || limit <= 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const safePct    = pct ?? Math.min(100, Math.round((used / limit) * 100))
  const available  = Math.max(0, limit - used)
  const toneBar    =
    safePct >= 90 ? 'bg-destructive'   :
    safePct >= 70 ? 'bg-amber-500'     :
                    'bg-emerald-500'
  const toneText   =
    safePct >= 90 ? 'text-destructive' :
    safePct >= 70 ? 'text-amber-700'   :
                    'text-emerald-700'

  const tooltip = `Used ${formatCurrency(used, 'QAR')} of ${formatCurrency(limit, 'QAR')}`

  return (
    <div
      className={cn('flex flex-col gap-1', compact ? 'w-40' : 'w-48')}
      title={tooltip}
    >
      <div className="flex items-center gap-2">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full transition-all', toneBar)}
            style={{ width: `${Math.max(2, safePct)}%` }}
          />
        </div>
        <span className={cn('text-[10px] font-medium tabular-nums shrink-0', toneText)}>
          {safePct}%
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground tabular-nums leading-none">
        <span className="font-medium text-foreground">{formatCurrency(available, 'QAR')}</span>{' '}
        available
      </div>
    </div>
  )
}
