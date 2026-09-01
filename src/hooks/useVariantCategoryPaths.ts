// src/hooks/useVariantCategoryPaths.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAllCategoriesFlat, breadcrumbWithType } from '@/hooks/useInventoryTree'
import { type ItemMeta, displayBrand } from '@/hooks/itemMeta'

/**
 * Resolves the full item label — tag-prefixed category tree, brand, and origin
 * — for a set of brand variants, keyed by variant id. Feeds the shared
 * <ItemLabel> so every item surface renders the same block.
 *
 * One bounded, cached read per variant-id set (variant → brand, country, and
 * inventory_items.category_id), plus the app-wide category list. The tree walks
 * the real inventory_categories parent chain and prefixes the root's type tag.
 */
export function useVariantItemMeta(variantIds: string[]): Map<string, ItemMeta> {
  const { data: cats = [] } = useAllCategoriesFlat()

  // Stable, de-duplicated, sorted id set → stable cache key.
  const ids = useMemo(
    () => Array.from(new Set(variantIds.filter(Boolean))).sort(),
    [variantIds],
  )

  const { data: rows } = useQuery({
    queryKey: ['variant-item-meta', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, brand, brands(name), country_codes(name), inventory_items!inner(category_id)')
        .in('id', ids)
        .limit(ids.length)
      if (error) throw error
      // PostgREST types to-one embeds as an array in some versions; handle both.
      return (data ?? []) as Array<{
        id: string
        brand: string | null
        brands: { name: string | null } | { name: string | null }[] | null
        country_codes: { name: string | null } | { name: string | null }[] | null
        inventory_items: { category_id: string | null } | { category_id: string | null }[] | null
      }>
    },
  })

  return useMemo(() => {
    const map = new Map<string, ItemMeta>()
    for (const row of rows ?? []) {
      const item = Array.isArray(row.inventory_items) ? row.inventory_items[0] : row.inventory_items
      const brandJoin = Array.isArray(row.brands) ? row.brands[0] : row.brands
      const countryJoin = Array.isArray(row.country_codes) ? row.country_codes[0] : row.country_codes
      const categoryId = item?.category_id ?? null
      map.set(row.id, {
        tree:   categoryId ? breadcrumbWithType(categoryId, cats) : '',
        brand:  displayBrand(brandJoin?.name ?? null, row.brand),
        origin: countryJoin?.name?.trim() || null,
      })
    }
    return map
  }, [rows, cats])
}

/**
 * Tree-only projection of {@link useVariantItemMeta}: Map<variantId, breadcrumb>.
 * Retained for callers that only render the category path; new surfaces should
 * use useVariantItemMeta + <ItemLabel> for the full block.
 */
export function useVariantCategoryPaths(variantIds: string[]): Map<string, string> {
  const meta = useVariantItemMeta(variantIds)
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const [id, m] of meta) if (m.tree) map.set(id, m.tree)
    return map
  }, [meta])
}
