'use client'

import { useState, useMemo } from 'react'
import { Package } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface PickerItem {
  id: string
  name: string
  brand: string | null
  sku: string | null
  category: string | null
  qty?: number
  destQty?: number
  reorderPoint?: number
}

interface Props {
  items: PickerItem[]
  selectedIds?: Set<string>
  currentValue?: string
  onSelect: (id: string) => void
  showQty?: boolean
  showDestBadge?: boolean
}

// ─── Dest Stock Badge ───────────────────────────────────────────────────────────

function DestBadge({ destQty, reorderPoint }: { destQty: number | undefined; reorderPoint: number }) {
  if (destQty === undefined)
    return <Badge variant="outline" className="text-[8px] px-1 py-0 font-normal text-muted-foreground border-current/40">New</Badge>
  if (destQty === 0)
    return <Badge className="text-[8px] px-1 py-0 font-normal bg-background/60 text-destructive border-0">Out</Badge>
  if (destQty <= reorderPoint)
    return <Badge className="text-[8px] px-1 py-0 font-normal bg-background/60 text-warning border-0">Low</Badge>
  return null
}

// ─── Main picker ────────────────────────────────────────────────────────────────

export function WhItemPicker({
  items,
  selectedIds,
  currentValue,
  onSelect,
  showQty = true,
  showDestBadge = false,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('__all')

  // Group by category → item name → variants
  const grouped = useMemo(() => {
    const byCategory = new Map<string, Map<string, PickerItem[]>>()
    for (const s of items) {
      const cat = s.category ?? 'Uncategorised'
      if (!byCategory.has(cat)) byCategory.set(cat, new Map())
      const catMap = byCategory.get(cat)!
      const key = s.name ?? '(No name)'
      if (!catMap.has(key)) catMap.set(key, [])
      catMap.get(key)!.push(s)
    }
    return byCategory
  }, [items])

  const categories = useMemo(() => {
    return Array.from(grouped.entries())
      .map(([cat, its]) => ({
        name: cat,
        variantCount: Array.from(its.values()).reduce((sum, v) => sum + v.length, 0),
      }))
      .sort((a, b) => b.variantCount - a.variantCount)
  }, [grouped])

  const searching = search.trim().length > 0

  const visibleItemGroups = useMemo(() => {
    const result = new Map<string, { cat: string; name: string; variants: PickerItem[] }>()
    if (searching) {
      const q = search.toLowerCase().trim()
      for (const s of items) {
        const hay = [s.name, s.brand, s.sku, s.category].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) continue
        const key = `${s.category ?? ''}||${s.name ?? ''}`
        if (!result.has(key)) result.set(key, { cat: s.category ?? '', name: s.name ?? '', variants: [] })
        result.get(key)!.variants.push(s)
      }
      return result
    }
    if (selectedCategory === '__all') {
      for (const [cat, its] of grouped) {
        for (const [name, variants] of its) {
          result.set(`${cat}||${name}`, { cat, name, variants })
        }
      }
      return result
    }
    const catMap = grouped.get(selectedCategory)
    if (!catMap) return result
    for (const [name, variants] of catMap) {
      result.set(`${selectedCategory}||${name}`, { cat: selectedCategory, name, variants })
    }
    return result
  }, [searching, search, selectedCategory, grouped, items])

  const totalItems = items.length

  return (
    <div className="flex flex-col h-[min(480px,var(--available-height,85vh))] w-[720px] max-w-[92vw]">
      {/* Search bar */}
      <div className="px-3 py-2 border-b bg-background">
        <Input
          type="text"
          placeholder="Search by name, brand, SKU, or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
          autoFocus
        />
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Category column */}
        {!searching && (
          <div className="w-[150px] sm:w-[180px] border-r overflow-y-auto shrink-0 bg-muted/10">
            <button
              type="button"
              onClick={() => setSelectedCategory('__all')}
              className={`w-full px-3 py-2 text-left text-[11px] flex items-center justify-between hover:bg-accent/50 border-l-2 transition-colors ${
                selectedCategory === '__all' ? 'bg-primary/10 text-primary font-medium border-primary' : 'border-transparent'
              }`}
            >
              <span>All items</span>
              <span className="text-[9px] text-muted-foreground">{totalItems}</span>
            </button>
            {categories.map((c) => {
              const isActive = selectedCategory === c.name
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setSelectedCategory(c.name)}
                  className={`w-full px-3 py-2 text-left text-[11px] flex items-center justify-between hover:bg-accent/50 border-l-2 transition-colors ${
                    isActive ? 'bg-primary/10 text-primary font-medium border-primary' : 'border-transparent'
                  }`}
                >
                  <span className="truncate pr-2">{c.name}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{c.variantCount}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Items column */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {visibleItemGroups.size === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1.5 p-4">
              <Package className="h-8 w-8 opacity-30" />
              <p className="text-[11px]">
                {searching ? 'No items match your search' : 'No items in this category'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {Array.from(visibleItemGroups.values()).map(({ cat, name, variants }) => {
                const showCatLabel = searching || selectedCategory === '__all'
                return (
                  <div key={`${cat}||${name}`} className="px-3 py-2 space-y-1.5">
                    <div className="min-w-0">
                      {showCatLabel && cat && (
                        <span className="text-[9px] text-muted-foreground uppercase tracking-wide">
                          {cat}
                        </span>
                      )}
                      <p className="text-[11px] font-medium truncate">{name}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {variants.map((v) => {
                        const isSelected = currentValue === v.id
                        const isUsedElsewhere = !isSelected && selectedIds?.has(v.id)
                        const rp = v.reorderPoint ?? 0
                        const qty = v.qty
                        // Stock tier — only when qty is known
                        const tier = qty === undefined ? 'none' :
                          qty === 0 ? 'out' :
                          qty <= 2 ? 'crit' :
                          qty <= (rp || 5) ? 'low' :
                          'ok'
                        const tierCls =
                          tier === 'none' ? 'bg-muted/30 text-foreground ring-border' :
                          tier === 'out' ? 'bg-muted/40 text-muted-foreground ring-border' :
                          tier === 'crit' ? 'bg-destructive/10 text-destructive ring-destructive/30' :
                          tier === 'low' ? 'bg-warning/10 text-warning ring-warning/30' :
                          'bg-success/10 text-success ring-success/30'
                        const disabled = isUsedElsewhere || (showQty && qty === 0)
                        return (
                          <button
                            key={v.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => onSelect(v.id)}
                            className={`inline-flex items-center gap-0 px-0 py-0 rounded-md ring-1 text-[10px] transition-all overflow-hidden ${tierCls} ${
                              isSelected ? 'ring-2 ring-primary shadow-sm' : ''
                            } ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-105 cursor-pointer'}`}
                            title={`${v.brand ?? ''}${v.sku ? ` (${v.sku})` : ''}${qty !== undefined ? ` — ${qty} available` : ''}${showDestBadge && v.destQty !== undefined ? ` · dest has ${v.destQty}` : ''}`}
                          >
                            <span className="px-2 py-1 font-medium">{v.brand ?? '—'}</span>
                            {showQty && qty !== undefined && (
                              <span className="px-1.5 py-1 bg-background/60 border-l border-current/20 tabular-nums font-bold min-w-[26px] text-center">
                                {qty}
                              </span>
                            )}
                            {showDestBadge && (
                              <span className="px-1 py-1">
                                <DestBadge destQty={v.destQty} reorderPoint={rp} />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer / legend */}
      <div className="px-3 py-1.5 border-t bg-muted/20 text-[9px] text-muted-foreground flex items-center justify-between">
        <span>{searching ? `${visibleItemGroups.size} match${visibleItemGroups.size === 1 ? '' : 'es'}` : `${totalItems} items`}</span>
        {showQty && (
          <span className="flex items-center gap-2.5">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-success" />OK</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-warning" />Low</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-destructive" />Critical</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />Out</span>
          </span>
        )}
      </div>
    </div>
  )
}
