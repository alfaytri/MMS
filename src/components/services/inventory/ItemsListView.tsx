'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Plus, Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryRow } from './CategoryRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { useUpdateSortOrders, useCategoryStockAggregates } from '@/hooks/useInventory'
import { useInventoryTree, type InventoryTreeNode } from '@/hooks/useInventoryTree'
import { useInventorySearchIndex } from '@/hooks/useInventorySearchIndex'
import { rankInventoryItem } from '@/lib/inventory/itemSearchMatch'
import { reorderSiblings } from '@/lib/inventory/reorder'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useItemDivisionsByStock } from '@/hooks/useItemDivisionsByStock'
import { useInventoryCatalogPerms } from '@/hooks/usePermissions'

// Lazy-loaded: the importer pulls in xlsx + exceljs (~1.4MB). next/dynamic keeps
// those out of the Inventory route's initial bundle — they load in a separate
// chunk instead of blocking first paint / hydration.
const InventoryImportDialog = dynamic(
  () => import('./InventoryImportDialog').then((m) => m.InventoryImportDialog),
  { ssr: false },
)

type InventorySubType = 'products' | 'spare-parts' | 'consumables'

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
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  const { viewDivisionIds } = useActiveDivision()
  const { canCreate } = useInventoryCatalogPerms()
  const { tree, flat, isLoading } = useInventoryTree(type, showArchived)
  // Division-scoped category aggregates when a division is selected (empty = global).
  const { data: stockAggregates } = useCategoryStockAggregates(type, Array.from(viewDivisionIds))
  const itemDivs = useItemDivisionsByStock(type)
  const updateCategoryOrder = useUpdateSortOrders('inventory_categories')

  const divisionFiltered = viewDivisionIds.size > 0

  // When the search box has text, switch from the category tree to a flat,
  // ranked results list that matches item name / brand / origin / code. The
  // index query only runs while searching.
  const searching = search.trim().length > 0
  const searchIndex = useInventorySearchIndex(type, searching)
  const categoryPathById = useMemo(() => {
    const nameById = new Map(flat.map((c) => [c.id, c.name_en]))
    const parentById = new Map(flat.map((c) => [c.id, c.parent_id ?? null]))
    const paths = new Map<string, string>()
    for (const c of flat) {
      const chain: string[] = []
      let cursor: string | null = c.id
      let guard = 0
      while (cursor && guard++ < 20) {
        const nm = nameById.get(cursor)
        if (!nm) break
        chain.unshift(nm)
        cursor = parentById.get(cursor) ?? null
      }
      paths.set(c.id, chain.join(' > '))
    }
    return paths
  }, [flat])

  // Division scope from the nav bar: restrict to items shared with any selected
  // division. Empty selection ("All") = no division filter.
  const divisionItemIds = useMemo<Set<string> | undefined>(() => {
    if (!divisionFiltered) return undefined
    const keep = new Set<string>()
    for (const [itemId, divs] of itemDivs.divisionsByItem) {
      if (divs.some((d) => viewDivisionIds.has(d))) keep.add(itemId)
    }
    return keep
  }, [divisionFiltered, viewDivisionIds, itemDivs.divisionsByItem])

  // Rank of each matching item across name (EN+AR) / brand / origin / code /
  // category, via the shared rank — lower = closer. undefined = not searching.
  const itemRankById = useMemo<Map<string, number> | undefined>(() => {
    if (!searching) return undefined
    const q = search.trim().toLowerCase()
    const m = new Map<string, number>()
    for (const it of (searchIndex.data ?? [])) {
      const path = categoryPathById.get(it.category_id ?? '') ?? ''
      const r = rankInventoryItem(q, it, path)
      if (r >= 0) m.set(it.id, r)
    }
    return m
  }, [searching, search, searchIndex.data, categoryPathById])
  const searchItemIds = useMemo<Set<string> | undefined>(
    () => (itemRankById ? new Set(itemRankById.keys()) : undefined),
    [itemRankById],
  )

  // Effective item filter = intersection of division + search (whichever are
  // active); undefined when neither, so the full tree shows.
  const filterItemIds = useMemo<Set<string> | undefined>(() => {
    if (searchItemIds && divisionItemIds) {
      const inter = new Set<string>()
      for (const id of searchItemIds) if (divisionItemIds.has(id)) inter.add(id)
      return inter
    }
    return searchItemIds ?? divisionItemIds
  }, [searchItemIds, divisionItemIds])

  // item→category map: the search index covers every active item; the division
  // hook's map is used when not searching.
  const itemCategoryMap = useMemo<Map<string, string>>(() => {
    if (searching) {
      const m = new Map<string, string>()
      for (const it of (searchIndex.data ?? [])) if (it.category_id) m.set(it.id, it.category_id)
      return m
    }
    return itemDivs.itemCategoryMap
  }, [searching, searchIndex.data, itemDivs.itemCategoryMap])

  // Categories that should stay in the tree: any category holding a matching
  // item, plus all their ancestors so the branch renders down to the item.
  const visibleCategoryIds = useMemo<Set<string> | undefined>(() => {
    if (!filterItemIds) return undefined
    const parentMap = new Map<string, string | null>()
    for (const c of flat) parentMap.set(c.id, c.parent_id ?? null)
    const keep = new Set<string>()
    for (const itemId of filterItemIds) {
      const categoryId = itemCategoryMap.get(itemId)
      if (!categoryId) continue
      let cursor: string | null = categoryId
      while (cursor && !keep.has(cursor)) {
        keep.add(cursor)
        cursor = parentMap.get(cursor) ?? null
      }
    }
    return keep
  }, [filterItemIds, flat, itemCategoryMap])

  // Best (lowest) item rank per category incl. descendants — used to float the
  // closest-matching branch to the top while searching.
  const categoryBestRank = useMemo<Map<string, number> | undefined>(() => {
    if (!itemRankById) return undefined
    const parentMap = new Map<string, string | null>()
    for (const c of flat) parentMap.set(c.id, c.parent_id ?? null)
    const best = new Map<string, number>()
    for (const [itemId, rank] of itemRankById) {
      let cursor: string | null = itemCategoryMap.get(itemId) ?? null
      let guard = 0
      while (cursor && guard++ < 20) {
        const prev = best.get(cursor)
        if (prev === undefined || rank < prev) best.set(cursor, rank)
        cursor = parentMap.get(cursor) ?? null
      }
    }
    return best
  }, [itemRankById, itemCategoryMap, flat])

  // Prune the tree to the visible categories (search and/or division), then —
  // while searching — sort every level so the closest match is on top. No
  // filter → the full tree in its natural order.
  const filtered = useMemo(() => {
    if (!visibleCategoryIds) return tree
    const prune = (nodes: InventoryTreeNode[]): InventoryTreeNode[] =>
      nodes
        .filter((n) => visibleCategoryIds.has(n.id))
        .map((n) => ({ ...n, children: prune(n.children) }))
    const pruned = prune(tree)
    if (!categoryBestRank) return pruned
    const sortByRank = (nodes: InventoryTreeNode[]): InventoryTreeNode[] =>
      [...nodes]
        .sort(
          (a, b) =>
            (categoryBestRank.get(a.id) ?? 99) - (categoryBestRank.get(b.id) ?? 99) ||
            a.name_en.localeCompare(b.name_en),
        )
        .map((n) => ({ ...n, children: sortByRank(n.children) }))
    return sortByRank(pruned)
  }, [tree, visibleCategoryIds, categoryBestRank])

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [search, showArchived, type, viewDivisionIds])
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])
  const pageOffset = (page - 1) * PAGE_SIZE

  function handleCategoryMove(idx: number, direction: 'up' | 'down') {
    const updates = reorderSiblings(filtered, idx, direction)
    if (updates.length) updateCategoryOrder.mutate(updates)
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
        {divisionFiltered && (
          <span className="text-[11px] text-muted-foreground">
            Stock shown for the selected division{viewDivisionIds.size > 1 ? 's' : ''} · damaged is company-wide
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {canCreate && (
            <Button size="sm" variant="outline" className="h-7 min-h-11 md:min-h-0 text-xs" onClick={() => setImportOpen(true)}>
              <Upload className="h-3 w-3 mr-1" /> Import
            </Button>
          )}
          {canCreate && (
            <Button size="sm" className="h-7 min-h-11 md:min-h-0 text-xs" onClick={() => setCreateCategoryOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> New Category
            </Button>
          )}
        </div>
      </div>

      {/* Category tree — filtered to matching items (and auto-expanded) while
          searching, so the matches show inside their categories. */}
      <div className="flex-1 overflow-auto">
        {isLoading || (searching && searchIndex.isLoading) ? (
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
                    {searching
                      ? 'No items match your search'
                      : filterItemIds
                        ? 'No items in the selected division(s)'
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
                    canMoveUp={!searching && globalIdx > 0}
                    canMoveDown={!searching && globalIdx < filtered.length - 1}
                    onMoveUp={() => handleCategoryMove(globalIdx, 'up')}
                    onMoveDown={() => handleCategoryMove(globalIdx, 'down')}
                    stockAggregates={stockAggregates}
                    filterItemIds={filterItemIds}
                    rankByItemId={itemRankById}
                    forceExpanded={searching}
                    expandKey={search}
                    animationIndex={localIdx}
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
          <span>{filtered.length} categor{filtered.length !== 1 ? 'ies' : 'y'}{searching ? ' with matches' : ''}</span>
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
