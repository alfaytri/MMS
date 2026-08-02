import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Phase D.12 Task 5 helper — for a set of brand_variant_ids on a pending
 * delivery, fetch each variant's item and return the union of every item's
 * `shared_with_division_ids`.
 *
 * DeliveryFormDialog uses this to widen the sub-container picker when
 * cross-division consumption is allowed by the RPC — a sub-container in
 * another division becomes selectable when EVERY delivered line's item
 * has the SO's division in its shared_with_division_ids.
 *
 * The hook returns:
 *   itemShareMap: Map<brand_variant_id, string[]>   // each variant → its item's shares
 *   allShared(divId): boolean                        // convenience: are ALL variants shared to divId?
 */
export function useDeliveryLineItemShares(brandVariantIds: string[]) {
  const key = [...brandVariantIds].sort().join('|')
  const query = useQuery({
    queryKey: ['delivery-line-item-shares', key],
    enabled: brandVariantIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, inventory_items:item_id(shared_with_division_ids)')
        .in('id', brandVariantIds)
      if (error) throw error
      const map = new Map<string, string[]>()
      for (const row of (data ?? []) as unknown as Array<{
        id: string
        inventory_items: { shared_with_division_ids: string[] | null } | null
      }>) {
        map.set(row.id, row.inventory_items?.shared_with_division_ids ?? [])
      }
      return map
    },
  })

  const itemShareMap = query.data ?? new Map<string, string[]>()

  const allShared = (divisionId: string | null): boolean => {
    if (!divisionId) return false
    if (brandVariantIds.length === 0) return false
    if (itemShareMap.size === 0) return false
    for (const vId of brandVariantIds) {
      const shares = itemShareMap.get(vId) ?? []
      if (!shares.includes(divisionId)) return false
    }
    return true
  }

  return { itemShareMap, allShared, isLoading: query.isLoading }
}
