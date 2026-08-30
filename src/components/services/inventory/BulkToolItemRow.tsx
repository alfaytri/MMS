'use client'

import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table'
import { BrandGroupRow } from './BrandGroupRow'
import { VARIANT_COLUMN_COUNT } from './OriginVariantRow'
import { ItemEditDialog } from './ItemEditDialog'
import { BrandVariantEditDialog } from './BrandVariantEditDialog'
import { useInventoryBrandVariants, type InventoryItem, type BrandVariant } from '@/hooks/useInventory'
import { useVariantStockByDivision } from '@/hooks/useVariantStockByDivision'
import { useBulkToolStockContext } from '@/components/shared/BulkToolStockContext'
import { ToolModeDot } from '@/components/warehouse/tools-assets/ToolBadges'
import { groupVariants, type VariantLite } from '@/lib/inventory/groupVariants'

// Runtime shape returned by useInventoryBrandVariants — it embeds
// `brands(name)` and `country_codes(name, flag, iso)` via the select string,
// but the hook casts its result to plain BrandVariant[] (no relation fields
// in that type). This local type restores the embed shape for grouping.
// Mirrors ItemRow.tsx's identically-named type.
type VariantWithRelations = BrandVariant & {
  brands: { name: string } | null
  country_codes: { name: string; flag: string; iso: string } | null
}

// Stable empty ref so a provider-supplied item with no variants (or one still
// loading) doesn't churn the memo below.
const EMPTY_VARIANTS: BrandVariant[] = []

type Props = {
  item: InventoryItem
  depth: number
  showArchived: boolean
}

/**
 * Qty-tracked row for a tool/asset item whose category has
 * `tool_tracking_mode = 'bulk'` — no serialized ToolUnitRows sub-table, but
 * (like ItemRow) an expandable brand-variant sub-table so the operator can
 * add the brand/origin variant a bulk tool needs before it can be received.
 * Without at least one variant, a bulk tool has nowhere to receive stock
 * into — this row is what unblocks that.
 *
 * Summarizes the item's brand variants (count) and division-scoped on-hand
 * qty, the same two data sources ItemRow/CascadeInventorySelector already
 * use for qty-tracked catalogs, so a bulk tool reads like a bulk product row
 * rather than a serialized asset row.
 *
 * On-hand comes from `useVariantStockByDivision` (division/RLS-scoped),
 * not the denormalized `stock_level` column on the variant, so the total
 * never exceeds what the caller's division scope can actually see.
 */
export function BulkToolItemRow({ item, depth, showArchived }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addVariantOpen, setAddVariantOpen] = useState(false)
  // Prefer the batched provider (one variants + one stock query per expanded
  // category — see ToolCategoryRow). A caller with no provider falls back to its
  // own per-item queries; when the provider is present NEITHER fires — the N+1 fix.
  const stockBatch = useBulkToolStockContext()
  const hasBatch = stockBatch !== null
  const { data: fallbackVariants = EMPTY_VARIANTS } = useInventoryBrandVariants(hasBatch ? null : item.id, showArchived)
  const { data: fallbackStock } = useVariantStockByDivision(hasBatch ? null : item.id)
  const variants = hasBatch ? (stockBatch!.variantsByItem.get(item.id) ?? EMPTY_VARIANTS) : fallbackVariants

  const variantCount = variants.length
  const totalOnHand = variants.reduce((sum, v) => {
    if (hasBatch) return sum + (stockBatch!.availableByVariant.get(v.id) ?? 0)
    const pools = fallbackStock?.get(v.id) ?? []
    return sum + pools.reduce((s, p) => s + Math.max(0, p.qty - p.reserved), 0)
  }, 0)

  // Flatten the embedded brands/country_codes relations into VariantLite,
  // then group by brand → sorted origins (see groupVariants.ts and
  // ItemRow.tsx for the grouping/sort rules — Unbranded and null-origin
  // always sort last).
  const groups = useMemo(
    () => groupVariants(
      (variants as unknown as VariantWithRelations[]).map((v): VariantLite => ({
        ...v,
        brand_name: v.brands?.name ?? null,
        country_name: v.country_codes?.name ?? null,
        country_flag: v.country_codes?.flag ?? null,
      })),
    ),
    [variants],
  )

  const indent = 12 + (depth + 1) * 20

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/20 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pr-2" style={{ paddingLeft: indent }}>
          <div className="flex items-center gap-2 min-w-0">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            }
            <ToolModeDot mode="bulk" />
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
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
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

      {/* Brand variants sub-table — mirrors ItemRow.tsx:150-198, adapted to
          the Tools table's 3-column layout (colSpan={3} vs ItemRow's 6). This
          is what unblocks receiving: a bulk tool with no brand/origin variant
          has nowhere to receive stock into. */}
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={3} className="py-0 pl-8 pr-4 pb-3">
            <div className="rounded border border-border overflow-x-auto mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] h-7 font-semibold">ORIGIN</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold hidden sm:table-cell">CODE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right hidden md:table-cell">AVG COST</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">SELLING PRICE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">RESERVED</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">AVAILABLE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right hidden sm:table-cell">INCOMING</TableHead>
                    <TableHead className="text-[10px] h-7" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groups.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={VARIANT_COLUMN_COUNT} className="text-center text-[11px] text-muted-foreground py-4">
                        No variants yet
                      </TableCell>
                    </TableRow>
                  )}
                  {groups.map((g) => (
                    <BrandGroupRow
                      key={g.brandKey}
                      group={g}
                      itemId={item.id}
                      itemName={item.name_en}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <button
              className="mt-2 min-h-11 md:min-h-0 text-xs text-blue-600 hover:underline flex items-center gap-1"
              onClick={() => setAddVariantOpen(true)}
            >
              <Plus className="h-3 w-3" /> Add brand
            </button>
          </td>
        </tr>
      )}

      <ItemEditDialog open={editOpen} onOpenChange={setEditOpen} categoryId={item.category_id} categoryType="tools" item={item} />
      <BrandVariantEditDialog open={addVariantOpen} onOpenChange={setAddVariantOpen} itemId={item.id} />
    </>
  )
}
