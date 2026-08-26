'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeadStockStatus = 'active' | 'slow_moving' | 'at_risk' | 'dead'

export type DeadStockItem = {
  brand_variant_id:     string
  item_name:            string
  category_name:        string | null
  brand:                string | null
  sku:                  string | null
  stock_level:          number
  average_cost:         number
  total_value:          number
  last_movement_date:   string | null
  last_movement_source: 'movement' | 'fifo' | 'created' | null
  days_idle:            number
  status:               DeadStockStatus
}

export function classifyDeadStock(days: number): DeadStockStatus {
  if (days <= 30)  return 'active'
  if (days <= 90)  return 'slow_moving'
  if (days <= 180) return 'at_risk'
  return 'dead'
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDeadStockReport(divisionIds: string[] = []) {
  // Division-scope via the top-bar view: pass p_division_ids so the RPC reports
  // per-division on-hand (from FIFO). Empty = "All" (no arg → RPC default NULL).
  const divKey = [...divisionIds].sort().join(',')
  return useQuery({
    queryKey: [...queryKeys.deadStock.all, divKey],
    queryFn: async () => {
      const supabase = createClient()
      // p_division_ids isn't in the generated RPC types yet — cast the args.
      const { data, error } = divisionIds.length
        ? await supabase.rpc('get_dead_stock_report', { p_division_ids: divisionIds } as never)
        : await supabase.rpc('get_dead_stock_report')
      if (error) throw error
      return (data ?? []) as DeadStockItem[]
    },
    staleTime: 10 * 60 * 1000,
  })
}
