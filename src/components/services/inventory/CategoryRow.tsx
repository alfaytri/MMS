'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Package, Plus, FolderPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ItemRow } from './ItemRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { ItemEditDialog } from './ItemEditDialog'
import { useInventoryItemsByCategory, useArchiveInventoryCategory, useUpdateSortOrders, type CategoryStockAggregate } from '@/hooks/useInventory'
import { formatCurrency } from '@/lib/utils/formatters'
import type { InventoryTreeNode } from '@/hooks/useInventoryTree'

type Props = {
  node: InventoryTreeNode
  categoryType: string
  showArchived: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  depth?: number
  stockAggregates?: Map<string, CategoryStockAggregate>
}

export function CategoryRow({ node, categoryType, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown, depth = 0, stockAggregates }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [addSubcategoryOpen, setAddSubcategoryOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveCategory = useArchiveInventoryCategory()
  const updateItemOrder = useUpdateSortOrders('inventory_items')
  const updateChildCategoryOrder = useUpdateSortOrders('inventory_categories')

  const isLeaf = node.children.length === 0
  const { data: items = [] } = useInventoryItemsByCategory(expanded && isLeaf ? node.id : null, showArchived)

  const indent = 12 + depth * 20

  function handleItemMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = items[idx]
    const b = items[targetIdx]
    updateItemOrder.mutate([
      { id: a.id, sort_order: a.sort_order ?? idx },
      { id: b.id, sort_order: b.sort_order ?? targetIdx },
    ])
  }

  function handleChildCategoryMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = node.children[idx]
    const b = node.children[targetIdx]
    updateChildCategoryOrder.mutate([
      { id: a.id, sort_order: a.sort_order ?? idx },
      { id: b.id, sort_order: b.sort_order ?? targetIdx },
    ])
  }

  return (
    <>
      {/* Category row */}
      <tr
        className={`border-b border-border cursor-pointer ${
          depth === 0 ? 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700'
          : depth === 1 ? 'bg-blue-50 hover:bg-blue-100/80 dark:bg-blue-950/40 dark:hover:bg-blue-900/40'
          : depth === 2 ? 'bg-violet-50 hover:bg-violet-100/80 dark:bg-violet-950/40 dark:hover:bg-violet-900/40'
          : 'bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/40 dark:hover:bg-amber-900/40'
        }`}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pr-2 w-1/2" style={{ paddingLeft: indent }}>
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            }
            <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div>
              <button
                className="text-sm font-semibold text-blue-600 hover:underline text-left"
                onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
              >
                {node.name_en}
              </button>
              {node.name_ar && (
                <div className="text-[10px] text-muted-foreground" dir="rtl">{node.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] font-mono text-muted-foreground hidden sm:table-cell">{node.sku ?? '---'}</td>
        {(() => {
          const agg = stockAggregates?.get(node.id)
          if (!agg || agg.variant_count === 0) return (
            <>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">---</td>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">---</td>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground">---</td>
            </>
          )
          const available = Number(agg.total_stock) - Number(agg.total_reserved)
          return (
            <>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">
                {agg.variant_count} variant{Number(agg.variant_count) !== 1 ? 's' : ''}
              </td>
              <td className="py-2.5 px-2 text-[11px] text-muted-foreground hidden md:table-cell">
                {formatCurrency(Number(agg.avg_cost), 'QAR')}
              </td>
              <td className="py-2.5 px-2 text-[11px]">
                <span className={available > 0 ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                  {available.toLocaleString()}
                </span>
                {Number(agg.total_damaged) > 0 && (
                  <span className="text-red-500 ml-1.5 text-[10px]">({agg.total_damaged} dmg)</span>
                )}
              </td>
            </>
          )
        })()}
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 hidden sm:inline-flex" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 hidden sm:inline-flex" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 hidden sm:inline-flex" title="Add Subcategory" onClick={() => setAddSubcategoryOpen(true)}>
              <FolderPlus className="h-3 w-3" />
            </Button>
            {isLeaf && (
              <Button variant="ghost" size="icon" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" title="Add Item" onClick={() => setAddItemOpen(true)}>
                <Plus className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Child categories (rendered before items) */}
      {expanded && node.children.map((child: InventoryTreeNode, idx: number) => (
        <CategoryRow
          key={child.id}
          node={child}
          categoryType={categoryType}
          showArchived={showArchived}
          canMoveUp={idx > 0}
          canMoveDown={idx < node.children.length - 1}
          onMoveUp={() => handleChildCategoryMove(idx, 'up')}
          onMoveDown={() => handleChildCategoryMove(idx, 'down')}
          depth={depth + 1}
          stockAggregates={stockAggregates}
        />
      ))}

      {/* Items (only on leaf nodes) */}
      {expanded && isLeaf && items.map((item, idx) => (
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

      {expanded && isLeaf && items.length === 0 && (
        <tr className="border-b border-border">
          <td colSpan={6} className="py-3 text-[11px] text-muted-foreground" style={{ paddingLeft: indent + 24 }}>
            No items in this category yet.
          </td>
        </tr>
      )}

      <CategoryEditDialog open={editOpen} onOpenChange={setEditOpen} categoryType={categoryType} category={node} />
      <CategoryEditDialog open={addSubcategoryOpen} onOpenChange={setAddSubcategoryOpen} categoryType={categoryType} parentId={node.id} />
      {isLeaf && <ItemEditDialog open={addItemOpen} onOpenChange={setAddItemOpen} categoryId={node.id} categoryType={categoryType} />}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Category"
        description={`Archive "${node.name_en}"? All items in this category will be hidden.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archiveCategory.mutate(node.id, {
            onSuccess: () => { toast.success('Category archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  )
}
