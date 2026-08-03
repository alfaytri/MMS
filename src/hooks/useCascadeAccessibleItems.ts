import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { LineType } from '@/components/purchase/PoLineItemsEditor'

export interface CascadeAccessibleItems {
  /**
   * Item IDs the active division can legitimately consume — either it owns
   * stock (any sub-container with qty > 0 whose division_id equals the active
   * division) OR the item is shared to the active division AND has stock
   * somewhere in the caller's RLS scope.
   *
   * `null` when the filter should not be applied (no active division, or the
   * caller opted out via the enabled flag).
   */
  accessibleItemIds: Set<string> | null
  /**
   * Items where the active division is the physical owner (holds stock).
   * Empty when the filter isn't applied. Used to distinguish share-only
   * items from owned ones so the picker can render a "Shared" chip on
   * the item row.
   */
  ownedItemIds: Set<string>
  itemCategoryMap: Map<string, string>
  isLoading: boolean
}

/**
 * Phase D.12 Task 3 helper — powers the consumption-side cascade picker's
 * division-aware filter. Runs only for the four inventory line types that
 * flow through the cascade (products / spare-parts / consumables / tools).
 *
 * When `enabled` is false, or `activeDivisionId` is null, or `type` is not
 * a filterable line type, every field is empty and `accessibleItemIds` is
 * null (i.e. no filter). Callers should treat null as "show everything".
 *
 * Filter logic:
 *   accessible = owned_by_active ∪ (shared_to_active ∩ has_stock_anywhere)
 *
 * "has stock anywhere" is scoped to whatever `warehouse_stock_summary` rows
 * the caller can see through RLS — matches the HANDOVER Task 3 spec:
 * "if the caller has RLS to see the stock and the item is either owned or
 * shared, include it."
 */
export function useCascadeAccessibleItems(
  type: LineType,
  activeDivisionId: string | null,
  enabled: boolean,
): CascadeAccessibleItems {
  const isFilterable = type !== 'tools'
  const effectiveEnabled = enabled && !!activeDivisionId && isFilterable

  const itemsQuery = useQuery({
    queryKey: ['cascade-accessible', 'items', type],
    enabled: effectiveEnabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, category_id, shared_with_division_ids, inventory_categories!inner(type)')
        .neq('status', 'archived')
        .eq('inventory_categories.type', type as 'products' | 'spare-parts' | 'consumables' | 'tools')
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
    queryKey: ['cascade-accessible', 'stock', type, itemsCount],
    enabled: effectiveEnabled && itemsReady && itemsCount > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const itemIds = (itemsQuery.data ?? []).map((i) => i.id)
      if (itemIds.length === 0) return [] as Array<{ item_id: string; division_id: string | null }>
      const supabase = createClient()

      // Step 1: brand variants for the items of this type, chunked to stay
      // under the Supabase URL length cap.
      const CHUNK = 200
      const variantIdToItemId = new Map<string, string>()
      for (let i = 0; i < itemIds.length; i += CHUNK) {
        const slice = itemIds.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('inventory_item_brand_variants')
          .select('id, item_id')
          .in('item_id', slice)
        if (error) throw error
        for (const row of data ?? []) variantIdToItemId.set(row.id as string, row.item_id as string)
      }
      const variantIds = Array.from(variantIdToItemId.keys())
      if (variantIds.length === 0) return []

      // Step 2: stock rows for those variants where qty > 0. Return item_id +
      // owning division so the caller can classify owned vs shared.
      const out: Array<{ item_id: string; division_id: string | null }> = []
      for (let i = 0; i < variantIds.length; i += CHUNK) {
        const slice = variantIds.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('warehouse_stock_summary')
          .select('brand_variant_id, qty, warehouse_sub_containers!inner(division_id)')
          .gt('qty', 0)
          .in('brand_variant_id', slice)
        if (error) throw error
        const rows = (data ?? []) as unknown as Array<{
          brand_variant_id: string
          warehouse_sub_containers: { division_id: string | null } | null
        }>
        for (const r of rows) {
          const itemId = variantIdToItemId.get(r.brand_variant_id)
          if (!itemId) continue
          out.push({ item_id: itemId, division_id: r.warehouse_sub_containers?.division_id ?? null })
        }
      }
      return out
    },
  })

  return useMemo<CascadeAccessibleItems>(() => {
    const items = itemsQuery.data ?? []
    const itemCategoryMap = new Map<string, string>()
    for (const it of items) itemCategoryMap.set(it.id, it.category_id)

    if (!effectiveEnabled) {
      return { accessibleItemIds: null, ownedItemIds: new Set(), itemCategoryMap, isLoading: false }
    }

    // Only report loading when there's nothing to render yet — background
    // refetches keep the last-known set on screen.
    const itemsInitialLoad = itemsQuery.isLoading && !itemsQuery.data
    const stockInitialLoad = stockQuery.isLoading && !stockQuery.data
    const isLoading = itemsInitialLoad || stockInitialLoad

    const rows = stockQuery.data ?? []
    const ownedByActive = new Set<string>()
    const hasStockAnywhere = new Set<string>()
    for (const r of rows) {
      hasStockAnywhere.add(r.item_id)
      if (r.division_id === activeDivisionId) ownedByActive.add(r.item_id)
    }

    const sharedToActive = new Set<string>()
    if (activeDivisionId) {
      for (const it of items) {
        const shares = it.shared_with_division_ids ?? []
        if (shares.includes(activeDivisionId)) sharedToActive.add(it.id)
      }
    }

    const accessible = new Set<string>(ownedByActive)
    for (const id of sharedToActive) if (hasStockAnywhere.has(id)) accessible.add(id)

    return { accessibleItemIds: accessible, ownedItemIds: ownedByActive, itemCategoryMap, isLoading }
  }, [effectiveEnabled, activeDivisionId, itemsQuery.data, itemsQuery.isLoading, stockQuery.data, stockQuery.isLoading])
}
