'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type StockValueCogsRow = {
  brand_variant_id: string
  sold_at_sale_total: number
  lc_adjustments_total: number
  lc_adjustment_count: number
}

export function useStockValueCogsSummary(variantIds: string[] | null) {
  return useQuery({
    queryKey: queryKeys.inventory.stockValueCogsSummary(variantIds),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_stock_value_cogs_summary', {
        p_brand_variant_ids: variantIds,
      })
      if (error) throw error
      const map = new Map<string, StockValueCogsRow>()
      for (const row of (data ?? []) as StockValueCogsRow[]) {
        map.set(row.brand_variant_id, row)
      }
      return map
    },
    staleTime: 60 * 1000,
  })
}
