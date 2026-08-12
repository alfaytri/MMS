import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ItemShareType = 'products' | 'spare-parts' | 'consumables'

export interface ItemDivisionMembership {
  /** item id → the division ids it currently holds stock in (via sub_container.division_id). */
  divisionsByItem: Map<string, string[]>
  /** item id → its category id (for tree pruning). */
  itemCategoryMap: Map<string, string>
  isLoading: boolean
}

/**
 * For one inventory type, resolves each non-archived item's divisions from WHERE
 * ITS STOCK SITS — the distinct `division_id`s of the sub-containers holding its
 * stock (`rpc_item_divisions_by_stock`). The list view prunes the catalog tree to
 * the division(s) picked in the nav-bar multi-select.
 *
 * Only items that actually have divisioned stock come back, so a specific-division
 * filter hides items with no stock in that division. (Replaces the old
 * `shared_with_division_ids` column, which was effectively unpopulated.)
 */
export function useItemDivisionsByStock(type: ItemShareType): ItemDivisionMembership {
  const query = useQuery({
    queryKey: ['item-divisions-by-stock', type],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      // RPC isn't in the generated types yet — cast the name + args + result.
      const { data, error } = await supabase.rpc(
        'rpc_item_divisions_by_stock' as never,
        { p_type: type } as never,
      )
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        item_id: string
        category_id: string
        division_ids: string[] | null
      }>
    },
  })

  return useMemo<ItemDivisionMembership>(() => {
    const divisionsByItem = new Map<string, string[]>()
    const itemCategoryMap = new Map<string, string>()
    for (const r of query.data ?? []) {
      divisionsByItem.set(r.item_id, r.division_ids ?? [])
      itemCategoryMap.set(r.item_id, r.category_id)
    }
    return { divisionsByItem, itemCategoryMap, isLoading: query.isLoading && !query.data }
  }, [query.data, query.isLoading])
}
