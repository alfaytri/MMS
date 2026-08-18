'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAssignableToolUnits, useAssignToolUnit, type AssignableToolUnit,
} from '@/hooks/useToolAssignments'

// Numeric collation so serials/items sort "…-2" before "…-10".
const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

type AssignTreeItem = { itemId: string; itemName: string; units: AssignableToolUnit[] }
type AssignTreeCat = { categoryId: string; categoryName: string; count: number; items: AssignTreeItem[] }

/** Group flat assignable units into a category → item → unit tree (sorted). */
function buildAssignTree(units: AssignableToolUnit[]): AssignTreeCat[] {
  const cats = new Map<string, { categoryName: string; items: Map<string, AssignTreeItem> }>()
  for (const u of units) {
    const catId = u.category_id ?? '__uncat'
    let cat = cats.get(catId)
    if (!cat) { cat = { categoryName: u.category_name ?? 'Uncategorised', items: new Map() }; cats.set(catId, cat) }
    const itemId = u.item_id ?? (u.item_name ? `name:${u.item_name}` : '__unitem')
    let item = cat.items.get(itemId)
    if (!item) { item = { itemId, itemName: u.item_name ?? 'Tool', units: [] }; cat.items.set(itemId, item) }
    item.units.push(u)
  }
  return Array.from(cats.entries())
    .map(([categoryId, c]) => {
      const items = Array.from(c.items.values())
        .map((it) => ({
          ...it,
          units: [...it.units].sort((a, b) => COLLATOR.compare(a.serial_number ?? '', b.serial_number ?? '')),
        }))
        .sort((a, b) => COLLATOR.compare(a.itemName, b.itemName))
      return {
        categoryId,
        categoryName: c.categoryName,
        count: items.reduce((n, it) => n + it.units.length, 0),
        items,
      }
    })
    .sort((a, b) => COLLATOR.compare(a.categoryName, b.categoryName))
}

export function AssignToolUnitDialog({
  open, onClose, teamId, teamName, divisionId,
}: {
  open: boolean
  onClose: () => void
  teamId: string
  teamName: string
  divisionId: string
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  // Available tools in this division OR not yet tied to a division (established on assign).
  const { data: units = [], isLoading } = useAssignableToolUnits(open ? divisionId : null, search)
  const assign = useAssignToolUnit()

  const tree = useMemo(() => buildAssignTree(units), [units])
  const searching = search.trim().length > 0
  const selectedUnit = useMemo(() => units.find((u) => u.unit_id === selected) ?? null, [units, selected])

  // While searching, expand everything (the query already narrowed the set to intent).
  const catOpen = (id: string) => searching || expandedCats.has(id)
  const itemOpen = (id: string) => searching || expandedItems.has(id)

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleClose() {
    setSearch('')
    setSelected('')
    setExpandedCats(new Set())
    setExpandedItems(new Set())
    onClose()
  }

  async function handleAssign() {
    try {
      await assign.mutateAsync({ unitId: selected, teamId })
      toast.success(`Assigned to ${teamName}`)
      handleClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign tool')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="w-full h-full sm:h-[80vh] sm:max-w-2xl rounded-none sm:rounded-lg flex flex-col gap-0 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate">Assign a tool to {teamName}</DialogTitle>
          <DialogDescription>
            Pick an available tool. Tools not yet tied to a division will join this team’s division.
          </DialogDescription>
        </DialogHeader>

        {/* Search — fixed above the scroll region so it never scrolls away */}
        <div className="pt-3 pb-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by serial number or item name…"
            className="h-10"
          />
        </div>

        {/* The single scroll region (the tree) */}
        <div className="flex-1 min-h-[12rem] overflow-y-auto rounded-md border">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : units.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No available tools{searching ? ' match your search' : ' in this division'}.
            </p>
          ) : (
            tree.map((cat) => (
              <div key={cat.categoryId} className="border-b last:border-0">
                {/* Level 1 — category */}
                <button
                  type="button"
                  onClick={() => toggle(setExpandedCats, cat.categoryId)}
                  className="w-full flex items-center gap-1.5 px-2 min-h-11 sm:min-h-9 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  {catOpen(cat.categoryId)
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 truncate text-left">{cat.categoryName}</span>
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{cat.count}</span>
                </button>

                {catOpen(cat.categoryId) && cat.items.map((item) => (
                  <div key={item.itemId}>
                    {/* Level 2 — item */}
                    <button
                      type="button"
                      onClick={() => toggle(setExpandedItems, item.itemId)}
                      className="w-full flex items-center gap-1.5 pl-6 pr-2 min-h-11 sm:min-h-9 text-sm hover:bg-accent/50 transition-colors border-t"
                    >
                      {itemOpen(item.itemId)
                        ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 truncate text-left">{item.itemName}</span>
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">{item.units.length}</span>
                    </button>

                    {itemOpen(item.itemId) && item.units.map((u) => {
                      const isSel = selected === u.unit_id
                      return (
                        <button
                          key={u.unit_id}
                          type="button"
                          onClick={() => setSelected(u.unit_id)}
                          className={`w-full flex items-center gap-2 pl-12 pr-2 min-h-11 sm:min-h-9 text-left border-t hover:bg-accent transition-colors ${isSel ? 'bg-accent' : ''}`}
                        >
                          <span className="min-w-0 truncate font-mono text-xs">{u.serial_number ?? '—'}</span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{u.condition}</span>
                          {isSel && <Check className="h-4 w-4 shrink-0 text-primary" />}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Selected summary — fixed min-h so picking a tool doesn't shift the footer */}
        <div className="min-h-[1.5rem] px-1 pt-2 text-xs text-muted-foreground truncate">
          {selectedUnit && (
            <>Selected: <span className="text-foreground">{selectedUnit.item_name ?? 'Tool'} {selectedUnit.serial_number ?? ''}</span></>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleAssign} disabled={!selected || assign.isPending}>
            {assign.isPending ? 'Assigning…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
