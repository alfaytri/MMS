import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type CogsDetailRow = {
  cogs_id:       string
  date:          string
  source_type:   'sale' | 'sale_return' | 'consumption' | 'landed_cost' | 'landed_cost_reversal'
  stream:        string | null
  item_name:     string
  code:          string | null
  reference:     string | null
  counterparty:  string | null
  qty:           number
  unit_cost:     number
  total_cost:    number
  division_id:   string | null
  division_name: string | null
}

/**
 * Per-entry breakdown behind the P&L "Total COGS" line. Scoped identically to
 * rpc_report_pnl's accrual COGS (sale / sale_return / landed_cost /
 * landed_cost_reversal, division + warehouse), so the rows reconcile with the
 * Total COGS shown on the statement.
 */
export function useProfitLossCogsDetail(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['report', 'pnl', 'cogs-detail', filters.start, filters.end, filters.divisionIds, filters.warehouseIds],
    enabled: enabled && !!filters.start && !!filters.end,
    queryFn: async (): Promise<CogsDetailRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_pnl_cogs_detail' as never, {
        p_start:         filters.start,
        p_end:           filters.end,
        p_division_ids:  filters.divisionIds.length ? filters.divisionIds : null,
        p_warehouse_ids: filters.warehouseIds.length ? filters.warehouseIds : null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as CogsDetailRow[]) ?? []
    },
    staleTime: 60_000,
  })
}
