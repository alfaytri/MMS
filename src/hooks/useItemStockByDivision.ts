import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Phase D.12 helper — for a given inventory item, return the total stock
 * quantity held by each division across all its brand variants + all
 * sub-containers.
 *
 * The natural owners of an item are whichever divisions physically hold
 * stock of it. The Access & Sharing panel uses this to show operators
 * which divisions can already sell the item vs which would gain access
 * only via an explicit share.
 *
 * Returns a map keyed by division_id → total qty. Divisions with zero
 * stock are omitted; the caller can subtract from the full division list
 * to derive "no stock here".
 *
 * RLS caveat: results reflect the caller's own sub-container visibility.
 * A user without visibility into Kitchen's sub-containers won't see
 * Kitchen's totals even if Kitchen holds stock. Acceptable for admin
 * operators; deliberate leakage would be a bigger design change.
 */
export function useItemStockByDivision(itemId?: string | null) {
  return useQuery({
    queryKey: ['item-stock-by-division', itemId ?? null],
    enabled: !!itemId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!itemId) return new Map<string, number>()
      const supabase = createClient()

      // Fetch the item's brand variant ids first — the summary is keyed
      // by variant, not item.
      const { data: variants, error: vErr } = await supabase
        .from('inventory_item_brand_variants')
        .select('id')
        .eq('item_id', itemId)
      if (vErr) throw vErr

      const variantIds = (variants ?? []).map((v) => v.id as string)
      if (variantIds.length === 0) return new Map<string, number>()

      // Aggregate qty per division via the summary rows + the
      // sub-container's division_id.
      const { data: rows, error: sErr } = await supabase
        .from('warehouse_stock_summary')
        .select('qty, warehouse_sub_containers:sub_container_id(division_id)')
        .in('brand_variant_id', variantIds)
      if (sErr) throw sErr

      const byDivision = new Map<string, number>()
      for (const r of rows ?? []) {
        const row = r as unknown as {
          qty: number
          warehouse_sub_containers: { division_id: string | null } | null
        }
        const divId = row.warehouse_sub_containers?.division_id
        if (!divId) continue
        byDivision.set(divId, (byDivision.get(divId) ?? 0) + Number(row.qty ?? 0))
      }
      return byDivision
    },
  })
}
