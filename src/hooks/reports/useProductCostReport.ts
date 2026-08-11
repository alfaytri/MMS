import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type ProductCostRow = {
  layer_id:         string
  po_no:            string | null
  po_id:            string | null
  product_type:     string | null
  category:         string | null
  sub_category:     string | null
  product_name:     string | null
  barcode:          string | null
  qty:              number
  unit_cost:        number
  total_cost:       number
  sales_price:      number | null
  division_id:      string | null
  division_name:    string | null
  warehouse_id:     string | null
  warehouse_name:   string | null
  brand_variant_id: string
}

/**
 * Report 1.1 — current on-hand stock valued at FIFO cost, one row per layer.
 * The RPC scopes rows through is_division_visible; `filters` only narrows
 * within the caller's visible set (empty arrays = all visible).
 */
export function useProductCostReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['report', 'product-cost', filters.divisionIds, filters.warehouseIds],
    enabled,
    queryFn: async (): Promise<ProductCostRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_product_cost' as never, {
        p_division_ids:    filters.divisionIds.length  ? filters.divisionIds  : null,
        p_warehouse_ids:   filters.warehouseIds.length ? filters.warehouseIds : null,
        p_po_id:           null,
        p_category_id:     null,
        p_brand_variant_id: null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as ProductCostRow[]) ?? []
    },
    staleTime: 60_000,
  })
}
