'use client'

import { useMemo, useState } from 'react'
import { Pencil, PackageSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ItemEditDialog } from './ItemEditDialog'
import { searchRank } from '@/lib/inventory/searchRank'
import { brandOriginText } from '@/lib/inventory/variantPickerLabel'
import { useInventoryCatalogPerms } from '@/hooks/usePermissions'
import type { SearchIndexItem } from '@/hooks/useInventorySearchIndex'

const MAX_RESULTS = 200

type Props = {
  items: SearchIndexItem[]
  search: string
  categoryType: string
  /** Division scope from the nav bar (undefined = all divisions). */
  filterItemIds?: Set<string>
  /** category_id → "Parent > Child > Leaf" for the Category column. */
  categoryPathById: Map<string, string>
  isLoading?: boolean
}

/**
 * Best (lowest) relevance rank for an item across its own name (EN + AR) and
 * every variant's brand / origin / code — so a query matches on ANY of those,
 * with name hits ranking above brand/origin, then code, then category.
 */
function rankItem(q: string, item: SearchIndexItem, catPath: string): number {
  const cands: number[] = [
    searchRank(q, { name: item.name_en, sku: item.sku, category: catPath }),
  ]
  if (item.name_ar) cands.push(searchRank(q, { name: item.name_ar }))
  for (const v of item.variants) {
    cands.push(
      searchRank(q, {
        name: item.name_en,
        brand: v.brand_name ?? v.brand,
        origin: v.origin,
        sku: v.code ?? item.sku,
        category: catPath,
      }),
    )
  }
  const valid = cands.filter((r) => r >= 0)
  return valid.length ? Math.min(...valid) : -1
}

function uniqJoin(values: (string | null | undefined)[]): string {
  const clean = values.map((v) => v?.trim()).filter(Boolean) as string[]
  return clean.length ? Array.from(new Set(clean)).join(', ') : '—'
}

export function ItemSearchResults({
  items,
  search,
  categoryType,
  filterItemIds,
  categoryPathById,
  isLoading,
}: Props) {
  const { canEdit } = useInventoryCatalogPerms()
  const [editItem, setEditItem] = useState<SearchIndexItem | null>(null)

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    const scoped = filterItemIds ? items.filter((it) => filterItemIds.has(it.id)) : items
    const ranked: { item: SearchIndexItem; rank: number; path: string }[] = []
    for (const it of scoped) {
      const path = categoryPathById.get(it.category_id ?? '') ?? ''
      const rank = rankItem(q, it, path)
      if (rank >= 0) ranked.push({ item: it, rank, path })
    }
    ranked.sort((a, b) => a.rank - b.rank || a.item.name_en.localeCompare(b.item.name_en))
    return ranked
  }, [items, search, filterItemIds, categoryPathById])

  const shown = results.slice(0, MAX_RESULTS)

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Searching…</div>
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <PackageSearch className="h-6 w-6 opacity-50" />
        <p className="text-sm">No items match &ldquo;{search.trim()}&rdquo;</p>
        <p className="text-xs">Search by item name, brand, origin, or code.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="text-left py-2 pl-3 pr-2">Item</th>
                <th className="text-left py-2 px-2 hidden md:table-cell">Category</th>
                <th className="text-left py-2 px-2">Brand / Origin</th>
                <th className="text-left py-2 px-2 hidden sm:table-cell">Code</th>
                <th className="text-left py-2 px-2 hidden lg:table-cell">Unit</th>
                <th className="text-right py-2 px-2">Stock</th>
                <th className="text-right py-2 pr-3 pl-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map(({ item, path }) => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <td className="py-2 pl-3 pr-2 align-top">
                    <div className="font-medium">{item.name_en}</div>
                    {item.name_ar && (
                      <div className="text-xs text-muted-foreground" dir="rtl">{item.name_ar}</div>
                    )}
                    {/* Category shows here on mobile where its column is hidden */}
                    <div className="text-[11px] text-muted-foreground md:hidden mt-0.5 break-words">{path || '—'}</div>
                  </td>
                  <td className="py-2 px-2 align-top hidden md:table-cell text-xs text-muted-foreground break-words max-w-[220px]">
                    {path || '—'}
                  </td>
                  <td className="py-2 px-2 align-top text-xs break-words max-w-[200px]">
                    {uniqJoin(item.variants.map((v) => brandOriginText(v.brand_name ?? v.brand, v.origin)))}
                  </td>
                  <td className="py-2 px-2 align-top hidden sm:table-cell font-mono text-xs text-muted-foreground break-words max-w-[160px]">
                    {uniqJoin(item.variants.map((v) => v.code).concat(item.sku))}
                  </td>
                  <td className="py-2 px-2 align-top hidden lg:table-cell text-xs text-muted-foreground">
                    {item.unit || '—'}
                  </td>
                  <td className="py-2 px-2 align-top text-right tabular-nums">
                    {item.total_stock ?? 0}
                  </td>
                  <td className="py-2 pr-3 pl-2 align-top text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={canEdit ? 'Edit item' : 'View item'}
                      className="h-7 w-7 min-h-11 min-w-11 md:min-h-0 md:min-w-0"
                      onClick={() => setEditItem(item)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-4 py-2 border-t border-border">
        <span>
          {results.length} item{results.length !== 1 ? 's' : ''} match
          {results.length > MAX_RESULTS ? ` · showing first ${MAX_RESULTS}` : ''}
        </span>
      </div>

      {editItem && (
        <ItemEditDialog
          open={!!editItem}
          onOpenChange={(o) => { if (!o) setEditItem(null) }}
          categoryId={editItem.category_id ?? ''}
          categoryType={categoryType}
          item={editItem}
        />
      )}
    </div>
  )
}
