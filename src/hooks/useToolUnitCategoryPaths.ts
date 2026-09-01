// src/hooks/useToolUnitCategoryPaths.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAllCategoriesFlat, breadcrumbWithType } from '@/hooks/useInventoryTree'
import { type ItemMeta, displayBrand } from '@/hooks/itemMeta'

/**
 * Resolves the full item label for a set of tool asset UNITS, keyed by unit id.
 *
 * Tool units are served through RPCs that expose only item_name + serial, so
 * the variant/SKU resolvers don't apply. A tool_asset_units row joins
 * inventory_items directly via item_id (unique FK) and carries its own brand
 * text; every tool item has a category. So this walks
 * tool_asset_units → inventory_items.category_id → the tag-prefixed tree, plus
 * the tool's brand. Tools have no country of origin, so `origin` is always null.
 */
export function useToolUnitItemMeta(unitIds: (string | null | undefined)[]): Map<string, ItemMeta> {
  const { data: cats = [] } = useAllCategoriesFlat()

  // Stable, de-duplicated, sorted id set → stable cache key.
  const ids = useMemo(
    () => Array.from(new Set(unitIds.filter((v): v is string => !!v))).sort(),
    [unitIds],
  )

  const { data: rows } = useQuery({
    queryKey: ['tool-unit-item-meta', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tool_asset_units')
        .select('id, brand, inventory_items(category_id)')
        .in('id', ids)
        .limit(ids.length)
      if (error) throw error
      return (data ?? []) as Array<{
        id: string
        brand: string | null
        inventory_items: { category_id: string | null } | { category_id: string | null }[] | null
      }>
    },
  })

  return useMemo(() => {
    const map = new Map<string, ItemMeta>()
    for (const row of rows ?? []) {
      const item = Array.isArray(row.inventory_items) ? row.inventory_items[0] : row.inventory_items
      const categoryId = item?.category_id ?? null
      map.set(row.id, {
        tree:   categoryId ? breadcrumbWithType(categoryId, cats) : '',
        brand:  displayBrand(null, row.brand),
        origin: null,
      })
    }
    return map
  }, [rows, cats])
}

/**
 * Tree-only projection of {@link useToolUnitItemMeta}: Map<unit_id, breadcrumb>.
 * Retained for callers that only render the category path.
 */
export function useToolUnitCategoryPaths(unitIds: (string | null | undefined)[]): Map<string, string> {
  const meta = useToolUnitItemMeta(unitIds)
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const [id, m] of meta) if (m.tree) map.set(id, m.tree)
    return map
  }, [meta])
}
