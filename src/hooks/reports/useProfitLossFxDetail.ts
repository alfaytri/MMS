import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type FxDetailRow = {
  payment_id:    string
  payment_date:  string
  doc_type:      string
  doc_number:    string | null
  doc_id:        string | null
  currency:      string | null
  amount:        number | null
  amount_qar:    number | null
  exchange_gain: number
  exchange_loss: number
  net_fx:        number
  counterparty:  string | null
  division_id:   string | null
  division_name: string | null
}

/** Report 2.4 — per-document breakdown behind the P&L "Exchange Gain / Loss" line. */
export function useProfitLossFxDetail(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['report', 'pnl', 'fx-detail', filters.start, filters.end, filters.divisionIds],
    enabled: enabled && !!filters.start && !!filters.end,
    queryFn: async (): Promise<FxDetailRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_pnl_fx_detail' as never, {
        p_start:        filters.start,
        p_end:          filters.end,
        p_division_ids: filters.divisionIds.length ? filters.divisionIds : null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as FxDetailRow[]) ?? []
    },
    staleTime: 60_000,
  })
}
