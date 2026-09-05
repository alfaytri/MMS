// src/hooks/usePendingPayments.ts
//
// Pending Payments is built on ORDER invoices (tl_invoices / SINV), grouped by
// customer via get_tl_pending_by_customer. tl_invoices carry only a
// name/phone snapshot, so the RPC resolves the real service customer by phone
// (customer_id is null when no match). See migration 20260930000800.
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type CustomerPhone = {
  id: string
  phone: string
  is_primary: boolean
  label: string | null
}

export type PendingInvoice = {
  id: string
  /** Human invoice number (SINV/YYYY/MM/NNNN). */
  invoice_id: string
  division_id: string | null
  division_name: string | null
  source_type: string | null
  source_id: string | null
  issued_date: string
  /** tl_invoices have no due date. */
  due_date: string | null
  total_amount: number
  paid_amount: number
  payment_status: string
}

export type CustomerPending = {
  /** Stable grouping key: the resolved customer id, else `phone:<snapshot>`. */
  group_key: string
  /** Resolved service-customer id, or null when the phone matched no customer. */
  customer_id: string | null
  customer_name: string
  customer_phone: string | null
  /** Whether the resolved customer is blocked (feeds the risk flag). */
  is_blocked: boolean
  phones: CustomerPhone[]
  total_pending: number
  invoice_count: number
  /** created_at of the oldest still-pending invoice — the aging cue. */
  oldest_pending_date: string | null
  invoices: PendingInvoice[]
}

export function usePendingPayments() {
  return useQuery({
    queryKey: queryKeys.payments.pending,
    queryFn: async (): Promise<CustomerPending[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_tl_pending_by_customer' as never)
      if (error) throw error
      return (data ?? []) as CustomerPending[]
    },
    staleTime: 60_000,
  })
}
