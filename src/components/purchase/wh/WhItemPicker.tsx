'use client'

import { useState, useMemo, useEffect } from 'react'
import { Package } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ItemPhoto } from '@/components/shared/ItemPhoto'
import { variantPickerLabel } from '@/lib/inventory/variantPickerLabel'
import { searchRank } from '@/lib/inventory/searchRank'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface PickerItem {
  id: string
  name: string
  brand: string | null
  /** country_codes.name for the variant's origin; null = no origin. */
  countryName?: string | null
  sku: string | null
  category: string | null
  /** Full category breadcrumb ("Root > … > Leaf") for the item's leaf category.
   *  When present the header shows the whole classification tree instead of the
   *  flattened leaf `category`. Resolved via useVariantCategoryPaths. */
  categoryPath?: string | null
  /** inventory item_type (products | spare-parts | consumables | tools) — drives
   *  the type-grouped category column so the picker mirrors the inventory tree. */
  type?: string | null
  qty?: number
  destQty?: number
  reorderPoint?: number
  /** Public URL of the item's catalog photo. If null the picker renders
   *  a Package-icon placeholder in its place. Same photo for every brand
   *  variant of the same item — the photo lives on inventory_items. */
  imageUrl?: string | null
}

interface Props {
  items: PickerItem[]
  selectedIds?: Set<string>
  currentValue?: string
  onSelect: (id: string) => void
  showQty?: boolean
  showDestBadge?: boolean
  /** Fill the parent (`h-full w-full`) instead of the intrinsic 720×480 popover
   *  size — used when the picker is hosted in a full-screen mobile sheet. */
  fill?: boolean
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

// Canonical inventory item-type order — the category column groups by these so
// the picker reads like the inventory tree (Products → Spare Parts → …).
const TYPE_ORDER: string[] = ['products', 'spare-parts', 'consumables', 'tools']
const TYPE_LABEL: Record<string, string> = {
  'products': 'Products', 'spare-parts': 'Spare Parts', 'consumables': 'Consumables', 'tools': 'Tools',
}

export function WhItemPicker({
  items,
  selectedIds,
  currentValue,
  onSelect,
  showQty = true,
  showDestBadge = false,
  fill = false,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('__all')
  const [typeFilter, setTypeFilter] = useState<string>('__all')

  // Desktop autofocuses the search on open; touch devices wait for a tap so the
  // on-screen keyboard doesn't pop up and cover the picker (on phones the picker
  // is a full-screen sheet). Evaluated once — the picker mounts fresh on open.
  const [autoFocusSearch] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches,
  )

  // Item-type quick filter (All / Products / Spare Parts / …) — narrows the whole
  // picker to one type before grouping + search. Only types actually present are
  // offered, in canonical inventory order.
  const availableTypes = useMemo(() => {
    const present = new Set(items.map((s) => s.type ?? '').filter(Boolean))
    return TYPE_ORDER.filter((t) => present.has(t))
  }, [items])
  const typedItems = useMemo(
    () => (typeFilter === '__all' ? items : items.filter((s) => (s.type ?? '') === typeFilter)),
    [items, typeFilter],
  )

  // Group by category → item name → variants
  const grouped = useMemo(() => {
    const byCategory = new Map<string, Map<string, PickerItem[]>>()
    for (const s of typedItems) {
      const cat = s.category ?? 'Uncategorised'
      if (!byCategory.has(cat)) byCategory.set(cat, new Map())
      const catMap = byCategory.get(cat)!
      const key = s.name ?? '(No name)'
      if (!catMap.has(key)) catMap.set(key, [])
      catMap.get(key)!.push(s)
    }
    return byCategory
  }, [typedItems])

  // Category column grouped by inventory item_type, in canonical order, with
  // categories sorted A→Z within each type — so the picker mirrors the
  // inventory tree instead of a flat by-count list.
  const categoryGroups = useMemo(() => {
    const info = new Map<string, { type: string; count: number }>()
    for (const [cat, its] of grouped) {
      let type = ''
      for (const vs of its.values()) {
        const t = vs.find((v) => v.type)?.type
        if (t) { type = t; break }
      }
      const count = Array.from(its.values()).reduce((sum, v) => sum + v.length, 0)
      info.set(cat, { type, count })
    }
    const byType = new Map<string, { name: string; variantCount: number }[]>()
    for (const [cat, i] of info) {
      if (!byType.has(i.type)) byType.set(i.type, [])
      byType.get(i.type)!.push({ name: cat, variantCount: i.count })
    }
    const groups: { key: string; label: string; cats: { name: string; variantCount: number }[] }[] = []
    const pushType = (t: string) => {
      const cats = byType.get(t)
      if (cats?.length) groups.push({ key: t || 'other', label: TYPE_LABEL[t] ?? 'Other', cats: cats.sort((a, b) => a.name.localeCompare(b.name)) })
    }
    for (const t of TYPE_ORDER) pushType(t)
    for (const t of byType.keys()) if (!TYPE_ORDER.includes(t)) pushType(t)
    return groups
  }, [grouped])

  const searching = search.trim().length > 0

  const visibleItemGroups = useMemo(() => {
    const result = new Map<string, { cat: string; name: string; variants: PickerItem[] }>()
    if (searching) {
      const q = search.toLowerCase().trim()
      // Rank by WHERE the query hits: exact / prefix / word-start in the item
      // name outrank a plain substring, which outranks brand / origin / SKU /
      // category matches. So "80" surfaces "80 Gallon…" above an item that only
      // matches on a code. Same match set as before (any field contains q).
      const scored = new Map<string, { cat: string; name: string; variants: PickerItem[]; score: number }>()
      for (const s of typedItems) {
        const score = searchRank(q, { name: s.name, brand: s.brand, origin: s.countryName, sku: s.sku, category: s.category })
        if (score < 0) continue
        const key = `${s.category ?? ''}||${s.name ?? ''}`
        const g = scored.get(key)
        if (!g) scored.set(key, { cat: s.category ?? '', name: s.name ?? '', variants: [s], score })
        else { g.variants.push(s); if (score < g.score) g.score = score }
      }
      for (const g of [...scored.values()].sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))) {
        result.set(`${g.cat}||${g.name}`, { cat: g.cat, name: g.name, variants: g.variants })
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
  }, [searching, search, selectedCategory, grouped, typedItems])

  // If the active type filter is no longer present (e.g. items changed after a
  // warehouse switch), fall back to All so the list can't get stuck empty.
  useEffect(() => {
    if (typeFilter !== '__all' && !availableTypes.includes(typeFilter)) setTypeFilter('__all')
  }, [availableTypes, typeFilter])

  const totalItems = typedItems.length

  return (
    <div
      className={cn(
        'flex flex-col bg-popover',
        fill
          ? 'h-full w-full'
          : 'h-[min(480px,var(--available-height,85vh))] w-[720px] max-w-[92vw]',
      )}
    >
      {/* Search bar + item-type quick filter */}
      <div className="px-3 py-2 border-b bg-popover space-y-2">
        <Input
          type="text"
          placeholder="Search by name, brand, SKU, or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
          autoFocus={autoFocusSearch}
        />
        {availableTypes.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            {['__all', ...availableTypes].map((t) => {
              const active = typeFilter === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTypeFilter(t); setSelectedCategory('__all') }}
                  className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-accent/50'
                  }`}
                >
                  {t === '__all' ? 'All' : (TYPE_LABEL[t] ?? t)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Category column */}
        {!searching && (
          <div className="w-[150px] sm:w-[180px] border-r overflow-y-auto shrink-0">
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
            {categoryGroups.map((g) => (
              <div key={g.key}>
                <div className="px-3 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {g.label}
                </div>
                {g.cats.map((c) => {
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
            ))}
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
            <div className="divide-y divide-border">
              {Array.from(visibleItemGroups.values()).map(({ cat, name, variants }) => {
                const showCatLabel = searching || selectedCategory === '__all'
                // Every variant of the same item shares the same photo
                // (it lives on inventory_items). Grab it from the first
                // variant that has one.
                const itemImageUrl = variants.find((v) => v.imageUrl)?.imageUrl ?? null
                // Whole classification tree for the header. Prefer the full
                // breadcrumb ("Root > … > Leaf", resolved via categoryPath — all
                // variants of an item share it); fall back to the flat leaf
                // category when a path hasn't been supplied. Wraps (never
                // truncates) and stays tiny so the whole tree fits.
                const headerPath = variants.find((v) => v.categoryPath)?.categoryPath ?? (cat || null)
                return (
                  <div key={`${cat}||${name}`} className="px-3 py-2 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        {showCatLabel && headerPath && (
                          <span className="block text-[9px] leading-snug text-muted-foreground tracking-wide break-words">
                            {headerPath}
                          </span>
                        )}
                        <p className="text-[11px] font-medium break-words">{name}</p>
                      </div>
                      <ItemPhoto url={itemImageUrl} name={name} size={48} />
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
                        const vlabel = variantPickerLabel({ brand: v.brand, country_name: v.countryName })
                        return (
                          <button
                            key={v.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => onSelect(v.id)}
                            className={`inline-flex items-center gap-0 px-0 py-0 rounded-md ring-1 text-[10px] transition-all overflow-hidden ${tierCls} ${
                              isSelected ? 'ring-2 ring-primary shadow-sm' : ''
                            } ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-105 cursor-pointer'}`}
                            title={`${vlabel.primary}${vlabel.origin ? ` · ${vlabel.origin}` : ''}${v.sku ? ` (${v.sku})` : ''}${qty !== undefined ? ` — ${qty} available` : ''}${showDestBadge && v.destQty !== undefined ? ` · dest has ${v.destQty}` : ''}`}
                          >
                            <span className="px-2 py-1 font-medium">
                              {vlabel.primary}
                              {vlabel.origin && <span className="font-normal opacity-70"> · {vlabel.origin}</span>}
                            </span>
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
      <div className="px-3 py-1.5 border-t bg-popover text-[9px] text-muted-foreground flex items-center justify-between">
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
