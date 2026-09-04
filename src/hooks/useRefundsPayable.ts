'use client'
// Refund liability from money-path SO cancellation: the open standalone refund
// credit notes (customer_refunds_payable view) + the settle action that records
// the outgoing cash and closes the note (rpc_settle_refund_credit_note).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type RefundPayable = {
  credit_note_id:  string
  note_number:     string
  customer_id:     string | null
  currency:        string
  amount_remaining: number
  invoice_number:  string | null
  so_number:       string | null
  created_at:      string
}

export function useRefundsPayable() {
  return useQuery({
    queryKey: ['refunds-payable'],
    staleTime: 30_000,
    queryFn: async (): Promise<RefundPayable[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_refunds_payable' as never)
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as RefundPayable[]
    },
  })
}

export function useSettleRefund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { creditNoteId: string; amount: number; method: string; reference: string | null }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_settle_refund_credit_note' as never, {
        p_credit_note_id: input.creditNoteId,
        p_amount:         input.amount,
        p_method:         input.method,
        p_reference:      input.reference,
      } as never)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['refunds-payable'] })
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
    },
  })
}
