import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ItemShareType = 'products' | 'spare-parts' | 'consumables' | 'tools'

export interface ItemDivisionMembership {
  /** item id → its division ids: the UNION of explicit assignment
   *  (the inventory_item_divisions table), where its stock currently
   *  sits (sub_container.division_id), and divisions inherited from the
   *  item's category chain (inventory_category_divisions). Empty array =
   *  none of the three. */
  divisionsByItem: Map<string, string[]>
  /** item id → its category id (for tree pruning). */
  itemCategoryMap: Map<string, string>
  isLoading: boolean
}

/**
 * For one inventory type, resolves each non-archived item's divisions as the
 * UNION of (a) its explicit assignment (the `inventory_item_divisions` table),
 * (b) where its stock currently sits — the distinct `division_id`s of the
 * sub-containers holding its stock, and (c) divisions inherited from the
 * item's category chain (`inventory_category_divisions`, walked up through
 * parent categories) — all resolved server-side by `rpc_item_divisions_by_stock`.
 * The list view prunes the catalog tree to the division(s) picked in the
 * nav-bar multi-select.
 *
 * Every non-archived item comes back; an item with no assignment, no
 * divisioned stock, and no category-level division gets an empty division
 * set, so it shows only under "All". This makes a zero-stock catalog (e.g. a
 * fresh import) still appear under the division it was assigned to.
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
