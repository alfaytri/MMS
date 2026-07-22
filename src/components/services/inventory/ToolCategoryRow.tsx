'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Package, Plus, FolderPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CategoryEditDialog } from './CategoryEditDialog'
import { ToolAssetItemEditDialog, ToolAssetUnitEditDialog } from './ToolAssetEditDialog'
import { useInventoryItemsByCategory, useToolAssetUnits, useArchiveInventoryCategory, useUpdateSortOrders, type InventoryItem, type ToolAssetUnit } from '@/hooks/useInventory'
import { formatDate } from '@/lib/utils/formatters'
import type { InventoryTreeNode } from '@/hooks/useInventoryTree'

function ToolUnitRows({ itemId, itemSku }: { itemId: string; itemSku?: string | null }) {
  const { data: units = [], isLoading } = useToolAssetUnits(itemId)
  const [editUnit, setEditUnit] = useState<ToolAssetUnit | null>(null)
  const [addUnitOpen, setAddUnitOpen] = useState(false)

  const statusColor: Record<string, string> = {
    available: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    assigned: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    maintenance: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    retired: 'bg-muted text-muted-foreground',
  }

  return (
    <>
      <tr className="bg-muted/50">
        <td colSpan={3} className="py-2 pl-12 pr-4">
          <div className="rounded border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">SERIAL #</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">BRAND</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">CONDITION</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">STATUS</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">EXPIRY</th>
                  <th className="text-right text-[10px] font-semibold py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="h-8"><div className="h-4 w-full bg-muted animate-pulse rounded m-2" /></td></tr>}
                {!isLoading && units.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-[11px] text-muted-foreground py-3">No units added yet</td></tr>
                )}
                {units.map((unit) => (
                  <tr key={unit.id} className="border-t border-border">
                    <td className="py-1.5 px-2 font-mono">{unit.serial_number}</td>
                    <td className="py-1.5 px-2">{unit.brand}</td>
                    <td className="py-1.5 px-2">{unit.condition}</td>
                    <td className="py-1.5 px-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[unit.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {unit.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">{unit.expiry ? formatDate(unit.expiry) : '—'}</td>
                    <td className="py-1.5 px-2 text-right">
                      <Button variant="ghost" size="icon" className="h-5 w-5 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setEditUnit(unit)}>
                        <Pencil className="h-2.5 w-2.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={() => setAddUnitOpen(true)}>
            <Plus className="h-3 w-3" /> Add Unit
          </button>
        </td>
      </tr>
      <ToolAssetUnitEditDialog open={addUnitOpen} onOpenChange={setAddUnitOpen} itemId={itemId} itemSku={itemSku} />
      {editUnit && (
        <ToolAssetUnitEditDialog open={!!editUnit} onOpenChange={(v) => { if (!v) setEditUnit(null) }} itemId={itemId} itemSku={itemSku} unit={editUnit} />
      )}
    </>
  )
}

function ToolItemRow({ item, depth }: { item: InventoryItem; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const indent = 12 + (depth + 1) * 20

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="py-2.5 pr-2" style={{ paddingLeft: indent }}>
          <div className="flex items-center gap-2 min-w-0">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
            <span className="text-sm font-medium truncate">{item.name_en}</span>
            {item.name_ar && <span className="text-[10px] text-muted-foreground truncate flex-shrink-0" dir="rtl">{item.name_ar}</span>}
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground" />
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && <ToolUnitRows itemId={item.id} itemSku={item.sku} />}
      <ToolAssetItemEditDialog open={editOpen} onOpenChange={setEditOpen} item={item} />
    </>
  )
}

type Props = {
  node: InventoryTreeNode
  showArchived: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  depth?: number
}

export function ToolCategoryRow({ node, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [addSubcategoryOpen, setAddSubcategoryOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveCategory = useArchiveInventoryCategory()
  const updateChildCategoryOrder = useUpdateSortOrders('inventory_categories')

  const isLeaf = node.children.length === 0
  const { data: toolItems = [] } = useInventoryItemsByCategory(expanded && isLeaf ? node.id : null, showArchived)

  const indent = 12 + depth * 20

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
          <div className="flex items-center gap-1">
            <div className="hidden sm:flex items-center gap-0 mr-1" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={() => onMoveUp()}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={() => onMoveDown()}>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            }
            <Package className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <button
                className="text-sm font-semibold text-blue-600 hover:underline text-left truncate block max-w-full"
                onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
              >
                {node.name_en}
              </button>
              {node.name_ar && (
                <div className="text-[10px] text-muted-foreground truncate" dir="rtl">{node.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">
          {isLeaf && expanded && toolItems.length > 0 && (
            <span>{toolItems.length} item{toolItems.length !== 1 ? 's' : ''}</span>
          )}
        </td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6 hidden sm:inline-flex" title="Add Subcategory" onClick={() => setAddSubcategoryOpen(true)}>
              <FolderPlus className="h-3 w-3" />
            </Button>
            {isLeaf && (
              <Button variant="ghost" size="icon" className="h-6 w-6 min-h-11 min-w-11 md:min-h-0 md:min-w-0" title="Add Tool/Asset" onClick={() => setAddItemOpen(true)}>
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

      {expanded && node.children.map((child: InventoryTreeNode, idx: number) => (
        <ToolCategoryRow
          key={child.id}
          node={child}
          showArchived={showArchived}
          canMoveUp={idx > 0}
          canMoveDown={idx < node.children.length - 1}
          onMoveUp={() => handleChildCategoryMove(idx, 'up')}
          onMoveDown={() => handleChildCategoryMove(idx, 'down')}
          depth={depth + 1}
        />
      ))}

      {expanded && isLeaf && toolItems.map((item) => (
        <ToolItemRow key={item.id} item={item} depth={depth} />
      ))}

      {expanded && isLeaf && toolItems.length === 0 && (
        <tr className="border-b border-border">
          <td colSpan={3} className="py-3 text-[11px] text-muted-foreground" style={{ paddingLeft: indent + 24 }}>
            No tools in this category yet.
          </td>
        </tr>
      )}

      <CategoryEditDialog open={editOpen} onOpenChange={setEditOpen} categoryType="tools" category={node} />
      <CategoryEditDialog open={addSubcategoryOpen} onOpenChange={setAddSubcategoryOpen} categoryType="tools" parentId={node.id} />
      {isLeaf && <ToolAssetItemEditDialog open={addItemOpen} onOpenChange={setAddItemOpen} categoryId={node.id} />}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Category"
        description={`Archive "${node.name_en}"? All tools in this category will be hidden.`}
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
