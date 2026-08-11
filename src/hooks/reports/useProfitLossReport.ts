import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type PnlBasis = 'accrual' | 'cash'
export type PnlStreamLine = { stream: string; amount: number }

export type PnlStatement = {
  basis:          PnlBasis
  revenue?:       PnlStreamLine[]
  cogs?:          PnlStreamLine[]
  revenue_total?: number
  cogs_total?:    number
  cash_in?:       number
  cash_out?:      number
  fx_net:         number
  scrap:          number
  gross_profit:   number
}

/** Report 2.4 — Profit & Loss statement (jsonb) for a period + basis. */
export function useProfitLossReport(filters: ReportFilters, basis: PnlBasis, enabled = true) {
  return useQuery({
    queryKey: ['report', 'pnl', filters.start, filters.end, basis, filters.divisionIds, filters.warehouseIds],
    enabled: enabled && !!filters.start && !!filters.end,
    queryFn: async (): Promise<PnlStatement | null> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_pnl' as never, {
        p_start:         filters.start,
        p_end:           filters.end,
        p_basis:         basis,
        p_division_ids:  filters.divisionIds.length  ? filters.divisionIds  : null,
        p_warehouse_ids: filters.warehouseIds.length ? filters.warehouseIds : null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as PnlStatement) ?? null
    },
    staleTime: 60_000,
  })
}
