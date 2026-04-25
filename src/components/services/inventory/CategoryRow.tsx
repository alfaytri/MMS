'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ItemRow } from './ItemRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { ItemEditDialog } from './ItemEditDialog'
import { useInventoryItemsByCategory, useArchiveInventoryCategory, useUpdateSortOrders, type InventoryCategory } from '@/hooks/useInventory'

type Props = {
  category: InventoryCategory
  categoryType: string
  showArchived: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

export function CategoryRow({ category, categoryType, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveCategory = useArchiveInventoryCategory()
  const updateItemOrder = useUpdateSortOrders('inventory_items')
  const { data: items = [] } = useInventoryItemsByCategory(expanded ? category.id : null, showArchived)

  function handleItemMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = items[idx]
    const b = items[targetIdx]
    updateItemOrder.mutate([
      { id: a.id, sort_order: (a as any).sort_order ?? idx },
      { id: b.id, sort_order: (b as any).sort_order ?? targetIdx },
    ])
  }

  return (
    <>
      {/* Category row */}
      <tr
        className="border-b border-border bg-slate-50/80 hover:bg-slate-100/60 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pl-3 pr-2 w-1/2">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            }
            <Package className="h-4 w-4 text-slate-500 flex-shrink-0" />
            <div>
              <button
                className="text-sm font-semibold text-blue-600 hover:underline text-left"
                onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
              >
                {category.name_en}
              </button>
              {category.name_ar && (
                <div className="text-[10px] text-muted-foreground" dir="rtl">{category.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] font-mono text-muted-foreground">{(category as any).sku ?? '—'}</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">—</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">—</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">—</td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddItemOpen(true)}>
              <Plus className="h-3 w-3" />
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

      {/* Items */}
      {expanded && items.map((item, idx) => (
        <ItemRow
          key={item.id}
          item={item}
          categoryType={categoryType}
          showArchived={showArchived}
          canMoveUp={idx > 0}
          canMoveDown={idx < items.length - 1}
          onMoveUp={() => handleItemMove(idx, 'up')}
          onMoveDown={() => handleItemMove(idx, 'down')}
        />
      ))}

      {expanded && items.length === 0 && (
        <tr className="border-b border-border">
          <td colSpan={6} className="py-3 pl-10 text-[11px] text-muted-foreground">
            No items in this category yet.
          </td>
        </tr>
      )}

      <CategoryEditDialog open={editOpen} onOpenChange={setEditOpen} categoryType={categoryType} category={category} />
      <ItemEditDialog open={addItemOpen} onOpenChange={setAddItemOpen} categoryId={category.id} categoryType={categoryType} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Category"
        description={`Archive "${category.name_en}"? All items in this category will be hidden.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archiveCategory.mutate(category.id, {
            onSuccess: () => { toast.success('Category archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  )
}
