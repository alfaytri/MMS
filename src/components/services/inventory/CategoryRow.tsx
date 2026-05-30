'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Package, Plus, FolderPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ItemRow } from './ItemRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { ItemEditDialog } from './ItemEditDialog'
import { useInventoryItemsByCategory, useArchiveInventoryCategory, useUpdateSortOrders } from '@/hooks/useInventory'
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
}

export function CategoryRow({ node, categoryType, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown, depth = 0 }: Props) {
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
      { id: a.id, sort_order: (a as any).sort_order ?? idx },
      { id: b.id, sort_order: (b as any).sort_order ?? targetIdx },
    ])
  }

  function handleChildCategoryMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = node.children[idx]
    const b = node.children[targetIdx]
    updateChildCategoryOrder.mutate([
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
        <td className="py-2.5 pr-2 w-1/2" style={{ paddingLeft: indent }}>
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
                {node.name_en}
              </button>
              {node.name_ar && (
                <div className="text-[10px] text-muted-foreground" dir="rtl">{node.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] font-mono text-muted-foreground">{(node as any).sku ?? '---'}</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">---</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">---</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">---</td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Add Subcategory" onClick={() => setAddSubcategoryOpen(true)}>
              <FolderPlus className="h-3 w-3" />
            </Button>
            {isLeaf && (
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Add Item" onClick={() => setAddItemOpen(true)}>
                <Plus className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
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
