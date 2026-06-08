// src/hooks/usePendingPayments.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type PendingInvoice = {
  id: string
  invoice_id: string
  division_id: string | null
  division_name: string | null
  source_type: string | null
  source_id: string | null
  issued_date: string
  due_date: string
  total_amount: number
  paid_amount: number
  payment_status: string
}

export type CustomerPending = {
  customer_id: string
  customer_name: string
  phone: string | null
  division_id: string | null
  division_name: string | null
  total_pending: number
  invoice_count: number
  overdue_count: number
  invoices: PendingInvoice[]
}

export function usePendingPayments() {
  return useQuery({
    queryKey: queryKeys.payments.pending,
    queryFn: async (): Promise<CustomerPending[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'get_customer_pending_balances'
      )
      if (error) throw error
      return (data ?? []) as CustomerPending[]
    },
    staleTime: 60_000,
  })
}
