import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ItemMembershipType = 'products' | 'spare-parts' | 'consumables'

export interface ItemDivisionMembership {
  ownedIds: Set<string>
  sharedWithMeIds: Set<string>
  sharedByMeIds: Set<string>
  itemCategoryMap: Map<string, string>
  isLoading: boolean
}

const EMPTY: ItemDivisionMembership = {
  ownedIds: new Set(),
  sharedWithMeIds: new Set(),
  sharedByMeIds: new Set(),
  itemCategoryMap: new Map(),
  isLoading: false,
}

/**
 * Phase D.12 Task 2 helper — classifies every non-archived item of a given
 * inventory type by its relationship to the active division:
 *
 *   - ownedIds: active division physically holds stock (any sub-container,
 *     qty > 0) — the division can already sell without any share
 *   - sharedWithMeIds: item's `shared_with_division_ids` contains the active
 *     division AND the active division does NOT own stock (access is
 *     granted purely by share)
 *   - sharedByMeIds: active division owns stock AND `shared_with_division_ids`
 *     is non-empty (this division is sharing outward to at least one other)
 *
 * When `activeDivisionId` is null (super-viewer "All divisions"), all three
 * sets are empty. Callers should use this signal to hide the chip row.
 */
export function useItemDivisionMembership(
  type: ItemMembershipType,
  activeDivisionId: string | null,
): ItemDivisionMembership {
  const itemsQuery = useQuery({
    queryKey: ['item-division-membership', 'items', type],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, category_id, shared_with_division_ids, inventory_categories!inner(type)')
        .neq('status', 'archived')
        .eq('inventory_categories.type', type)
        .limit(5000)
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        id: string
        category_id: string
        shared_with_division_ids: string[] | null
      }>
    },
  })

  const itemsReady = !!itemsQuery.data
  const itemsCount = itemsQuery.data?.length ?? 0

  const stockQuery = useQuery({
    queryKey: ['item-division-membership', 'stock', type, activeDivisionId, itemsCount],
    enabled: !!activeDivisionId && itemsReady && itemsCount > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!activeDivisionId) return [] as string[]
      const itemIdsForType = (itemsQuery.data ?? []).map((i) => i.id)
      if (itemIdsForType.length === 0) return [] as string[]
      const supabase = createClient()

      // Step 1: brand variants for the items of this type. Chunk the .in()
      // list because Supabase caps URL length ~2000 chars.
      const CHUNK = 200
      const variantIdToItemId = new Map<string, string>()
      for (let i = 0; i < itemIdsForType.length; i += CHUNK) {
        const slice = itemIdsForType.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('inventory_item_brand_variants')
          .select('id, item_id')
          .in('item_id', slice)
        if (error) throw error
        for (const row of data ?? []) variantIdToItemId.set(row.id as string, row.item_id as string)
      }
      const variantIds = Array.from(variantIdToItemId.keys())
      if (variantIds.length === 0) return []

      // Step 2: stock rows for those variants where the sub-container belongs
      // to the active division and qty > 0. Chunk the .in() the same way.
      const ownedItemIds = new Set<string>()
      for (let i = 0; i < variantIds.length; i += CHUNK) {
        const slice = variantIds.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('warehouse_stock_summary')
          .select('brand_variant_id, qty, warehouse_sub_containers!inner(division_id)')
          .gt('qty', 0)
          .in('brand_variant_id', slice)
          .eq('warehouse_sub_containers.division_id', activeDivisionId)
        if (error) throw error
        for (const row of (data ?? []) as unknown as Array<{ brand_variant_id: string }>) {
          const itemId = variantIdToItemId.get(row.brand_variant_id)
          if (itemId) ownedItemIds.add(itemId)
        }
      }
      return Array.from(ownedItemIds)
    },
  })

  return useMemo<ItemDivisionMembership>(() => {
    const items = itemsQuery.data ?? []
    const itemCategoryMap = new Map<string, string>()
    for (const it of items) itemCategoryMap.set(it.id, it.category_id)

    // isLoading is only true on the very first fetch (no cached data yet).
    // Once we have any data, keep showing the last-known counts while
    // background refetches run — no "…" flash on tab switch or page revisit.
    const itemsInitialLoad = itemsQuery.isLoading && !itemsQuery.data
    const stockInitialLoad = stockQuery.isLoading && !stockQuery.data

    if (!activeDivisionId) {
      return {
        ownedIds: new Set(),
        sharedWithMeIds: new Set(),
        sharedByMeIds: new Set(),
        itemCategoryMap,
        isLoading: itemsInitialLoad,
      }
    }

    const ownedIds = new Set(stockQuery.data ?? [])
    const sharedWithMeIds = new Set<string>()
    const sharedByMeIds = new Set<string>()

    for (const it of items) {
      const shares = it.shared_with_division_ids ?? []
      const isShared = shares.length > 0
      const shareIncludesActive = shares.includes(activeDivisionId)
      const owns = ownedIds.has(it.id)
      if (shareIncludesActive && !owns) sharedWithMeIds.add(it.id)
      if (owns && isShared) sharedByMeIds.add(it.id)
    }

    return {
      ownedIds,
      sharedWithMeIds,
      sharedByMeIds,
      itemCategoryMap,
      isLoading: itemsInitialLoad || stockInitialLoad,
    }
  }, [itemsQuery.data, itemsQuery.isLoading, stockQuery.data, stockQuery.isLoading, activeDivisionId])
}

export { EMPTY as EMPTY_ITEM_DIVISION_MEMBERSHIP }
