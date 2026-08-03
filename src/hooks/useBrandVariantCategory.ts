import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Fetches the inventory category id for a brand variant by joining through
 * `inventory_item_brand_variants` → `inventory_items`. Used by the receival
 * dialog (D.8) to feed `useCategorySubContainer` for sub-container pre-fill.
 */
export function useBrandVariantCategory(brandVariantId?: string | null) {
  return useQuery<string | null>({
    queryKey: ['brand-variant-category', brandVariantId ?? null],
    enabled: !!brandVariantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!brandVariantId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('inventory_items(category_id)')
        .eq('id', brandVariantId)
        .maybeSingle()
      if (error) throw error
      const row = data as unknown as { inventory_items: { category_id: string | null } | null } | null
      return row?.inventory_items?.category_id ?? null
    },
  })
}
