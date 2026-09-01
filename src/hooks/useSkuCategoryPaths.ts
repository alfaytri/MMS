// src/hooks/useSkuCategoryPaths.ts
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useVariantItemMeta } from '@/hooks/useVariantCategoryPaths'
import { type ItemMeta } from '@/hooks/itemMeta'

/**
 * Resolves the full item label (tag-prefixed tree, brand, origin) for a set of
 * item SKUs, for surfaces that carry only a SKU and never the brand_variant_id.
 *
 * A variant's `code` is a unique, non-null natural key, so SKU → code maps
 * deterministically to a brand variant; from there this reuses useVariantItemMeta.
 * SKUs that match no variant simply resolve to nothing (the caller renders the
 * item with no label). Returns Map<sku, ItemMeta>.
 */
export function useSkuItemMeta(skus: (string | null | undefined)[]): Map<string, ItemMeta> {
  // Stable, de-duplicated, sorted SKU set → stable cache key.
  const cleanSkus = useMemo(
    () => Array.from(new Set(skus.filter((s): s is string => !!s))).sort(),
    [skus],
  )

  const { data: skuToVariant } = useQuery({
    queryKey: ['sku-variant-ids', cleanSkus.join(',')],
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
  const variantMeta = useVariantItemMeta(variantIds)

  return useMemo(() => {
    const map = new Map<string, ItemMeta>()
    if (!skuToVariant) return map
    for (const [sku, variantId] of Object.entries(skuToVariant)) {
      const meta = variantMeta.get(variantId)
      if (meta) map.set(sku, meta)
    }
    return map
  }, [skuToVariant, variantMeta])
}

/**
 * Tree-only projection of {@link useSkuItemMeta}: Map<sku, breadcrumb>.
 * Retained for callers that only render the category path.
 */
export function useSkuCategoryPaths(skus: (string | null | undefined)[]): Map<string, string> {
  const meta = useSkuItemMeta(skus)
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const [sku, m] of meta) if (m.tree) map.set(sku, m.tree)
    return map
  }, [meta])
}
