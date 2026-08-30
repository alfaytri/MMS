import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// PostgREST URL-length cap — chunk every .in() lookup fed by `ids`/`bvIds` at
// this size (mirrors useCascadeAccessibleItems). Without it, a category with
// enough items/brand-variants can produce a query string long enough that the
// request itself fails — the hook throws, and the client-side mode-toggle
// guard fails OPEN (bad UX only: the server trigger, trg_guard_tool_tracking_
// mode_switch, still blocks the actual switch either way).
const CHUNK = 200

export type CategoryStockShape = {
  /** any tool_asset_units → per-unit stock exists (blocks any mode switch). */
  hasUnits: boolean
  /** any remaining FIFO qty → bulk-shaped stock exists. */
  hasQty: boolean
}

/**
 * Reports whether a category's items hold serial units and/or bulk FIFO qty,
 * SEPARATELY — the dialog needs the distinction to mirror the server guard
 * (guard_tool_tracking_mode_switch, relaxed in
 * supabase/migrations/20260831002300): serialized → bulk is allowed when the
 * category holds ONLY bulk qty (no serial units), but any serial units, or
 * → serialized while qty exists, stays blocked. This client-side check only
 * drives the dialog's disabled state for UX — the DB trigger is the real
 * enforcement and cannot be bypassed by this hook being stale or skipped.
 */
export function useCategoryHasStockOrUnits(categoryId: string | null) {
  return useQuery<CategoryStockShape>({
    queryKey: ['category-has-stock-or-units', categoryId],
    enabled: !!categoryId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CategoryStockShape> => {
      const supabase = createClient()
      const none: CategoryStockShape = { hasUnits: false, hasQty: false }
      const { data: items, error: e1 } = await supabase
        .from('inventory_items').select('id').eq('category_id', categoryId as string).limit(1000)
      if (e1) throw e1
      const ids = (items ?? []).map((r) => r.id as string)
      if (ids.length === 0) return none

      // Any tool_asset_unit for these items? Chunked + short-circuits on the
      // first chunk that has one. head:true returns no rows; the .limit(1) is
      // budget-rule compliance (count:'exact' still reflects the full per-chunk
      // match count regardless of the row-window limit).
      let hasUnits = false
      for (let i = 0; i < ids.length && !hasUnits; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        const { count: unitCount, error: e2 } = await supabase
          .from('tool_asset_units').select('id', { count: 'exact', head: true }).in('item_id', slice).limit(1)
        if (e2) throw e2
        if ((unitCount ?? 0) > 0) hasUnits = true
      }

      // Brand variants for these items — chunked (same URL-length risk); every
      // chunk runs because bvIds feeds the qty lookup below.
      const bvIds: string[] = []
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        const { data: bvs, error: e3 } = await supabase
          .from('inventory_item_brand_variants').select('id').in('item_id', slice).limit(1000)
        if (e3) throw e3
        for (const r of bvs ?? []) bvIds.push(r.id as string)
      }
      if (bvIds.length === 0) return { hasUnits, hasQty: false }

      // Any remaining FIFO qty for those brand variants?
      let hasQty = false
      for (let i = 0; i < bvIds.length && !hasQty; i += CHUNK) {
        const slice = bvIds.slice(i, i + CHUNK)
        const { count: layerCount, error: e4 } = await supabase
          .from('fifo_cost_layers').select('id', { count: 'exact', head: true })
          .in('brand_variant_id', slice).gt('remaining_qty', 0).limit(1)
        if (e4) throw e4
        if ((layerCount ?? 0) > 0) hasQty = true
      }
      return { hasUnits, hasQty }
    },
  })
}
