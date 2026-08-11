import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type CashRow = {
  is_opening:     boolean
  date:           string | null
  payment_method: string | null
  doc_no:         string | null
  party:          string | null
  debit:          number | null
  credit:         number | null
  balance:        number | null
  division_id:    string | null
  division_name:  string | null
}

/** Report 2.3 — cash-equivalent movements + opening/running balance. */
export function useCashReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['report', 'cash', filters.start, filters.end, filters.divisionIds],
    enabled: enabled && !!filters.start && !!filters.end,
    queryFn: async (): Promise<CashRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_cash' as never, {
        p_start:        filters.start,
        p_end:          filters.end,
        p_division_ids: filters.divisionIds.length ? filters.divisionIds : null,
        p_method_ids:   null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as CashRow[]) ?? []
    },
    staleTime: 60_000,
  })
}
