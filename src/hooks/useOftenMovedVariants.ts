import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type OftenMovedVariant = { brand_variant_id: string; move_count: number }

/**
 * The brand-variants most frequently transferred OUT of `fromWarehouseId` in
 * the last 90 days — powers the "⭐ Often moved" quick strip in Picture
 * Transfer. RP-guarded server-side. Disabled until a warehouse is resolved.
 */
export function useOftenMovedVariants(fromWarehouseId: string | null, limit = 8) {
  return useQuery({
    queryKey: ['often-moved-variants', fromWarehouseId, limit],
    enabled: !!fromWarehouseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<OftenMovedVariant[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_often_moved_variants' as never, {
        p_from_warehouse_id: fromWarehouseId,
        p_limit: limit,
      } as never)
      if (error) throw new Error(error.message)
      return ((data ?? []) as unknown as Array<{ brand_variant_id: string; move_count: number | string }>).map(
        (r) => ({ brand_variant_id: r.brand_variant_id, move_count: Number(r.move_count) }),
      )
    },
  })
}
