import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// PostgREST URL-length cap — chunk every .in() lookup fed by `ids`/`bvIds` at
// this size (mirrors useCascadeAccessibleItems). Without it, a category with
// enough items/brand-variants can produce a query string long enough that the
// request itself fails — the hook throws, and the client-side mode-toggle
// guard fails OPEN (bad UX only: the server trigger, trg_guard_tool_tracking_
// mode_switch, still blocks the actual switch either way).
const CHUNK = 200

/**
 * True when a category's items hold any tool_asset_units or any remaining FIFO
 * qty — i.e. its tool_tracking_mode is locked (can't switch). Mirrors the
 * populated-check enforced server-side by trg_guard_tool_tracking_mode_switch
 * (supabase/migrations/20260826000200_guard_tool_tracking_mode_switch.sql);
 * this client-side check only drives the dialog's disabled state for UX — the
 * DB trigger is the real enforcement and cannot be bypassed by this hook being
 * stale or skipped.
 */
export function useCategoryHasStockOrUnits(categoryId: string | null) {
  return useQuery({
    queryKey: ['category-has-stock-or-units', categoryId],
    enabled: !!categoryId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: items, error: e1 } = await supabase
        .from('inventory_items').select('id').eq('category_id', categoryId as string).limit(1000)
      if (e1) throw e1
      const ids = (items ?? []).map((r) => r.id as string)
      if (ids.length === 0) return false

      // Any tool_asset_unit for these items? Chunked + short-circuits true on
      // the first chunk that has one — this is an existence check, not a
      // collection, so there's no need to keep querying once the answer is
      // known. head:true returns no rows; the .limit(1) is budget-rule
      // compliance (harmless — count:'exact' still reflects the full
      // per-chunk match count regardless of the row-window limit).
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        const { count: unitCount, error: e2 } = await supabase
          .from('tool_asset_units').select('id', { count: 'exact', head: true }).in('item_id', slice).limit(1)
        if (e2) throw e2
        if ((unitCount ?? 0) > 0) return true
      }

      // Brand variants for these items — same `ids` array, same URL-length
      // risk as the query above, so it needs the same chunking. Unlike the
      // count check, this collects real rows (bvIds feeds the next lookup),
      // so every chunk must run and its results aggregated.
      const bvIds: string[] = []
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK)
        const { data: bvs, error: e3 } = await supabase
          .from('inventory_item_brand_variants').select('id').in('item_id', slice).limit(1000)
        if (e3) throw e3
        for (const r of bvs ?? []) bvIds.push(r.id as string)
      }
      if (bvIds.length === 0) return false

      // Any remaining FIFO qty for those brand variants? Same chunk + early-
      // exit pattern as the unit check above.
      for (let i = 0; i < bvIds.length; i += CHUNK) {
        const slice = bvIds.slice(i, i + CHUNK)
        const { count: layerCount, error: e4 } = await supabase
          .from('fifo_cost_layers').select('id', { count: 'exact', head: true })
          .in('brand_variant_id', slice).gt('remaining_qty', 0).limit(1)
        if (e4) throw e4
        if ((layerCount ?? 0) > 0) return true
      }
      return false
    },
  })
}
