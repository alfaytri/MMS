import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type UnlinkedPayment = {
  id: string
  payment_id: string | null
  amount: number
  method: string
  date: string
}

export function useUnlinkedOutgoingPayments(supplierId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.supplierPayments.unlinkedOutgoing(supplierId),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('payments')
        .select('id, payment_id, amount, method, date')
        .eq('direction', 'outgoing')
        .is('invoice_id', null)
        .order('date', { ascending: false })
      if (supplierId) q = q.eq('supplier_id', supplierId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as UnlinkedPayment[]
    },
  })
}
