// src/hooks/useOrderCustomerNotes.ts
// Customer notes on a service order card (call-centre complaint log). The mere
// presence of a note is what the QC engine reads as a "customer complaint"
// (migration 20261084: order_customer_notes + rpc_add_order_customer_note).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export interface OrderCustomerNote {
  id: string
  order_id: string
  note: string
  created_by_name: string | null
  created_at: string
}

export function useOrderCustomerNotes(orderId: string | null) {
  return useQuery<OrderCustomerNote[]>({
    queryKey: ['order-customer-notes', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const supabase = createClient()
      // order_customer_notes isn't in the generated types yet (migration 20261084) —
      // cast the table name until types are regenerated; row shape is typed locally.
      const { data, error } = (await supabase
        .from('order_customer_notes' as never)
        .select('id, order_id, note, created_by_name, created_at')
        .eq('order_id' as never, orderId as never)
        .order('created_at', { ascending: false })) as unknown as {
          data: OrderCustomerNote[] | null; error: Error | null
        }
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAddOrderCustomerNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, note }: { orderId: string; note: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc(
        'rpc_add_order_customer_note' as never,
        { p_order_id: orderId, p_note: note } as never,
      )
      if (error) throw error
    },
    onSuccess: (_d, { orderId }) => {
      qc.invalidateQueries({ queryKey: ['order-customer-notes', orderId] })
      qc.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) })
    },
  })
}
