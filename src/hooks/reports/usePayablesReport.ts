import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type PayableRow = {
  bill_no:       string | null
  supplier:      string | null
  po_no:         string | null
  po_id:         string | null
  issued_date:   string | null
  due_date:      string | null
  amount:        number
  paid:          number
  due:           number
  po_currency:   string | null
  po_amount:     number | null
  status:        string
  division_id:   string | null
  division_name: string | null
}

/** Report 2.2 — outstanding supplier balances per bill, with original PO currency. */
export function usePayablesReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['report', 'payables', filters.start, filters.end, filters.divisionIds],
    enabled,
    queryFn: async (): Promise<PayableRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_accounts_payable' as never, {
        p_division_ids: filters.divisionIds.length ? filters.divisionIds : null,
        p_from:         filters.start || null,
        p_to:           filters.end   || null,
        p_supplier_id:  null,
        p_status:       null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as PayableRow[]) ?? []
    },
    staleTime: 60_000,
  })
}
