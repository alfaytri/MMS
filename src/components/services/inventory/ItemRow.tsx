'use client'

import { useState, useMemo } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ItemPhoto } from '@/components/shared/ItemPhoto'
import { AttributeChipStrip } from '@/components/shared/AttributeChipStrip'
import { BrandGroupRow } from './BrandGroupRow'
import { VARIANT_COLUMN_COUNT } from './OriginVariantRow'
import { ItemEditDialog } from './ItemEditDialog'
import { BrandVariantEditDialog } from './BrandVariantEditDialog'
import { useInventoryBrandVariants, useArchiveInventoryItem, type InventoryItem, type BrandVariant } from '@/hooks/useInventory'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useItemVariantDivisionStock } from '@/hooks/useItemVariantDivisionStock'
import { formatCurrency } from '@/lib/utils/formatters'
import { useHasPermission } from '@/hooks/usePermissions'
import { groupVariants, type VariantLite } from '@/lib/inventory/groupVariants'

// Runtime shape returned by useInventoryBrandVariants — it embeds
// `brands(name)` and `country_codes(name, flag, iso)` via the select string,
// but the hook casts its result to plain BrandVariant[] (no relation fields
// in that type). This local type restores the embed shape for grouping.
type VariantWithRelations = BrandVariant & {
  brands: { name: string } | null
  country_codes: { name: string; flag: string; iso: string } | null
}

type Props = {
  item: InventoryItem
  categoryType: string
  showArchived: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

function StockBadge({ atp, reorderPoint }: { atp: number; reorderPoint: number }) {
  let color = 'bg-green-100 text-green-700'
  if (atp <= 0) color = 'bg-red-100 text-red-700'
  else if (atp <= reorderPoint) color = 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {atp} available
    </span>
  )
}

