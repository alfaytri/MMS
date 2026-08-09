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
import { useUpdateSortOrders, useCategoryStockAggregates } from '@/hooks/useInventory'
import { useInventoryTree, type InventoryTreeNode } from '@/hooks/useInventoryTree'
import { filterTree } from '@/lib/inventory/filterTree'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useItemDivisionMembership } from '@/hooks/useItemDivisionMembership'

type InventorySubType = 'products' | 'spare-parts' | 'consumables'
type DivisionFilter = 'all' | 'owned' | 'shared_with' | 'shared_by'

const LABEL_MAP: Record<InventorySubType, string> = {
  'products': 'Products (Installation)',
  'spare-parts': 'Spare Parts (Sales)',
  'consumables': 'Consumables (Internal)',
}

type Props = {
  type: InventorySubType
  enabled: boolean
}

export function ItemsListView({ type, enabled: _enabled }: Props) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [divisionFilter, setDivisionFilter] = useState<DivisionFilter>('all')
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const { activeDivisionId } = useActiveDivision()
  const { tree, flat, isLoading } = useInventoryTree(type, showArchived)
  const { data: stockAggregates } = useCategoryStockAggregates(type)
  const membership = useItemDivisionMembership(type, activeDivisionId)
  const updateCategoryOrder = useUpdateSortOrders('inventory_categories')

  // Reset chip when the reference division goes away.
  useEffect(() => {
    if (!activeDivisionId && divisionFilter !== 'all') setDivisionFilter('all')
  }, [activeDivisionId, divisionFilter])

  // Item IDs matching the active chip. undefined = no item filter (chip = All).
  const filterItemIds = useMemo<Set<string> | undefined>(() => {
    if (divisionFilter === 'all' || !activeDivisionId) return undefined
    if (divisionFilter === 'owned') return membership.ownedIds
    if (divisionFilter === 'shared_with') return membership.sharedWithMeIds
    return membership.sharedByMeIds
  }, [divisionFilter, activeDivisionId, membership.ownedIds, membership.sharedWithMeIds, membership.sharedByMeIds])

  // Categories that should stay in the tree: any category holding a matching
  // item, plus all their ancestors so the branch renders down to the item.
  const visibleCategoryIds = useMemo<Set<string> | undefined>(() => {
    if (!filterItemIds) return undefined
    const parentMap = new Map<string, string | null>()
    for (const c of flat) parentMap.set(c.id, c.parent_id ?? null)
    const keep = new Set<string>()
    for (const itemId of filterItemIds) {
      const categoryId = membership.itemCategoryMap.get(itemId)
      if (!categoryId) continue
      let cursor: string | null = categoryId
      while (cursor && !keep.has(cursor)) {
        keep.add(cursor)
        cursor = parentMap.get(cursor) ?? null
      }
    }
    return keep
  }, [filterItemIds, flat, membership.itemCategoryMap])

  const searched = useMemo(() => filterTree(tree, search), [tree, search])
  const filtered = useMemo(() => {
    if (!visibleCategoryIds) return searched
    const prune = (nodes: InventoryTreeNode[]): InventoryTreeNode[] =>
      nodes
        .filter((n) => visibleCategoryIds.has(n.id))
        .map((n) => ({ ...n, children: prune(n.children) }))
    return prune(searched)
  }, [searched, visibleCategoryIds])

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [search, showArchived, type, divisionFilter])
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
          className="h-7 min-h-11 md:min-h-0 text-xs w-full sm:w-64"
        />
        <div className="flex items-center gap-2">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          <Label className="text-xs cursor-pointer" onClick={() => setShowArchived((v) => !v)}>Show archived</Label>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-xs" onClick={() => setImportOpen(true)}>
            <Upload className="h-3 w-3 mr-1" /> Import
          </Button>
          <Button size="sm" className="h-7 min-h-11 md:min-h-0 text-xs" onClick={() => setCreateCategoryOpen(true)}>
            <Plus className="h-3 w-3 mr-1" /> New Category
          </Button>
        </div>
      </div>

      {/* Division-scope filter chips — only meaningful when a specific division is active */}
      {activeDivisionId && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border flex-wrap min-h-11 md:min-h-0">
          {([
            { key: 'all', label: 'All', count: null },
            { key: 'owned', label: 'Owned by my division', count: membership.ownedIds.size },
            { key: 'shared_with', label: 'Shared with me', count: membership.sharedWithMeIds.size },
            { key: 'shared_by', label: 'Shared by my division', count: membership.sharedByMeIds.size },
          ] as const).map((chip) => {
            const active = divisionFilter === chip.key
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setDivisionFilter(chip.key)}
                className={[
                  'inline-flex items-center gap-1.5 h-7 min-h-11 md:min-h-0 px-2.5 rounded-full text-[11px] font-medium border transition-colors whitespace-nowrap',
                  active
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : 'bg-white dark:bg-slate-900 text-muted-foreground border-border hover:bg-muted',
                ].join(' ')}
                aria-pressed={active}
              >
                {chip.label}
                {chip.count !== null && (
                  <span
                    className={[
                      'inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full text-[10px] tabular-nums',
                      active ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    {membership.isLoading ? '…' : chip.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2 w-1/2">ITEM</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden sm:table-cell">SKU</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden md:table-cell">UNIT</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2 hidden md:table-cell">PRICING</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">STOCK / SERVICES</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-xs text-muted-foreground py-12">
                    {filterItemIds
                      ? 'No items match this filter for the active division'
                      : search
                        ? 'No categories match your search'
                        : `No ${LABEL_MAP[type].toLowerCase()} categories yet`}
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
                    filterItemIds={filterItemIds}
                  />
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {filtered.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-4 py-2 border-t border-border">
          <span>{filtered.length} categor{filtered.length !== 1 ? 'ies' : 'y'}</span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="tabular-nums min-w-[80px] text-center">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
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
