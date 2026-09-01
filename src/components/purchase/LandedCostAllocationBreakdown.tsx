'use client'

import { Package, TrendingDown } from 'lucide-react'
import { useFifoLayers } from '@/hooks/useInventory'
import { useHasPermission } from '@/hooks/usePermissions'
import { formatCurrency } from '@/lib/utils/formatters'
import type { LandedCostItemAllocation } from '@/hooks/useLandedCosts'

/**
 * Shows how a landed cost split for one item once applied:
 *  - the units still in stock, which absorbed the cost onto their FIFO layers
 *    (itemised by location so transfers to other warehouses/sub-containers are
 *    visible as their own line), and
 *  - the units already sold before the cost was recorded, whose share posted to
 *    COGS as a retroactive cost adjustment (past invoices are not changed).
 * The two portions sum to the item's total allocated landed cost.
 */
export function LandedCostAllocationBreakdown({
  alloc,
  currency,
  receivalIds,
}: {
  alloc: LandedCostItemAllocation
  currency: string
  receivalIds: string[]
}) {
  const canSeePricing = useHasPermission('inventory.pricing.view')
  const { data: layers = [] } = useFifoLayers(
    alloc.brand_variant_id ?? '',
    canSeePricing && !!alloc.brand_variant_id,
  )

  // Layers from THIS landed cost's receivals that still hold stock — where the
  // capitalised portion landed. Transfers appear as their own location rows.
  const stockLayers = layers
    .filter((l) => l.receival_id && receivalIds.includes(l.receival_id) && l.remaining_qty > 0)
    .sort((a, b) => (b.remaining_qty ?? 0) - (a.remaining_qty ?? 0))

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3 text-xs">
      {/* Kept in stock — capitalised onto inventory */}
      <div>
        <div className="flex items-center gap-1.5 font-medium">
          <Package className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          Kept in stock — {alloc.qty_remaining_at_lc} unit{alloc.qty_remaining_at_lc === 1 ? '' : 's'}
          <span className="ml-auto font-semibold text-blue-700">
            +{formatCurrency(alloc.inventory_portion, currency)}
          </span>
        </div>
        <p className="mt-0.5 text-muted-foreground">
          Capitalised onto the FIFO layers at +{formatCurrency(alloc.lc_per_unit, currency)}/unit.
        </p>
        {stockLayers.length > 0 && (
          <div className="mt-1.5 space-y-0.5 border-l-2 border-blue-200 pl-2.5 dark:border-blue-900/50">
            {stockLayers.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <span className="min-w-0 truncate text-muted-foreground">
                  {l.remaining_qty} @ {l.warehouse_name ?? '—'}
                  {l.sub_container_name ? ` · ${l.sub_container_name}` : ''}
                  {l.source_type === 'transfer' && (
                    <span className="ml-1 text-blue-600">(transferred)</span>
                  )}
                </span>
                <span className="ml-auto shrink-0 text-blue-700">
                  +{formatCurrency(l.remaining_qty * alloc.lc_per_unit, currency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Already sold — posted to COGS */}
      {alloc.sold_qty > 0 ? (
        <div className="border-t pt-2">
          <div className="flex items-center gap-1.5 font-medium">
            <TrendingDown className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            Already sold — {alloc.sold_qty} unit{alloc.sold_qty === 1 ? '' : 's'}
            <span className="ml-auto font-semibold text-amber-700">
              +{formatCurrency(alloc.cogs_portion, currency)}
            </span>
          </div>
          <p className="mt-0.5 text-muted-foreground">
            Posted to COGS as a retroactive cost adjustment — past invoices are unchanged.
          </p>
        </div>
      ) : (
        <p className="border-t pt-2 text-muted-foreground">
          Nothing sold before this cost — the whole amount was capitalised into stock.
        </p>
      )}
    </div>
  )
}