export function ItemRow({ item, categoryType, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addVariantOpen, setAddVariantOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archive = useArchiveInventoryItem()
  const { data: variants = [] } = useInventoryBrandVariants(item.id, showArchived)
  const canSeePricing = useHasPermission('inventory.pricing.view')

  // Division-scoped view: when the top bar has a division selected, override
  // each variant's good-stock / reserved / avg-cost with that division's pool
  // (from warehouse_stock_summary). Damaged / incoming / reorder stay global —
  // damaged is tracked per warehouse, not per division.
  const { viewDivisionIds } = useActiveDivision()
  const divisionScoped = viewDivisionIds.size > 0
  const divisionIds = useMemo(() => Array.from(viewDivisionIds), [viewDivisionIds])
  const { data: scopedStock } = useItemVariantDivisionStock(divisionScoped ? item.id : null, divisionIds)

  const effectiveVariants = useMemo(() => {
    if (!divisionScoped || !scopedStock) return variants
    return variants.map((v) => {
      const s = scopedStock.get(v.id)
      return {
        ...v,
        stock_level:  s?.qty ?? 0,
        reserved_qty: s?.reserved ?? 0,
        average_cost: s?.avg_cost ?? 0,
      }
    })
  }, [variants, divisionScoped, scopedStock])

  // Flatten the embedded brands/country_codes relations into VariantLite,
  // then group by brand → sorted origins (see groupVariants.ts for the
  // grouping/sort rules — Unbranded and null-origin always sort last).
  const groups = groupVariants(
    (effectiveVariants as unknown as VariantWithRelations[]).map((v): VariantLite => ({
      ...v,
      brand_name: v.brands?.name ?? null,
      country_name: v.country_codes?.name ?? null,
      country_flag: v.country_codes?.flag ?? null,
    })),
  )

  const totalAtp = effectiveVariants.reduce((sum, v) => sum + (v.stock_level ?? 0) - (v.reserved_qty ?? 0), 0)
  const totalDamaged = effectiveVariants.reduce((sum, v) => sum + (v.damaged_qty ?? 0), 0)
  const minReorder = Math.min(...effectiveVariants.map((v) => v.reorder_point ?? 0), Infinity)
  const reorderPoint = isFinite(minReorder) ? minReorder : 0
  const linkedCount = item.linked_services_count ?? 0

  // Item-level weighted avg cost — scoped from the (overridden) variants when a
  // division is selected, else the item's global cost_price.
  const scopedItemAvg = useMemo(() => {
    if (!divisionScoped) return null
    const qty = effectiveVariants.reduce((s, v) => s + (v.stock_level ?? 0), 0)
    const val = effectiveVariants.reduce((s, v) => s + (v.average_cost ?? 0) * (v.stock_level ?? 0), 0)
    return qty > 0 ? val / qty : 0
  }, [divisionScoped, effectiveVariants])
  // Cost gate — null out the item avg cost entirely when pricing isn't granted,
  // which hides both the phone meta line and the Avg Cost column cell.
  const displayAvg = !canSeePricing ? null : (divisionScoped ? scopedItemAvg : (item.cost_price ?? null))

  return (
    <>
      {/* Item row */}
      <tr
        className="border-b border-border hover:bg-muted/20 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2 pl-8 pr-2 w-1/2">
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            }
            <ItemPhoto
              url={(item as unknown as { image_url?: string | null }).image_url ?? null}
              name={item.name_en}
              size={40}
            />
            <div className="min-w-0">
              <span className="text-sm font-medium text-blue-600">{item.name_en}</span>
              {item.name_ar && (
                <div className="text-[10px] text-muted-foreground" dir="rtl">{item.name_ar}</div>
              )}
              {/* Phone-only meta line — SKU/Unit/Avg columns are hidden < sm/md, so surface them here so nothing is lost on a phone. */}
              <div className="sm:hidden text-[10px] text-muted-foreground truncate">
                {item.sku}{item.unit ? ` · ${item.unit}` : ''}{displayAvg != null ? ` · Avg ${formatCurrency(displayAvg, 'QAR')}` : ''}
              </div>
              <AttributeChipStrip itemId={item.id} categoryId={item.category_id} />
            </div>
          </div>
        </td>
        <td className="py-2 px-2 text-[11px] font-mono text-muted-foreground hidden sm:table-cell">{item.sku}</td>
        <td className="py-2 px-2 text-[11px] hidden md:table-cell">{item.unit}</td>
        <td className="py-2 px-2 text-[11px] hidden md:table-cell">
          {displayAvg != null ? (
            <span className="text-muted-foreground">Avg: {formatCurrency(displayAvg, 'QAR')}</span>
          ) : '—'}
        </td>
        <td className="py-2 px-2">
          <div className="flex items-center gap-2">
            <StockBadge atp={totalAtp} reorderPoint={reorderPoint} />
            {totalDamaged > 0 && (
              <span
                title={divisionScoped
                  ? `${totalDamaged} damaged unit${totalDamaged > 1 ? 's' : ''} company-wide — damaged stock isn't tracked per division`
                  : `${totalDamaged} damaged unit${totalDamaged > 1 ? 's' : ''} — not sellable`}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-red-100 text-red-700"
              >
                {totalDamaged} dmg{divisionScoped ? ' · all' : ''}
              </span>
            )}
            {linkedCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-blue-600 border-blue-200">
                🔗 {linkedCount}
              </Badge>
            )}
          </div>
        </td>
        <td className="py-2 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" aria-label="Move item up" className="h-6 w-6 hidden sm:inline-flex" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Move item down" className="h-6 w-6 hidden sm:inline-flex" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Edit item" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Archive item" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Brand variants sub-table */}
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={6} className="py-0 pl-8 pr-4 pb-3">
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

      <ItemEditDialog open={editOpen} onOpenChange={setEditOpen} categoryId={item.category_id} categoryType={categoryType} item={item} />
      <BrandVariantEditDialog open={addVariantOpen} onOpenChange={setAddVariantOpen} itemId={item.id} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Item"
        description={`Archive "${item.name_en}"? All variants will be hidden.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archive.mutate(item.id, {
            onSuccess: () => { toast.success('Item archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  )
}
