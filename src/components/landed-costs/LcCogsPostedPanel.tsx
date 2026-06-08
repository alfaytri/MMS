'use client'

import { formatCurrency } from '@/lib/utils/formatters'

type Allocation = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty_received: number
  qty_remaining_at_lc: number
  sold_qty?: number
  per_unit_lc: number
  inventory_portion: number
  cogs_portion: number
}

type Props = {
  allocations: Allocation[] | null | undefined
  currency: string
  appliedAt: string | null
}

export function LcCogsPostedPanel({ allocations, currency, appliedAt }: Props) {
  if (!appliedAt || !allocations) return null

  const cogsRows = allocations.filter((a) => (a.cogs_portion ?? 0) > 0)
  if (cogsRows.length === 0) return null

  const totalCogs = cogsRows.reduce((sum, a) => sum + a.cogs_portion, 0)
  const totalInv = allocations.reduce((sum, a) => sum + (a.inventory_portion ?? 0), 0)

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">COGS Posted (post-sale LC adjustments)</h3>
      <div className="rounded-md border p-3 space-y-2 text-sm">
        <ul className="space-y-1">
          {cogsRows.map((a) => (
            <li key={a.brand_variant_id} className="flex items-center justify-between gap-4">
              <span>
                {a.item_name}
                {a.sku && <span className="text-muted-foreground font-mono"> ({a.sku})</span>}
                <span className="text-muted-foreground">
                  {' '}&mdash; {a.sold_qty ?? '?'} sold {(a.sold_qty ?? 0) === 1 ? 'unit' : 'units'}
                  {' '}&times; {formatCurrency(a.per_unit_lc, currency)}
                </span>
              </span>
              <span className="font-semibold tabular-nums">{formatCurrency(a.cogs_portion, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between pt-2 mt-2 border-t font-semibold">
          <span>Total posted to COGS</span>
          <span className="tabular-nums">{formatCurrency(totalCogs, currency)}</span>
        </div>
        <div className="text-xs text-muted-foreground pt-1">
          Inventory side: {formatCurrency(totalInv, currency)} added to FIFO layers
        </div>
      </div>
    </div>
  )
}
