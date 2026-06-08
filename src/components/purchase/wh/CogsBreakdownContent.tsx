'use client'

import { useCogsBreakdown } from '@/hooks/useCogsBreakdown'
import { formatCurrency } from '@/lib/utils/formatters'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'

type Props = {
  variantId: string
  enabled: boolean
  onSelectLc: (lcId: string) => void
}

export function CogsBreakdownContent({ variantId, enabled, onSelectLc }: Props) {
  const { data, isLoading, error } = useCogsBreakdown(variantId, enabled)

  if (isLoading) {
    return (
      <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading breakdown…
      </div>
    )
  }

  if (error || !data) {
    return <div className="p-3 text-xs text-destructive">Failed to load breakdown.</div>
  }

  return (
    <div className="min-w-[220px]">
      <div className="px-3 py-2 border-b">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          COGS Breakdown
        </p>
      </div>
      <div className="px-3 py-2 space-y-1.5 text-xs">
        <div className="flex items-center justify-between gap-6">
          <span className="text-muted-foreground">Sold (at sale)</span>
          <span className="font-semibold tabular-nums">QR {formatCurrency(data.sold_at_sale)}</span>
        </div>

        {data.lc_adjustments.length > 0 && (
          <div className="pt-1 mt-1 border-t">
            <p className="text-muted-foreground mb-1">LC adjustments:</p>
            <ul className="space-y-0.5">
              {data.lc_adjustments.map((adj) => (
                <li key={adj.lc_id} className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onSelectLc(adj.lc_id)}
                    className="text-left text-primary hover:underline cursor-pointer"
                  >
                    {adj.lc_number}
                    {adj.applied_at && (
                      <span className="text-muted-foreground font-normal">
                        {' '}({format(new Date(adj.applied_at), 'd MMM yy')})
                      </span>
                    )}
                  </button>
                  <span className="font-semibold tabular-nums">
                    {adj.total_cost >= 0 ? '+' : ''}{formatCurrency(adj.total_cost)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center justify-between gap-6 pt-1 mt-1 border-t">
          <span className="text-muted-foreground">Total</span>
          <span className="font-semibold tabular-nums">QR {formatCurrency(data.total)}</span>
        </div>
      </div>
    </div>
  )
}
