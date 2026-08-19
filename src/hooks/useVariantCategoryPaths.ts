// src/hooks/useVariantCategoryPaths.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAllCategoriesFlat, breadcrumb } from '@/hooks/useInventoryTree'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Resolves the FULL category breadcrumb ("Root > … > Leaf") for a set of brand
 * variants, so the item picker header can show the whole classification tree
 * instead of the flattened leaf category. Items sit up to three category levels
 * deep, which `warehouse_stock_summary.category_name`/`subcategory_name` (two
 * flat columns) cannot represent — this walks the real tree.
 *
 * Path resolution is client-side + DB-agnostic: it walks
 * inventory_item_brand_variants → inventory_items.category_id and then up the
 * inventory_categories.parent_id chain via the shared `breadcrumb()` helper.
 * One bounded, cached read per variant-id set (no per-item queries), and the
 * category list is a separate long-cached read shared app-wide.
 */
export function useVariantCategoryPaths(variantIds: string[]): Map<string, string> {
  const { data: cats = [] } = useAllCategoriesFlat()

  // Stable, de-duplicated, sorted id set → stable cache key.
  const ids = useMemo(
    () => Array.from(new Set(variantIds.filter(Boolean))).sort(),
    [variantIds],
  )

  const { data: variantToCategory } = useQuery({
    queryKey: queryKeys.inventory.variantCategoryPaths(ids.join(',')),
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string | null>> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, inventory_items!inner(category_id)')
        .in('id', ids)
        .limit(ids.length)
      if (error) throw error
      const rows = (data ?? []) as Array<{
        id: string
        // PostgREST types a to-one embed as an array in some versions; handle both.
        inventory_items: { category_id: string | null } | { category_id: string | null }[] | null
      }>
      const out: Record<string, string | null> = {}
      for (const row of rows) {
        const item = Array.isArray(row.inventory_items) ? row.inventory_items[0] : row.inventory_items
        out[row.id] = item?.category_id ?? null
      }
      return out
    },
  })

  return useMemo(() => {
    const map = new Map<string, string>()
    if (!variantToCategory) return map
    for (const [variantId, categoryId] of Object.entries(variantToCategory)) {
      if (!categoryId) continue
      const path = breadcrumb(categoryId, cats)
      if (path) map.set(variantId, path)
    }
    return map
  }, [variantToCategory, cats])
}
