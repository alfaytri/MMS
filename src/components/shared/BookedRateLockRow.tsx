'use client'

import { Lock } from 'lucide-react'

export function BookedRateLockRow({
  currency,
  initialRate,
}: {
  currency: string
  initialRate: number
  /** @deprecated Edit affordance removed — booked rate is now immutable once
   * captured. Prop kept for call-site compatibility. */
  onEditClick?: () => void
  /** @deprecated see onEditClick */
  disabled?: boolean
}) {
  if (currency === 'QAR') return null
  return (
    <div className="flex items-center gap-3 min-h-9">
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
        Booked Rate{' '}
        <span className="normal-case text-muted-foreground/70">
          (1 {currency} = ? QAR)
        </span>
      </label>
      <div className="h-8 px-3 flex items-center gap-2 rounded-md border bg-muted/30 text-sm font-semibold min-w-[120px] tabular-nums">
        <Lock className="h-3 w-3 text-muted-foreground" />
        {initialRate.toLocaleString('en-QA', {
          minimumFractionDigits: 4,
          maximumFractionDigits: 4,
        })}
      </div>
    </div>
  )
}
