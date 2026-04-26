'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

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

export function useDeadStockReport() {
  return useQuery({
    queryKey: ['dead_stock'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('get_dead_stock_report')
      if (error) throw error
      return (data ?? []) as DeadStockItem[]
    },
    staleTime: 10 * 60 * 1000,
  })
}
