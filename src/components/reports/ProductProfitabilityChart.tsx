'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/formatters'
import type { ProductProfitabilityRow } from '@/hooks/useProductProfitability'

type Props = { rows: ProductProfitabilityRow[] }

export function ProductProfitabilityChart({ rows }: Props) {
  const top = [...rows]
    .filter((r) => r.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)

  const max = Math.max(...top.map((r) => r.profit), 1)

  const [grown, setGrown] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 60)
    return () => clearTimeout(t)
  }, [])

  if (top.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground italic">
        No profit-positive products in this range
      </div>
    )
  }

  return (
    <div className="space-y-2 2xl:space-y-3">
      {top.map((r, i) => {
        const pct = (r.profit / max) * 100
        return (
          <div key={r.brand_variant_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="text-sm 2xl:text-base font-medium truncate" title={r.name}>
                {r.name}
              </div>
              <div className="h-2 2xl:h-3 mt-1 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-[width] ease-out',
                  )}
                  style={{
                    width: grown ? `${pct}%` : '0%',
                    transitionDuration: '700ms',
                    transitionDelay: `${i * 60}ms`,
                  }}
                />
              </div>
            </div>
            <div className="text-right text-sm 2xl:text-base font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
              {formatCurrency(r.profit, 'QAR')}
            </div>
          </div>
        )
      })}
    </div>
  )
}
