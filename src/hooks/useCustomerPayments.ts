// src/hooks/useCustomerPayments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CustomerPayment = {
  id: string
  payment_id: string | null
  invoice_id: string | null
  source_type: string | null
  source_id: string | null
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  direction: 'incoming'
  status: string | null
  created_at: string | null
  // joined / resolved
  invoice_display?: string | null
  customer_name?: string | null
  so_number?: string | null
}

export function useCustomerPayments(invoiceId?: string) {
  return useQuery({
    queryKey: ['customer-payments', invoiceId],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('payments')
        .select('*, invoices(invoice_id, customers(name))')
        .eq('direction', 'incoming')
        .order('date', { ascending: false })
      if (invoiceId) q = q.eq('invoice_id', invoiceId)
      const { data, error } = await q
      if (error) throw error

      // Batch-fetch SO details for payments linked to a sale_order
      const soIds: string[] = (data ?? [])
        .filter((p: any) => p.source_type === 'sale_order' && p.source_id)
        .map((p: any) => p.source_id as string)

      const soMap: Record<string, { so_number: string; customer_name: string | null }> = {}
      if (soIds.length > 0) {
        const { data: sos } = await (supabase as any)
          .from('sale_orders')
          .select('id, so_number, customers(name)')
          .in('id', soIds)
        for (const so of sos ?? []) {
          soMap[so.id] = {
            so_number: so.so_number,
            customer_name: so.customers?.name ?? null,
          }
        }
      }

      return (data ?? []).map((p: any) => {
        const soInfo = p.source_type === 'sale_order' && p.source_id ? soMap[p.source_id] : null
        return {
          ...p,
          invoice_display: p.invoices?.invoice_id ?? null,
          customer_name: p.invoices?.customers?.name ?? soInfo?.customer_name ?? null,
          so_number: soInfo?.so_number ?? null,
        }
      }) as CustomerPayment[]
    },
  })
}

export function useCreateCustomerPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string
      amount: number
      method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer' | 'pos'
      date: string
      reference: string | null
      notes: string | null
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'incoming')
      const payment_id = `CPAY-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('payments')
        .insert({
          payment_id,
          invoice_id: payload.invoice_id,
          amount: payload.amount,
          method: payload.method,
          date: payload.date,
          reference: payload.reference,
          notes: payload.notes,
          direction: 'incoming',
          status: 'completed',
        })
        .select()
        .single()
      if (error) throw error

      // Recompute invoice payment_status
      const { data: allPayments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', payload.invoice_id)
        .eq('direction', 'incoming')
      const totalPaid = (allPayments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: inv } = await (supabase as any)
        .from('invoices')
        .select('total_amount')
        .eq('id', payload.invoice_id)
        .single()
      const newStatus =
        totalPaid >= (inv?.total_amount ?? Infinity)
          ? 'paid'
          : totalPaid > 0
          ? 'partially_paid'
          : 'unpaid'

      await (supabase as any)
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', payload.invoice_id)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}
