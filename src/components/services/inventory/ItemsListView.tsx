'use client'

import { useState, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryRow } from './CategoryRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { useUpdateSortOrders } from '@/hooks/useInventory'
import { useInventoryTree, type InventoryTreeNode } from '@/hooks/useInventoryTree'

type InventorySubType = 'products' | 'spare-parts' | 'consumables'

const LABEL_MAP: Record<InventorySubType, string> = {
  'products': 'Products (Installation)',
  'spare-parts': 'Spare Parts (Sales)',
  'consumables': 'Consumables (Internal)',
}

function filterTree(nodes: InventoryTreeNode[], search: string): InventoryTreeNode[] {
  if (!search) return nodes
  const lower = search.toLowerCase()
  return nodes.reduce<InventoryTreeNode[]>((acc, node) => {
    const nameMatch =
      node.name_en.toLowerCase().includes(lower) ||
      (node.name_ar ?? '').toLowerCase().includes(lower)
    const filteredChildren = filterTree(node.children, search)
    if (nameMatch || filteredChildren.length > 0) {
      acc.push({ ...node, children: nameMatch ? node.children : filteredChildren })
    }
    return acc
  }, [])
}

type Props = {
  type: InventorySubType
  enabled: boolean
}

export function ItemsListView({ type, enabled }: Props) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)

  const { tree, isLoading } = useInventoryTree(type, showArchived)
  const updateCategoryOrder = useUpdateSortOrders('inventory_categories')

  const filtered = useMemo(() => filterTree(tree, search), [tree, search])

  function handleCategoryMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = filtered[idx]
    const b = filtered[targetIdx]
    updateCategoryOrder.mutate([
      { id: a.id, sort_order: (a as any).sort_order ?? idx },
      { id: b.id, sort_order: (b as any).sort_order ?? targetIdx },
    ])
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-wrap">
        <Input
          placeholder={`Search ${LABEL_MAP[type].toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-64"
        />
        <div className="flex items-center gap-2">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          <Label className="text-xs cursor-pointer" onClick={() => setShowArchived((v) => !v)}>Show archived</Label>
        </div>
        <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => setCreateCategoryOpen(true)}>
          <Plus className="h-3 w-3 mr-1" /> New Category
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2 w-1/2">ITEM</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">SKU</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">UNIT</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">PRICING</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">STOCK / SERVICES</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-xs text-muted-foreground py-12">
                    {search ? 'No categories match your search' : `No ${LABEL_MAP[type].toLowerCase()} categories yet`}
                  </td>
                </tr>
              )}
              {filtered.map((node, idx) => (
                <CategoryRow
                  key={node.id}
                  node={node}
                  categoryType={type}
                  showArchived={showArchived}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < filtered.length - 1}
                  onMoveUp={() => handleCategoryMove(idx, 'up')}
                  onMoveDown={() => handleCategoryMove(idx, 'down')}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CategoryEditDialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen} categoryType={type} />
    </div>
  )
}
