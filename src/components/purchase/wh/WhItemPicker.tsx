'use client'

import { useState, useMemo, useEffect } from 'react'
import { Package, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ItemPhoto } from '@/components/shared/ItemPhoto'
import { variantPickerLabel } from '@/lib/inventory/variantPickerLabel'
import { searchRank } from '@/lib/inventory/searchRank'
import { cn } from '@/lib/utils'
import { useAllCategoriesFlat, buildTree, allDescendantIds, breadcrumb, type InventoryTreeNode } from '@/hooks/useInventoryTree'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface PickerItem {
  id: string
  name: string
  brand: string | null
  /** country_codes.name for the variant's origin; null = no origin. */
  countryName?: string | null
  sku: string | null
  category: string | null
  /** Leaf category id (inventory_categories.id). When supplied, the picker's
   *  left column becomes the real expandable inventory tree (parent → child →
   *  items) instead of a flat leaf list. Falls back to the flat list otherwise. */
  categoryId?: string | null
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

type ItemGroup = { cat: string; name: string; variants: PickerItem[] }

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
const UNCAT = '__uncat'

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // App-wide category list → the real inventory hierarchy (parent_id chain).
  const { data: cats = [] } = useAllCategoriesFlat()

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

  // Tree mode activates only when categories loaded AND items carry a leaf
  // categoryId. Otherwise fall back to the flat-by-name category column.
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
  const hasTree = cats.length > 0 && typedItems.some((s) => s.categoryId && catById.has(s.categoryId))

  // ── Items grouped by leaf category id → item name → variants (tree mode) ──
  const itemsByCatId = useMemo(() => {
    const m = new Map<string, Map<string, PickerItem[]>>()
    for (const s of typedItems) {
      const cid = s.categoryId && catById.has(s.categoryId) ? s.categoryId : UNCAT
      if (!m.has(cid)) m.set(cid, new Map())
      const im = m.get(cid)!
      const key = s.name ?? '(No name)'
      if (!im.has(key)) im.set(key, [])
      im.get(key)!.push(s)
    }
    return m
  }, [typedItems, catById])

  // Direct + subtree item counts per category (tree mode).
  const { subtreeCount, childrenOf } = useMemo(() => {
    const childrenOf = new Map<string | null, InventoryTreeNode[]>()
    const tree = buildTree(cats, null)
    const walk = (nodes: InventoryTreeNode[], parent: string | null) => {
      childrenOf.set(parent, nodes)
      for (const n of nodes) walk(n.children, n.id)
    }
    walk(tree, null)
    const direct = (id: string) =>
      Array.from(itemsByCatId.get(id)?.values() ?? []).reduce((s, v) => s + v.length, 0)
    const subtreeCount = new Map<string, number>()
    const compute = (id: string): number => {
      const cached = subtreeCount.get(id)
      if (cached !== undefined) return cached
      let n = direct(id)
      for (const ch of childrenOf.get(id) ?? []) n += compute(ch.id)
      subtreeCount.set(id, n)
      return n
    }
    for (const c of cats) compute(c.id)
    return { subtreeCount, childrenOf }
  }, [cats, itemsByCatId])

  // Roots grouped by type, pruned to those with items somewhere in their subtree.
  const treeByType = useMemo(() => {
    const roots = (childrenOf.get(null) ?? []).filter((r) => (subtreeCount.get(r.id) ?? 0) > 0)
    const byType = new Map<string, InventoryTreeNode[]>()
    for (const r of roots) {
      const t = r.type ?? ''
      if (!byType.has(t)) byType.set(t, [])
      byType.get(t)!.push(r)
    }
    const groups: { key: string; label: string; roots: InventoryTreeNode[] }[] = []
    const push = (t: string) => { const r = byType.get(t); if (r?.length) groups.push({ key: t || 'other', label: TYPE_LABEL[t] ?? 'Other', roots: r }) }
    for (const t of TYPE_ORDER) push(t)
    for (const t of byType.keys()) if (!TYPE_ORDER.includes(t)) push(t)
    return groups
  }, [childrenOf, subtreeCount])

  const uncatCount = useMemo(
    () => Array.from(itemsByCatId.get(UNCAT)?.values() ?? []).reduce((s, v) => s + v.length, 0),
    [itemsByCatId],
  )

  // ── Flat fallback grouping (callers without categoryId) ──
  const grouped = useMemo(() => {
    const byCategory = new Map<string, Map<string, PickerItem[]>>()
    for (const s of typedItems) {
      const cat = s.category ?? 'Uncategorised'
      if (!byCategory.has(cat)) byCategory.set(cat, new Map())
      const catMap = byCategory.get(cat)!
      const key = `${s.categoryPath ?? s.category ?? ''}||${s.name ?? '(No name)'}`
      if (!catMap.has(key)) catMap.set(key, [])
      catMap.get(key)!.push(s)
    }
    return byCategory
  }, [typedItems])

  const flatCategoryGroups = useMemo(() => {
    const info = new Map<string, { type: string; count: number }>()
    for (const [cat, its] of grouped) {
      let type = ''
      for (const vs of its.values()) { const t = vs.find((v) => v.type)?.type; if (t) { type = t; break } }
      const count = Array.from(its.values()).reduce((sum, v) => sum + v.length, 0)
      info.set(cat, { type, count })
    }
    const byType = new Map<string, { name: string; variantCount: number }[]>()
    for (const [cat, i] of info) { if (!byType.has(i.type)) byType.set(i.type, []); byType.get(i.type)!.push({ name: cat, variantCount: i.count }) }
    const groups: { key: string; label: string; cats: { name: string; variantCount: number }[] }[] = []
    const pushType = (t: string) => { const cats = byType.get(t); if (cats?.length) groups.push({ key: t || 'other', label: TYPE_LABEL[t] ?? 'Other', cats: cats.sort((a, b) => a.name.localeCompare(b.name)) }) }
    for (const t of TYPE_ORDER) pushType(t)
    for (const t of byType.keys()) if (!TYPE_ORDER.includes(t)) pushType(t)
    return groups
  }, [grouped])

  const searching = search.trim().length > 0

  const visibleItemGroups = useMemo(() => {
    const result = new Map<string, ItemGroup>()

    // Search ignores the category selection in both modes — ranked flat results.
    if (searching) {
      const q = search.toLowerCase().trim()
      const scored = new Map<string, ItemGroup & { score: number }>()
      for (const s of typedItems) {
        const score = searchRank(q, { name: s.name, brand: s.brand, origin: s.countryName, sku: s.sku, category: s.category })
        if (score < 0) continue
        const key = `${s.categoryId ?? s.categoryPath ?? s.category ?? ''}||${s.name ?? ''}`
        const g = scored.get(key)
        if (!g) scored.set(key, { cat: s.category ?? '', name: s.name ?? '', variants: [s], score })
        else { g.variants.push(s); if (score < g.score) g.score = score }
      }
      for (const [key, g] of [...scored.entries()].sort((a, b) => a[1].score - b[1].score || a[1].name.localeCompare(b[1].name))) {
        result.set(key, { cat: g.cat, name: g.name, variants: g.variants })
      }
      return result
    }

    if (hasTree) {
      // The selected category's whole subtree (node + all descendants), or all.
      const ids = selectedCategory === '__all'
        ? null
        : selectedCategory === UNCAT
          ? [UNCAT]
          : [selectedCategory, ...allDescendantIds(selectedCategory, cats)]
      const want = (cid: string) => ids === null || ids.includes(cid)
      for (const [cid, im] of itemsByCatId) {
        if (!want(cid)) continue
        for (const [name, variants] of im) {
          result.set(`${cid}||${name}`, { cat: variants[0]?.category ?? '', name, variants })
        }
      }
      return result
    }

    // Flat mode
    if (selectedCategory === '__all') {
      for (const [cat, its] of grouped) for (const [ikey, variants] of its) result.set(`${cat}||${ikey}`, { cat, name: variants[0]?.name ?? '(No name)', variants })
      return result
    }
    const catMap = grouped.get(selectedCategory)
    if (!catMap) return result
    for (const [ikey, variants] of catMap) result.set(`${selectedCategory}||${ikey}`, { cat: selectedCategory, name: variants[0]?.name ?? '(No name)', variants })
    return result
  }, [searching, search, selectedCategory, hasTree, grouped, itemsByCatId, typedItems, cats])

  // If the active type filter is no longer present (e.g. items changed after a
  // warehouse switch), fall back to All so the list can't get stuck empty.
  useEffect(() => {
    if (typeFilter !== '__all' && !availableTypes.includes(typeFilter)) setTypeFilter('__all')
  }, [availableTypes, typeFilter])

  const totalItems = typedItems.length

  function toggle(id: string) {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  // Recursive category tree row (tree mode).
  function renderNode(node: InventoryTreeNode, depth: number): React.ReactNode {
    const count = subtreeCount.get(node.id) ?? 0
    if (count === 0) return null
    const kids = (childrenOf.get(node.id) ?? []).filter((c) => (subtreeCount.get(c.id) ?? 0) > 0)
    const hasKids = kids.length > 0
    const isOpen = expanded.has(node.id)
    const isActive = selectedCategory === node.id
    return (
      <div key={node.id}>
        <div
          className={cn(
            'w-full flex items-center gap-1 pr-2 text-[11px] hover:bg-accent/50 border-l-2 transition-colors',
            isActive ? 'bg-primary/10 text-primary font-medium border-primary' : 'border-transparent',
          )}
          style={{ paddingLeft: 6 + depth * 12 }}
        >
          {hasKids ? (
            <button type="button" onClick={() => toggle(node.id)} aria-label={isOpen ? 'Collapse' : 'Expand'} className="p-0.5 -ml-0.5 shrink-0 text-muted-foreground hover:text-foreground">
              <ChevronRight className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-90')} />
            </button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <button type="button" onClick={() => setSelectedCategory(node.id)} className="flex-1 min-w-0 py-2 text-left flex items-center justify-between gap-2">
            <span className="truncate">{node.name_en}</span>
            <span className="text-[9px] text-muted-foreground shrink-0">{count}</span>
          </button>
        </div>
        {hasKids && isOpen && kids.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-popover',
        fill ? 'h-full w-full' : 'h-[min(480px,var(--available-height,85vh))] w-[720px] max-w-[92vw]',
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
                    active ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-accent/50'
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
          <div className="w-[160px] sm:w-[200px] border-r overflow-y-auto shrink-0">
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

            {hasTree ? (
              <>
                {treeByType.map((g) => (
                  <div key={g.key}>
                    <div className="px-3 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">{g.label}</div>
                    {g.roots.map((r) => renderNode(r, 0))}
                  </div>
                ))}
                {uncatCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(UNCAT)}
                    className={`w-full px-3 py-2 text-left text-[11px] flex items-center justify-between hover:bg-accent/50 border-l-2 transition-colors ${
                      selectedCategory === UNCAT ? 'bg-primary/10 text-primary font-medium border-primary' : 'border-transparent'
                    }`}
                  >
                    <span className="text-muted-foreground">Uncategorised</span>
                    <span className="text-[9px] text-muted-foreground">{uncatCount}</span>
                  </button>
                )}
              </>
            ) : (
              flatCategoryGroups.map((g) => (
                <div key={g.key}>
                  <div className="px-3 pt-2 pb-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">{g.label}</div>
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
              ))
            )}
          </div>
        )}

        {/* Items column */}
        <div className="flex-1 overflow-y-auto min-w-0">
          {visibleItemGroups.size === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-1.5 p-4">
              <Package className="h-8 w-8 opacity-30" />
              <p className="text-[11px]">{searching ? 'No items match your search' : 'No items in this category'}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Array.from(visibleItemGroups.entries()).map(([groupKey, { cat, name, variants }]) => {
                const itemImageUrl = variants.find((v) => v.imageUrl)?.imageUrl ?? null
                // Header breadcrumb: prefer an explicit categoryPath prop; else, in
                // tree mode, derive the real breadcrumb from the item's leaf
                // categoryId; else fall back to the flat leaf category name.
                const leafId = variants.find((v) => v.categoryId)?.categoryId ?? null
                const fullPath = variants.find((v) => v.categoryPath)?.categoryPath
                  ?? (hasTree && leafId && catById.has(leafId) ? breadcrumb(leafId, cats) : null)
                const headerPath = fullPath ?? (cat || null)
                const showCatLabel = !!fullPath || searching || selectedCategory === '__all'
                return (
                  <div key={groupKey} className="px-3 py-2 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        {showCatLabel && headerPath && (
                          <span className="block text-[9px] leading-snug text-muted-foreground tracking-wide break-words">{headerPath}</span>
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
                        const tier = qty === undefined ? 'none' : qty === 0 ? 'out' : qty <= 2 ? 'crit' : qty <= (rp || 5) ? 'low' : 'ok'
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
                              <span className="px-1.5 py-1 bg-background/60 border-l border-current/20 tabular-nums font-bold min-w-[26px] text-center">{qty}</span>
                            )}
                            {showDestBadge && (
                              <span className="px-1 py-1"><DestBadge destQty={v.destQty} reorderPoint={rp} /></span>
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
