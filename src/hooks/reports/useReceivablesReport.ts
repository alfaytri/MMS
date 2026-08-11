import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ReportFilters } from '@/components/reports/ReportFilterBar'

export type ReceivableRow = {
  invoice_no:    string | null
  customer:      string | null
  so_no:         string | null
  sale_order_id: string | null
  issued_date:   string | null
  due_date:      string | null
  amount:        number
  paid:          number
  due:           number
  status:        string
  division_id:   string | null
  division_name: string | null
}

/** Report 2.1 — outstanding customer balances per invoice (so_invoices). */
export function useReceivablesReport(filters: ReportFilters, enabled = true) {
  return useQuery({
    queryKey: ['report', 'receivables', filters.start, filters.end, filters.divisionIds],
    enabled,
    queryFn: async (): Promise<ReceivableRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_report_accounts_receivable' as never, {
        p_division_ids: filters.divisionIds.length ? filters.divisionIds : null,
        p_from:         filters.start || null,
        p_to:           filters.end   || null,
        p_customer_id:  null,
        p_status:       null,
      } as never)
      if (error) throw new Error(error.message)
      return (data as unknown as ReceivableRow[]) ?? []
    },
    staleTime: 60_000,
  })
}
