'use client'

import { useFifoLayers } from '@/hooks/useInventory'
import { useHasPermission } from '@/hooks/usePermissions'
import { formatCurrency } from '@/lib/utils/formatters'

/**
 * A table sub-row that shows WHERE an item's remaining stock currently sits
 * across FIFO layers (scoped to the given receival(s)) — so stock that was split
 * by a transfer (e.g. 203 kept in Maintenance + 47 moved to Kitchen) reads as its
 * split instead of one opaque total. When `lcPerUnit` is given, each location
 * also shows the landed-cost value it will receive (remaining × lcPerUnit).
 * Renders nothing when the stock is all in one place. Drop it right after the
 * item's <tr> inside a <tbody>.
 */
export function ReceivalStockSplitRow({
  brandVariantId,
  receivalIds,
  colSpan,
  lcPerUnit,
  currency,
}: {
  brandVariantId: string | null
  receivalIds: string[]
  colSpan: number
  lcPerUnit?: number
  currency?: string
}) {
  const canSeePricing = useHasPermission('inventory.pricing.view')
  const { data: layers = [] } = useFifoLayers(
    brandVariantId ?? '',
    canSeePricing && !!brandVariantId,
  )
  const stockLayers = layers
    .filter((l) => l.receival_id && receivalIds.includes(l.receival_id) && l.remaining_qty > 0)
    .sort((a, b) => (b.remaining_qty ?? 0) - (a.remaining_qty ?? 0))

  // Only worth showing when the stock is actually in more than one place.
  if (stockLayers.length <= 1) return null

  return (
    <tr>
      <td colSpan={colSpan} className="pb-1.5">
        <div className="ml-1 flex flex-wrap gap-x-4 gap-y-0.5 border-l-2 border-border pl-2.5 text-[10px] text-muted-foreground">
          {stockLayers.map((l) => (
            <span key={l.id} className="whitespace-nowrap tabular-nums">
              <span className="font-semibold text-foreground">{l.remaining_qty}</span>
              {' @ '}
              {l.warehouse_name ?? '—'}
              {l.sub_container_name ? ` · ${l.sub_container_name}` : ''}
              {l.source_type === 'transfer' && <span className="ml-1 text-blue-600">(transferred)</span>}
              {lcPerUnit != null && currency && (
                <span className="ml-1 font-medium text-blue-700">
                  +{formatCurrency(l.remaining_qty * lcPerUnit, currency)}
                </span>
              )}
            </span>
          ))}
        </div>
      </td>
    </tr>
  )
}
