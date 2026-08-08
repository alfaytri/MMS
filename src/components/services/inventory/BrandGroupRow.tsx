'use client'

import { useState } from 'react'
import { Plus, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { OriginVariantRow, type OriginVariant } from './OriginVariantRow'
import { BrandVariantEditDialog } from './BrandVariantEditDialog'
import { useUpdateSortOrders } from '@/hooks/useInventory'
import type { BrandGroup } from '@/lib/inventory/groupVariants'

type Props = {
  group: BrandGroup
  itemId: string
  itemName: string
}

export function BrandGroupRow({ group, itemId, itemName }: Props) {
  const [addOriginOpen, setAddOriginOpen] = useState(false)
  const updateOriginOrder = useUpdateSortOrders('inventory_item_brand_variants')

  function handleMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = group.origins[idx]
    const b = group.origins[targetIdx]
    if (!a || !b) return
    const aSort = typeof a.sort_order === 'number' ? a.sort_order : idx
    const bSort = typeof b.sort_order === 'number' ? b.sort_order : targetIdx
    updateOriginOrder.mutate([
      { id: String(a.id), sort_order: aSort },
      { id: String(b.id), sort_order: bSort },
    ])
  }

  const isUnbranded = group.brandKey === '__nobrand__'
  const fixedBrand = { id: isUnbranded ? null : group.brandKey, name: group.brandLabel }

  return (
    <>
      {/*
        Per-column structure deliberately mirrors OriginVariantRow's 8 cells
        (ORIGIN, CODE, AVG COST, SELLING PRICE, RESERVED, AVAILABLE,
        INCOMING, ACTIONS) 1:1, including the exact same responsive
        `hidden sm:/md:table-cell` classes on the same column indexes. A
        single wide colSpan cell would span a FIXED column count regardless
        of which columns are actually hidden at the current breakpoint, so
        the "+ Add origin" button would drift out from under the ACTIONS
        column on mobile/tablet. Rendering one real (possibly empty) <td>
        per column — collapsing identically to the data rows below it — is
        what keeps the button pinned to ACTIONS at every breakpoint.
      */}
      <TableRow className="min-h-11 bg-muted/40 hover:bg-muted/40 border-t border-border">
        <TableCell className="py-1.5 pl-2">
          <div className="flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-medium truncate">{group.brandLabel}</span>
          </div>
        </TableCell>
        <TableCell className="hidden sm:table-cell" />
        <TableCell className="text-right hidden md:table-cell" />
        <TableCell className="text-right" />
        <TableCell className="text-right" />
        <TableCell className="text-right" />
        <TableCell className="text-right hidden sm:table-cell" />
        <TableCell className="text-right py-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 min-h-11 md:min-h-7 px-2 text-[11px] text-blue-600 hover:text-blue-700"
            onClick={() => setAddOriginOpen(true)}
            aria-label={`Add origin for ${group.brandLabel}`}
          >
            <Plus className="h-3 w-3 mr-1" /> Add origin
          </Button>
        </TableCell>
      </TableRow>

      {group.origins.map((origin, idx) => (
        <OriginVariantRow
          key={String(origin.id)}
          variant={origin as unknown as OriginVariant}
          itemId={itemId}
          itemName={itemName}
          canMoveUp={idx > 0}
          canMoveDown={idx < group.origins.length - 1}
          onMoveUp={() => handleMove(idx, 'up')}
          onMoveDown={() => handleMove(idx, 'down')}
        />
      ))}

      <BrandVariantEditDialog
        open={addOriginOpen}
        onOpenChange={setAddOriginOpen}
        itemId={itemId}
        fixedBrand={fixedBrand}
      />
    </>
  )
}
