import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Map brand_variant_id → the item's `image_url` (nullable). Used by Picture
 * Receive, whose transfer_items carry no image. Bounded read.
 */
export function useVariantImages(brandVariantIds: string[]) {
  const ids = Array.from(new Set(brandVariantIds.filter(Boolean))).sort()
  return useQuery({
    queryKey: ['variant-images', ids.join('|')],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string | null>> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, inventory_items(image_url)')
        .in('id', ids)
        .limit(500)
      if (error) throw error
      const m = new Map<string, string | null>()
      for (const r of (data ?? []) as unknown as Array<{ id: string; inventory_items: { image_url: string | null } | null }>) {
        m.set(r.id, r.inventory_items?.image_url ?? null)
      }
      return m
    },
  })
}
