'use client'

import { useState, useMemo, useEffect } from 'react'
import { Plus, Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryRow } from './CategoryRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { InventoryImportDialog } from './InventoryImportDialog'
import { useUpdateSortOrders, useCategoryStockAggregates, type CategoryStockAggregate } from '@/hooks/useInventory'
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
  const [importOpen, setImportOpen] = useState(false)

  const { tree, isLoading } = useInventoryTree(type, showArchived)
  const { data: stockAggregates } = useCategoryStockAggregates(type)
  const updateCategoryOrder = useUpdateSortOrders('inventory_categories')

  const filtered = useMemo(() => filterTree(tree, search), [tree, search])

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [search, showArchived, type])
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])
  const pageOffset = (page - 1) * PAGE_SIZE

  function handleCategoryMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = filtered[idx]
    const b = filtered[targetIdx]
    updateCategoryOrder.mutate([
      { id: a.id, sort_order: a.sort_order ?? idx },
      { id: b.id, sort_order: b.sort_order ?? targetIdx },
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
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setImportOpen(true)}>
            <Upload className="h-3 w-3 mr-1" /> Import
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={() => setCreateCategoryOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> New Category
          </Button>
        </div>
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
              {paged.map((node, localIdx) => {
                const globalIdx = pageOffset + localIdx
                return (
                  <CategoryRow
                    key={node.id}
                    node={node}
                    categoryType={type}
                    showArchived={showArchived}
                    canMoveUp={globalIdx > 0}
                    canMoveDown={globalIdx < filtered.length - 1}
                    onMoveUp={() => handleCategoryMove(globalIdx, 'up')}
                    onMoveDown={() => handleCategoryMove(globalIdx, 'down')}
                    stockAggregates={stockAggregates}
                  />
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {filtered.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-4 py-2 border-t border-border">
          <span>{filtered.length} categor{filtered.length !== 1 ? 'ies' : 'y'}</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="tabular-nums min-w-[80px] text-center">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <CategoryEditDialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen} categoryType={type} />
      <InventoryImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}
