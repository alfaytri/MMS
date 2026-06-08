'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type CogsBreakdownLcEntry = {
  lc_id: string
  lc_number: string
  applied_at: string | null
  total_cost: number
}

export type CogsBreakdown = {
  sold_at_sale: number
  lc_adjustments: CogsBreakdownLcEntry[]
  total: number
}

export function useCogsBreakdown(variantId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.inventory.cogsBreakdown(variantId ?? ''),
    enabled: !!variantId && enabled,
    queryFn: async (): Promise<CogsBreakdown> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_cogs_breakdown', {
        p_brand_variant_id: variantId,
      })
      if (error) throw error
      return data as CogsBreakdown
    },
    staleTime: 60 * 1000,
  })
}
