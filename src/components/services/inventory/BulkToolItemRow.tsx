'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToolAssetItemEditDialog } from './ToolAssetEditDialog'
import { useInventoryBrandVariants, type InventoryItem } from '@/hooks/useInventory'
import { useVariantStockByDivision } from '@/hooks/useVariantStockByDivision'

type Props = {
  item: InventoryItem
  depth: number
}

/**
 * Qty-tracked row for a tool/asset item whose category has
 * `tool_tracking_mode = 'bulk'` — a single fixed-height row (no expand
 * affordance, no serialized ToolUnitRows sub-table). Summarizes the item's
 * brand variants (count) and division-scoped on-hand qty, the same two data
 * sources ItemRow/CascadeInventorySelector already use for qty-tracked
 * catalogs, so a bulk tool reads like a bulk product row rather than a
 * serialized asset row.
 *
 * On-hand comes from `useVariantStockByDivision` (division/RLS-scoped),
 * not the denormalized `stock_level` column on the variant, so the total
 * never exceeds what the caller's division scope can actually see.
 */
export function BulkToolItemRow({ item, depth }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const { data: variants = [] } = useInventoryBrandVariants(item.id)
  const { data: stockByVariant } = useVariantStockByDivision(item.id)

  const variantCount = variants.length
  const totalOnHand = variants.reduce((sum, v) => {
    const pools = stockByVariant?.get(v.id) ?? []
    const poolTotal = pools.reduce((s, p) => s + Math.max(0, p.qty - p.reserved), 0)
    return sum + poolTotal
  }, 0)

  const indent = 12 + (depth + 1) * 20

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20">
        <td className="py-2.5 pr-2" style={{ paddingLeft: indent }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{item.name_en}</span>
            {item.name_ar && (
              <span className="text-[10px] text-muted-foreground truncate flex-shrink-0" dir="rtl">{item.name_ar}</span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">
          <span className="truncate block max-w-full">
            {variantCount === 0
              ? 'No variants yet'
              : `${variantCount} variant${variantCount === 1 ? '' : 's'} · ${totalOnHand.toLocaleString()} on hand`}
          </span>
        </td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit tool/asset"
              className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0"
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
      <ToolAssetItemEditDialog open={editOpen} onOpenChange={setEditOpen} item={item} />
    </>
  )
}
