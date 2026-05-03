'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { BrandVariantRow } from './BrandVariantRow'
import { ItemEditDialog } from './ItemEditDialog'
import { BrandVariantEditDialog } from './BrandVariantEditDialog'
import { useInventoryBrandVariants, useArchiveInventoryItem, useUpdateSortOrders, type InventoryItem } from '@/hooks/useInventory'
import { formatCurrency } from '@/lib/utils/formatters'

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
  const updateVariantOrder = useUpdateSortOrders('inventory_brand_variants')
  const { data: variants = [] } = useInventoryBrandVariants(item.id, showArchived)

  function handleVariantMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = variants[idx]
    const b = variants[targetIdx]
    updateVariantOrder.mutate([
      { id: a.id, sort_order: (a as any).sort_order ?? idx },
      { id: b.id, sort_order: (b as any).sort_order ?? targetIdx },
    ])
  }

  const totalAtp = variants.reduce((sum, v) => sum + (v.stock_level ?? 0) - ((v as any).reserved_qty ?? 0), 0)
  const totalDamaged = variants.reduce((sum, v) => sum + ((v as any).damaged_qty ?? 0), 0)
  const minReorder = Math.min(...variants.map((v) => (v as any).reorder_point ?? 0), Infinity)
  const reorderPoint = isFinite(minReorder) ? minReorder : 0
  const linkedCount = item.linked_services_count ?? 0

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
            <div>
              <span className="text-sm font-medium text-blue-600">{item.name_en}</span>
              {item.name_ar && (
                <div className="text-[10px] text-muted-foreground" dir="rtl">{item.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2 px-2 text-[11px] font-mono text-muted-foreground">{item.sku}</td>
        <td className="py-2 px-2 text-[11px]">{item.unit}</td>
        <td className="py-2 px-2 text-[11px]">
          {item.cost_price != null ? (
            <span className="text-muted-foreground">Avg: {formatCurrency(item.cost_price, 'QAR')}</span>
          ) : '—'}
        </td>
        <td className="py-2 px-2">
          <div className="flex items-center gap-2">
            <StockBadge atp={totalAtp} reorderPoint={reorderPoint} />
            {totalDamaged > 0 && (
              <span
                title={`${totalDamaged} damaged unit${totalDamaged > 1 ? 's' : ''} — not sellable`}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-red-100 text-red-700"
              >
                {totalDamaged} dmg
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
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
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
                    <TableHead className="text-[10px] h-7 font-semibold">BRAND</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold">CODE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">AVG COST</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">SELLING PRICE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">RESERVED</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">AVAILABLE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">INCOMING</TableHead>
                    <TableHead className="text-[10px] h-7" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-[11px] text-muted-foreground py-4">
                        No variants yet
                      </TableCell>
                    </TableRow>
                  )}
                  {variants.map((v, idx) => (
                    <BrandVariantRow
                      key={v.id}
                      variant={v}
                      itemId={item.id}
                      itemName={item.name_en}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < variants.length - 1}
                      onMoveUp={() => handleVariantMove(idx, 'up')}
                      onMoveDown={() => handleVariantMove(idx, 'down')}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <button
              className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
              onClick={() => setAddVariantOpen(true)}
            >
              <Plus className="h-3 w-3" /> Add Brand Variant
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
