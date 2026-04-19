// src/hooks/useCreditNotes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CreditNoteStatus = 'draft' | 'approved' | 'issued' | 'redeemed'

export type CreditNoteLine = {
  id: string
  credit_note_id: string
  invoice_line_id: string | null
  description: string
  qty: number
  unit_price: number
  total: number
  created_at: string
}

export type CreditNote = {
  id: string
  credit_note_id: string
  invoice_id: string
  customer_name: string
  reason: string
  type: string
  status: CreditNoteStatus | null
  total_amount: number
  created_at: string
  updated_at: string
  credit_note_lines?: CreditNoteLine[]
  // joined
  invoice_display?: string
}

export type CreateCreditNotePayload = {
  invoice_id: string
  customer_name: string
  reason: string
  lines: {
    invoice_line_id: string | null
    description: string
    qty: number
    unit_price: number
  }[]
}

export function useCreditNotes() {
  return useQuery({
    queryKey: ['credit-notes'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_notes')
        .select('*, credit_note_lines(*), invoices(invoice_id)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((cn: any) => ({
        ...cn,
        invoice_display: cn.invoices?.invoice_id ?? null,
      })) as CreditNote[]
    },
  })
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateCreditNotePayload) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('credit_notes')
        .select('*', { count: 'exact', head: true })
      const credit_note_id = `CN-${String((count ?? 0) + 1).padStart(5, '0')}`
      const totalAmount = payload.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

      const { data: cn, error } = await (supabase as any)
        .from('credit_notes')
        .insert({
          credit_note_id,
          invoice_id: payload.invoice_id,
          customer_name: payload.customer_name,
          reason: payload.reason,
          type: 'manual',
          status: 'draft',
          total_amount: totalAmount,
        })
        .select()
        .single()
      if (error) throw error

      if (payload.lines.length > 0) {
        const { error: lErr } = await (supabase as any)
          .from('credit_note_lines')
          .insert(
            payload.lines.map((l) => ({
              credit_note_id: cn.id,
              invoice_line_id: l.invoice_line_id,
              description: l.description,
              qty: l.qty,
              unit_price: l.unit_price,
            }))
          )
        if (lErr) throw lErr
      }
      return cn as CreditNote
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credit-notes'] }),
  })
}

export function useApplyCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }) => {
      const supabase = createClient()
      // Get CN total and invoice outstanding
      const { data: cn } = await (supabase as any)
        .from('credit_notes')
        .select('total_amount, invoice_id')
        .eq('id', id)
        .single()

      const { data: payments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', invoiceId)
        .eq('direction', 'incoming')
      const alreadyPaid = (payments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: inv } = await (supabase as any)
        .from('invoices')
        .select('total_amount, customer_id')
        .eq('id', invoiceId)
        .single()
      const outstanding = (inv?.total_amount ?? 0) - alreadyPaid
      const cnTotal = cn?.total_amount ?? 0
      const excess = Math.max(0, cnTotal - outstanding)

      // Record credit note as a payment
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
      const payment_id = `CPAY-${String((count ?? 0) + 1).padStart(5, '0')}`
      await (supabase as any).from('payments').insert({
        payment_id,
        invoice_id: invoiceId,
        amount: Math.min(cnTotal, outstanding),
        method: 'online',
        date: new Date().toISOString().split('T')[0],
        notes: `Credit note ${cn.credit_note_id ?? id} applied`,
        direction: 'incoming',
        status: 'completed',
      })

      // If excess: store in customers.credit_balance
      if (excess > 0 && inv?.customer_id) {
        await (supabase as any).rpc('increment_credit_balance', {
          p_customer_id: inv.customer_id,
          p_amount: excess,
        })
      }

      // Mark credit note as redeemed
      await (supabase as any)
        .from('credit_notes')
        .update({ status: 'redeemed' })
        .eq('id', id)

      // Update invoice payment_status
      const newPaid = alreadyPaid + Math.min(cnTotal, outstanding)
      const newStatus =
        newPaid >= (inv?.total_amount ?? Infinity) ? 'paid' : 'partially_paid'
      await (supabase as any)
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', invoiceId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}
