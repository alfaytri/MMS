// src/hooks/useSupplierPayments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type SupplierPayment = {
  id: string
  payment_id: string
  invoice_id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  direction: 'outgoing'
  status: string | null
  created_at: string | null
  // joined
  invoice_display?: string   // invoice_id (display)
  supplier_name?: string
}

export function useSupplierPayments(billId?: string) {
  return useQuery({
    queryKey: ['supplier-payments', billId],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('payments')
        .select('*, invoices(invoice_id, suppliers(name))')
        .eq('direction', 'outgoing')
        .order('date', { ascending: false })
      if (billId) q = q.eq('invoice_id', billId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((p: any) => ({
        ...p,
        invoice_display: p.invoices?.invoice_id ?? null,
        supplier_name: p.invoices?.suppliers?.name ?? null,
      })) as SupplierPayment[]
    },
  })
}

export function useCreateSupplierPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string        // UUID (invoices.id)
      amount: number
      method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer'
      date: string
      reference: string | null
      notes: string | null
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'outgoing')
      const payment_id = `SPAY-${String((count ?? 0) + 1).padStart(5, '0')}`

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
          direction: 'outgoing',
          status: 'completed',
        })
        .select()
        .single()
      if (error) throw error

      // Recompute bill payment_status
      const { data: allPayments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', payload.invoice_id)
        .eq('direction', 'outgoing')
      const totalPaid = (allPayments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: bill } = await (supabase as any)
        .from('invoices')
        .select('total_amount')
        .eq('id', payload.invoice_id)
        .single()
      const newStatus =
        totalPaid >= (bill?.total_amount ?? Infinity)
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
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] })
    },
  })
}
