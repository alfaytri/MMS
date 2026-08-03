'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type ProductProfitabilitySummary = {
  revenue: number
  cogs: number
  gross_profit: number
  margin_pct: number | null
  prev_revenue: number
  prev_cogs: number
  prev_gross_profit: number
  prev_margin_pct: number | null
}

export type ProductProfitabilityRow = {
  brand_variant_id: string
  sku: string | null
  name: string
  brand_name: string | null
  qty: number
  revenue: number
  cogs: number
  profit: number
  margin_pct: number | null
}

export type ProductProfitabilityData = {
  summary: ProductProfitabilitySummary
  products: ProductProfitabilityRow[]
}

export type DrilldownLine = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  revenue: number
  cogs: number
  profit: number
}

export type DrilldownSO = {
  sale_order_id: string
  so_number: string
  order_date: string
  customer_name: string
  item_count: number
  revenue: number
  cogs: number
  profit: number
  margin_pct: number | null
  lines: DrilldownLine[]
}

/**
 * Fetches per-product realized COGS + revenue for the given date range.
 * Dates must be ISO YYYY-MM-DD strings (local calendar days).
 */
export function useProductProfitability(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.finance.productProfitability(from, to),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'rpc_product_profitability',
        { p_start_date: from, p_end_date: to },
      )
      if (error) throw error
      return data as ProductProfitabilityData
    },
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(from && to),
  })
}

export function useProfitabilityDrilldown(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.finance.profitabilityDrilldown(from, to),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_profitability_drilldown', {
        p_start_date: from,
        p_end_date: to,
      })
      if (error) throw error
      return (data ?? []) as DrilldownSO[]
    },
    staleTime: 5 * 60 * 1000,
    enabled: enabled && Boolean(from && to),
  })
}
