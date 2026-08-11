import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type RevenueCogsRow = {
  cogs_id:          string
  date:             string
  source_type:      string
  customer:         string | null
  so_no:            string | null
  sale_order_id:    string | null
  product_type:     string | null
  category:         string | null
  product_name:     string | null
  barcode:          string | null
  qty:              number
  unit_cost:        number
  total_cost:       number
  sales_price:      number | null
  total_sales:      number | null
  gross_profit:     number | null
  margin_pct:       number | null
  division_id:      string | null
  division_name:    string | null
  warehouse_id:     string | null
  warehouse_name:   string | null
  brand_variant_id: string
}

/**
 * Report 1.2 — sales value vs COGS + gross profit, one row per cost layer.
 * Dates are required. Sales price is QAR-normalized in the RPC
 * (unit_price × sale_orders.exchange_rate).
 */
export function useRevenueCogsReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['report', 'revenue-cogs', filters.start, filters.end, filters.divisionIds, filters.warehouseIds],
    enabled: enabled && !!filters.start && !!filters.end,
    queryFn: async (): Promise<RevenueCogsRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_revenue_cogs' as never, {
        p_start:           filters.start,
        p_end:             filters.end,
        p_division_ids:    filters.divisionIds.length  ? filters.divisionIds  : null,
        p_warehouse_ids:   filters.warehouseIds.length ? filters.warehouseIds : null,
        p_customer_id:     null,
        p_category_id:     null,
        p_brand_variant_id: null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as RevenueCogsRow[]) ?? []
    },
    staleTime: 60_000,
  })
}
