// src/components/shared/ItemLabel.tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { ItemMeta } from '@/hooks/itemMeta'

/**
 * Collapse a deep breadcrumb so it fits on one line in a tight cell: keep the
 * type tag (first) and the leaf category (last), fold the middle into "…".
 * "Products > AC Unit > Floor Ceiling > Inverter" → "Products > … > Inverter".
 * Paths of 3 segments or fewer are left whole. The full path is shown on hover.
 */
export function compactTree(tree: string): string {
  const parts = tree.split(' > ')
  if (parts.length <= 3) return tree
  return `${parts[0]} > … > ${parts[parts.length - 1]}`
}

/**
 * The app-wide item label. Renders, top to bottom:
 *
 *   Tag > Category > Sub > … > Leaf   ← meta.tree   (tiny, muted)
 *   Item name                          ← `name`      (caller-styled)
 *   Brand                              ← meta.brand  (only when present)
 *   Origin                             ← meta.origin (only when present)
 *
 * Brand/origin are hidden when empty (and "Generic" brands are already dropped
 * upstream). Resolve `meta` once per list with useVariantItemMeta /
 * useSkuItemMeta / useToolUnitItemMeta and pass it in — never per row.
 */
export function ItemLabel({
  meta,
  name,
  nameClassName,
  className,
  treeClassName,
  showBrandOrigin = true,
}: {
  meta?: ItemMeta | null
  /** The item name node — styled by the caller to match its surface. */
  name: ReactNode
  /** Class for the item-name line (e.g. "font-medium truncate"). */
  nameClassName?: string
  /** Wrapper class (defaults to min-w-0 so it truncates inside flex/table cells). */
  className?: string
  /** Optional override for the category-tree line. */
  treeClassName?: string
  /**
   * Show the brand + origin lines below the name. Default true. Set false in
   * compact controls (e.g. picker trigger buttons) that already carry brand
   * inline in `name` and must stay short — the tree line still renders.
   */
  showBrandOrigin?: boolean
}) {
  const line = 'text-[10px] text-muted-foreground leading-tight break-words'
  return (
    <div className={cn('min-w-0', className)}>
      {meta?.tree ? (
        <div
          className={cn('text-[10px] text-muted-foreground leading-tight truncate', treeClassName)}
          title={meta.tree}
        >
          {compactTree(meta.tree)}
        </div>
      ) : null}
      <div className={nameClassName}>{name}</div>
      {showBrandOrigin && meta?.brand ? <div className={line}>{meta.brand}</div> : null}
      {showBrandOrigin && meta?.origin ? <div className={line}>{meta.origin}</div> : null}
    </div>
  )
}
