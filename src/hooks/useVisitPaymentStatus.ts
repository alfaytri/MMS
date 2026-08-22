import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type PaymentStatus = 'paid' | 'unpaid' | 'unknown'

export interface VisitPaymentInfo {
  status: PaymentStatus
  invoice_number: string | null
  total_amount: number | null
  payment_method: string | null
}

/**
 * Fetch the payment status for a completed visit by looking up its tl_invoice
 * (team-leader invoice). Returns 'unknown' when nothing has been billed yet.
 *
 * Only call when the visit is completed; otherwise pass null to skip the query.
 */
export function useVisitPaymentStatus(visitId: string | null, enabled: boolean) {
  return useQuery<VisitPaymentInfo>({
    queryKey: ['visit-payment-status', visitId],
    enabled: !!visitId && enabled,
    queryFn: async () => {
      if (!visitId) return { status: 'unknown', invoice_number: null, total_amount: null, payment_method: null }
      const supabase = createClient()
      const { data } = await supabase
        .from('tl_invoices')
        .select('invoice_number, payment_status, total_amount, payment_methods(name)')
        .eq('visit_id', visitId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!data) return { status: 'unknown', invoice_number: null, total_amount: null, payment_method: null }
      const pm = (data as { payment_methods?: { name?: string } | null }).payment_methods
      const ps = (data.payment_status ?? '').toString().toLowerCase()
      return {
        status: ps === 'paid' ? 'paid' : ps === 'unpaid' ? 'unpaid' : 'unknown',
        invoice_number: data.invoice_number,
        total_amount: data.total_amount,
        payment_method: pm?.name ?? null,
      }
    },
    staleTime: 30_000,
  })
}
