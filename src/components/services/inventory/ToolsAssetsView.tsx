'use client'

import { useState, useMemo, useEffect } from 'react'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ToolCategoryRow } from './ToolCategoryRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { useUpdateSortOrders } from '@/hooks/useInventory'
import { useInventoryTree } from '@/hooks/useInventoryTree'
import { filterTree } from '@/lib/inventory/filterTree'

export function ToolsAssetsView({ enabled: _enabled }: { enabled: boolean }) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)

  const { tree, isLoading } = useInventoryTree('tools', showArchived)
  const updateCategoryOrder = useUpdateSortOrders('inventory_categories')

  const filtered = useMemo(() => filterTree(tree, search), [tree, search])

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [search, showArchived])
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
      { id: a.id, sort_order: b.sort_order ?? targetIdx },
      { id: b.id, sort_order: a.sort_order ?? idx },
    ])
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-wrap">
        <Input
          placeholder="Search tools & assets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 min-h-11 md:min-h-0 text-xs w-full sm:w-64"
        />
        <div className="flex items-center gap-2">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          <Label className="text-xs cursor-pointer" onClick={() => setShowArchived((v) => !v)}>Show archived</Label>
        </div>
        <Button size="sm" className="ml-auto h-7 min-h-11 md:min-h-0 text-xs" onClick={() => setCreateCategoryOpen(true)}>
          <Plus className="h-3 w-3 mr-1" /> New Category
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2 w-1/2">TOOL / ASSET</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">INFO</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-xs text-muted-foreground py-12">
                    {search ? 'No categories match your search' : 'No tools & assets categories yet'}
                  </td>
                </tr>
              )}
              {paged.map((node, localIdx) => {
                const globalIdx = pageOffset + localIdx
                return (
                  <ToolCategoryRow
                    key={node.id}
                    node={node}
                    showArchived={showArchived}
                    canMoveUp={globalIdx > 0}
                    canMoveDown={globalIdx < filtered.length - 1}
                    onMoveUp={() => handleCategoryMove(globalIdx, 'up')}
                    onMoveDown={() => handleCategoryMove(globalIdx, 'down')}
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

      <CategoryEditDialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen} categoryType="tools" />
    </div>
  )
}
