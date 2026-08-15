import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { LineType } from '@/components/purchase/PoLineItemsEditor'

export interface CascadeAccessibleItems {
  /**
   * Item IDs the active division can access. Meaning depends on which side
   * called the hook (see `requireStock` on the hook signature below):
   *  - Buy side (`requireStock=false`): items assigned to the active division
   *    in `inventory_item_divisions` — purchasable regardless of stock.
   *  - Consume/sell side (`requireStock=true`): items the active division
   *    physically owns stock of. Identical to `ownedItemIds` in this mode.
   *
   * `null` when the filter should not be applied (no active division, or the
   * caller opted out via the enabled flag).
   */
  accessibleItemIds: Set<string> | null
  /**
   * Items where the active division is the physical owner (holds stock).
   * Always empty on the buy side (`requireStock=false`) — ownership isn't
   * evaluated there. On the consume/sell side this is the same set as
   * `accessibleItemIds`, kept as a distinct field for callers that render
   * "owned" separately from "accessible".
   */
  ownedItemIds: Set<string>
  itemCategoryMap: Map<string, string>
  isLoading: boolean
}

/**
 * Phase D.12 Task 3 helper — powers the buy-side (PO) and consume-side
 * cascade pickers' division-aware filter. Runs only for the four inventory
 * line types that flow through the cascade (products / spare-parts /
 * consumables / tools).
 *
 * When `enabled` is false, or `activeDivisionId` is null, or `type` is not
 * a filterable line type, every field is empty and `accessibleItemIds` is
 * null (i.e. no filter). Callers should treat null as "show everything".
 *
 * Filter logic depends on `requireStock`:
 *  - Buy side (`requireStock=false`): accessible = items assigned to the
 *    active division via `inventory_item_divisions`, regardless of stock.
 *  - Consume/sell side (`requireStock=true`): accessible = items the active
 *    division owns stock of. No cross-division consumption — stock moves
 *    between divisions via a transfer, not a share.
 */
export function useCascadeAccessibleItems(
  type: LineType,
  activeDivisionId: string | null,
  enabled: boolean,
  /** Consume/sell side (default) requires the active division to own stock of
   *  the item. Buy side (PO) passes false: an item assigned to the division is
   *  purchasable regardless of current stock — requiring stock would hide
   *  every item on a fresh catalog. */
  requireStock: boolean = true,
): CascadeAccessibleItems {
  // Tools are no longer blanket-excluded: BULK tool categories are qty (they
  // flow through this filter). SERIALIZED tool categories are pruned by the
  // tool_tracking_mode='bulk' filter on the items query below.
  const isFilterable = true
  const effectiveEnabled = enabled && !!activeDivisionId && isFilterable

  const itemsQuery = useQuery({
    queryKey: ['cascade-accessible', 'items', type],
    enabled: effectiveEnabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_items')
        .select('id, category_id, inventory_categories!inner(type, tool_tracking_mode)')
        .neq('status', 'archived')
        .eq('inventory_categories.type', type as 'products' | 'spare-parts' | 'consumables' | 'tools')
        .limit(5000)
      // Only bulk tool categories are qty. Serialized tools stay asset-tracked
      // and must never appear in the cascade (PO/receival/consume) picker.
      if (type === 'tools') q = q.eq('inventory_categories.tool_tracking_mode', 'bulk')
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as Array<{ id: string; category_id: string }>
    },
  })

  const itemsReady = !!itemsQuery.data
  const itemsCount = itemsQuery.data?.length ?? 0

  const stockQuery = useQuery({
    queryKey: ['cascade-accessible', 'stock', type, itemsCount],
    enabled: effectiveEnabled && itemsReady && itemsCount > 0 && requireStock,
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

  // Buy side (PO): membership = items explicitly assigned to the active division
  // via inventory_item_divisions — the join table that supersedes the old
  // per-item division-sharing array column. An assigned item is purchasable
  // regardless of current stock.
  const assignmentQuery = useQuery({
    queryKey: ['cascade-accessible', 'assignment', type, activeDivisionId],
    enabled: effectiveEnabled && !requireStock && !!activeDivisionId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_divisions')
        .select('item_id')
        .eq('division_id', activeDivisionId as string)
        .limit(20000)
      if (error) throw error
      return new Set((data ?? []).map((r) => r.item_id as string))
    },
  })

  return useMemo<CascadeAccessibleItems>(() => {
    const items = itemsQuery.data ?? []
    const itemCategoryMap = new Map<string, string>()
    for (const it of items) itemCategoryMap.set(it.id, it.category_id)

    if (!effectiveEnabled) {
      return { accessibleItemIds: null, ownedItemIds: new Set(), itemCategoryMap, isLoading: false }
    }

    const itemsInitialLoad = itemsQuery.isLoading && !itemsQuery.data

    // Buy side (PO): membership = items assigned to the active division.
    // Purchasable regardless of current stock (a PO is how stock is created).
    if (!requireStock) {
      const assignmentInitialLoad = assignmentQuery.isLoading && !assignmentQuery.data
      return {
        accessibleItemIds: assignmentQuery.data ?? new Set<string>(),
        ownedItemIds: new Set(),
        itemCategoryMap,
        isLoading: itemsInitialLoad || assignmentInitialLoad,
      }
    }

    // Consume/sell side: a division may only consume stock it OWNS in the active
    // division. No cross-division consumption — stock moves between divisions via
    // a transfer, not a share.
    const stockInitialLoad = stockQuery.isLoading && !stockQuery.data
    const isLoading = itemsInitialLoad || stockInitialLoad

    const rows = stockQuery.data ?? []
    const ownedByActive = new Set<string>()
    for (const r of rows) {
      if (r.division_id === activeDivisionId) ownedByActive.add(r.item_id)
    }

    return { accessibleItemIds: ownedByActive, ownedItemIds: ownedByActive, itemCategoryMap, isLoading }
  }, [effectiveEnabled, activeDivisionId, itemsQuery.data, itemsQuery.isLoading, stockQuery.data, stockQuery.isLoading, assignmentQuery.data, assignmentQuery.isLoading, requireStock])
}
