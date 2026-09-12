// src/components/services/inventory/InventoryMultiPicker.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { type BrandVariantGrouped } from '@/hooks/useInventory'

/**
 * Search-first, multi-select inventory picker.
 * Replaces the 3-column cascade: search across every category, tick the
 * variants you need, set a quantity on each, and add them all in one go.
 * Variants already linked to the service are dimmed and cannot be re-added.
 */
export function InventoryMultiPicker({
  open,
  onOpenChange,
  allVariants,
  onAdd,
  title,
  linkedVariantIds = new Set(),
  isAdding = false,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  allVariants: BrandVariantGrouped[]
  onAdd: (rows: { variantId: string; quantity: number }[]) => void
  title: string
  linkedVariantIds?: Set<string>
  isAdding?: boolean
}) {
  const [searchQuery, setSearchQuery] = useState('')
  // variantId → chosen quantity
  const [selected, setSelected] = useState<Map<string, number>>(new Map())
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search on open; reset everything on close
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
    setSearchQuery('')
    setSelected(new Map())
  }, [open])

  const trimmed = searchQuery.trim().toLowerCase()

  const rows = useMemo(() => {
    if (!trimmed) return allVariants
    return allVariants.filter(
      (v) =>
        v.itemName.toLowerCase().includes(trimmed) ||
        v.itemSku.toLowerCase().includes(trimmed) ||
        v.catName.toLowerCase().includes(trimmed) ||
        v.brand.toLowerCase().includes(trimmed),
    )
  }, [allVariants, trimmed])

  // Browse view (no search): group rows by category
  const grouped = useMemo(() => {
    const map = new Map<string, { catName: string; items: BrandVariantGrouped[] }>()
    for (const v of rows) {
      const g = map.get(v.catId) ?? { catName: v.catName, items: [] }
      g.items.push(v)
      map.set(v.catId, g)
    }
    return [...map.values()]
      .map((g) => ({
        catName: g.catName,
        items: g.items.sort(
          (a, b) =>
            a.itemName.localeCompare(b.itemName) || a.brand.localeCompare(b.brand),
        ),
      }))
      .sort((a, b) => a.catName.localeCompare(b.catName))
  }, [rows])

  function toggle(variantId: string) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(variantId)) next.delete(variantId)
      else next.set(variantId, 1)
      return next
    })
  }

  function setQty(variantId: string, qty: number) {
    setSelected((prev) => {
      if (!prev.has(variantId)) return prev
      const next = new Map(prev)
      next.set(variantId, qty)
      return next
    })
  }

  function handleAdd() {
    const list = [...selected.entries()]
      .map(([variantId, quantity]) => ({ variantId, quantity }))
      .filter((r) => r.quantity > 0)
    if (list.length === 0) return
    onAdd(list)
  }

  const selectedCount = selected.size

  const renderRow = (v: BrandVariantGrouped) => {
    const used = linkedVariantIds.has(v.variantId)
    const isSel = selected.has(v.variantId)
    const qty = selected.get(v.variantId) ?? 1
    return (
      <div
        key={v.variantId}
        className={cn(
          'flex items-center gap-2.5 px-4 py-2 border-b border-border/30',
          used ? 'opacity-40' : isSel ? 'bg-primary/5' : 'hover:bg-muted/30',
        )}
      >
        <Checkbox
          checked={isSel}
          disabled={used}
          onCheckedChange={() => !used && toggle(v.variantId)}
        />
        <button
          type="button"
          disabled={used}
          onClick={() => !used && toggle(v.variantId)}
          className="flex-1 min-w-0 text-left disabled:cursor-not-allowed"
        >
          <p className="text-[10px] text-muted-foreground">
            {v.catName}
            {used && ' · already linked'}
          </p>
          <p className="text-xs font-medium break-words">
            {v.itemName} <span className="text-muted-foreground">· {v.brand}</span>
          </p>
          <p className="text-[10px] text-muted-foreground">{v.itemSku}</p>
        </button>
        {isSel && (
          <Input
            type="number"
            min={0.01}
            step={0.01}
            value={qty}
            onChange={(e) => setQty(v.variantId, Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            className="h-7 w-16 text-xs shrink-0"
            aria-label={`Quantity for ${v.itemName} ${v.brand}`}
          />
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none p-0 flex flex-col md:h-[560px] md:max-w-[640px] md:rounded-lg">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-sm">{title}</DialogTitle>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-3 py-2 border-b border-border shrink-0 relative">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchRef}
            placeholder="Search by name, SKU, category or brand…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">
              {trimmed ? (
                <>No items match &quot;{searchQuery}&quot;</>
              ) : (
                'No inventory items'
              )}
            </p>
          ) : trimmed ? (
            rows.map(renderRow)
          ) : (
            grouped.map((g) => (
              <div key={g.catName}>
                <p className="sticky top-0 z-10 bg-muted/40 px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border/30">
                  {g.catName}
                </p>
                {g.items.map(renderRow)}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
          <span className="text-xs text-muted-foreground">
            {selectedCount > 0
              ? `${selectedCount} selected`
              : 'Select items to add'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={selectedCount === 0 || isAdding}
              onClick={handleAdd}
            >
              {isAdding
                ? 'Adding…'
                : `Add${selectedCount ? ` ${selectedCount}` : ''} item${selectedCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
