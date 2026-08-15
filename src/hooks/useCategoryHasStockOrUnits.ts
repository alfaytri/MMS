import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

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
      const { count: unitCount, error: e2 } = await supabase
        .from('tool_asset_units').select('id', { count: 'exact', head: true }).in('item_id', ids)
      if (e2) throw e2
      if ((unitCount ?? 0) > 0) return true
      const { data: bvs, error: e3 } = await supabase
        .from('inventory_item_brand_variants').select('id').in('item_id', ids).limit(1000)
      if (e3) throw e3
      const bvIds = (bvs ?? []).map((r) => r.id as string)
      if (bvIds.length === 0) return false
      const { count: layerCount, error: e4 } = await supabase
        .from('fifo_cost_layers').select('id', { count: 'exact', head: true })
        .in('brand_variant_id', bvIds).gt('remaining_qty', 0)
      if (e4) throw e4
      return (layerCount ?? 0) > 0
    },
  })
}
