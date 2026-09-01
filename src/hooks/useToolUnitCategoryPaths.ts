// src/hooks/useToolUnitCategoryPaths.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAllCategoriesFlat, breadcrumb } from '@/hooks/useInventoryTree'

/**
 * Resolves the FULL category breadcrumb ("Root > … > Leaf") for a set of tool
 * asset UNITS, keyed by unit id.
 *
 * Tool units are served through RPCs that expose only item_name + serial (no
 * item_id, no brand_variant_id), so the variant/SKU resolvers don't apply.
 * A `tool_asset_units` row joins `inventory_items` directly via item_id, and
 * every tool item carries a category_id — so this walks
 * tool_asset_units → inventory_items.category_id and up the category tree,
 * client-side, without touching any RPC. One bounded, cached read per unit-id
 * set. Returns Map<unit_id, breadcrumb>.
 */
export function useToolUnitCategoryPaths(unitIds: (string | null | undefined)[]): Map<string, string> {
  const { data: cats = [] } = useAllCategoriesFlat()

  // Stable, de-duplicated, sorted id set → stable cache key.
  const ids = useMemo(
    () => Array.from(new Set(unitIds.filter((v): v is string => !!v))).sort(),
    [unitIds],
  )

  const { data: unitToCategory } = useQuery({
    queryKey: ['tool-unit-category-paths', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string | null>> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tool_asset_units')
        .select('id, inventory_items(category_id)')
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
    if (!unitToCategory) return map
    for (const [unitId, categoryId] of Object.entries(unitToCategory)) {
      if (!categoryId) continue
      const path = breadcrumb(categoryId, cats)
      if (path) map.set(unitId, path)
    }
    return map
  }, [unitToCategory, cats])
}
