// src/hooks/useUnlinkedArInvoices.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type UnlinkedArInvoice = {
  id: string
  invoice_id: string   // display string e.g. "INV-00003"
  total_amount: number | null
  payment_status: string
  issued_date: string
}

// customerId is required — prevents cross-customer data leak
export function useUnlinkedArInvoices(customerId: string) {
  return useQuery({
    queryKey: ['unlinked-ar-invoices', customerId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select('id, invoice_id, total_amount, payment_status, issued_date')
        .eq('direction', 'ar')
        .eq('customer_id', customerId)
        .in('payment_status', ['unpaid', 'partially_paid'])
        .order('issued_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as UnlinkedArInvoice[]
    },
    enabled: !!customerId,
  })
}
