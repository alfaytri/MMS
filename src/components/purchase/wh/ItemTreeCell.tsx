import React from 'react'

const TYPE_SHORT_LABEL: Record<string, string> = {
  'products':    'Products',
  'spare-parts': 'Spare Parts',
  'consumables': 'Consumables',
  'tools':       'Tools',
}

interface ItemTreeCellProps {
  category?: string | null
  itemType?: string | null
  itemName: string
  brand?: string | null
  sku?: string | null
  showSku?: boolean
}

export function ItemTreeCell({ category, itemType, itemName, brand, sku, showSku }: ItemTreeCellProps) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {category && (
        <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
          {category}
          {itemType && TYPE_SHORT_LABEL[itemType] && (
            <span className="text-[9px] font-normal text-muted-foreground border border-border rounded px-1 py-0 leading-tight">
              {TYPE_SHORT_LABEL[itemType]}
            </span>
          )}
        </span>
      )}
      <span
        className="font-medium text-xs truncate"
        style={{ paddingLeft: category ? 12 : 0 }}
      >
        {itemName}
      </span>
      {brand && (
        <span
          className="text-[10px] text-primary truncate"
          style={{ paddingLeft: category ? 24 : 12 }}
        >
          {brand}
          {showSku && sku && <span className="text-muted-foreground ml-1">({sku})</span>}
        </span>
      )}
    </div>
  )
}
