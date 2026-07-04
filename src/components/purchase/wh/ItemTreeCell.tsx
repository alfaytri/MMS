import React from 'react'

const TYPE_SHORT_LABEL: Record<string, string> = {
  'products':    'Products',
  'spare-parts': 'Spare Parts',
  'consumables': 'Consumables',
  'tools':       'Tools',
}

interface ItemTreeCellProps {
  category?: string | null
  subcategory?: string | null
  itemType?: string | null
  itemName: string
  brand?: string | null
  sku?: string | null
  showSku?: boolean
}

export function ItemTreeCell({ category, subcategory, itemType, itemName, brand, sku, showSku }: ItemTreeCellProps) {
  const hasParent = !!(category || subcategory)
  const depth = subcategory ? 2 : category ? 1 : 0
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {category && (
        <span className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
          <span className="break-words">
            {category}
            {subcategory && <span className="text-muted-foreground/60"> / {subcategory}</span>}
          </span>
          {itemType && TYPE_SHORT_LABEL[itemType] && (
            <span className="text-[9px] font-normal text-muted-foreground border border-border rounded px-1 py-0 leading-tight whitespace-nowrap">
              {TYPE_SHORT_LABEL[itemType]}
            </span>
          )}
        </span>
      )}
      <span
        className="font-medium text-xs truncate"
        style={{ paddingLeft: hasParent ? 12 : 0 }}
      >
        {itemName}
      </span>
      {brand && (
        <span
          className="text-[10px] text-primary truncate"
          style={{ paddingLeft: depth >= 1 ? 24 : 12 }}
        >
          {brand}
          {showSku && sku && <span className="text-muted-foreground ml-1">({sku})</span>}
        </span>
      )}
    </div>
  )
}
