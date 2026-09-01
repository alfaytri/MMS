// src/hooks/useSkuCategoryPaths.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useVariantCategoryPaths } from '@/hooks/useVariantCategoryPaths'

/**
 * Resolves the FULL category breadcrumb ("Root > … > Leaf") for a set of item
 * SKUs, for surfaces that carry only a SKU and never the brand_variant_id.
 *
 * Credit- and debit-note lines are the motivating case: their tables drop the
 * variant fk at insert time, so the line only remembers its SKU. A variant's
 * `code` is a unique, non-null natural key, so SKU → code maps deterministically
 * to a brand variant; from there this reuses useVariantCategoryPaths to walk the
 * real category tree. Lines whose SKU matches no variant simply resolve to no
 * path (graceful — the caller renders the item with no breadcrumb).
 *
 * Two bounded, long-cached reads (sku→variant, then the shared variant→category
 * read) — no per-line queries. Returns Map<sku, breadcrumb>.
 */
export function useSkuCategoryPaths(skus: (string | null | undefined)[]): Map<string, string> {
  // Stable, de-duplicated, sorted SKU set → stable cache key.
  const cleanSkus = useMemo(
    () => Array.from(new Set(skus.filter((s): s is string => !!s))).sort(),
    [skus],
  )

  const { data: skuToVariant } = useQuery({
    queryKey: ['sku-category-variants', cleanSkus.join(',')],
    enabled: cleanSkus.length > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, code')
        .in('code', cleanSkus)
        .limit(cleanSkus.length)
      if (error) throw error
      const out: Record<string, string> = {}
      for (const row of (data ?? []) as Array<{ id: string; code: string | null }>) {
        if (row.code) out[row.code] = row.id
      }
      return out
    },
  })

  const variantIds = useMemo(
    () => (skuToVariant ? Array.from(new Set(Object.values(skuToVariant))) : []),
    [skuToVariant],
  )
  const variantPaths = useVariantCategoryPaths(variantIds)

  return useMemo(() => {
    const map = new Map<string, string>()
    if (!skuToVariant) return map
    for (const [sku, variantId] of Object.entries(skuToVariant)) {
      const path = variantPaths.get(variantId)
      if (path) map.set(sku, path)
    }
    return map
  }, [skuToVariant, variantPaths])
}
