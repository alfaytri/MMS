'use client'
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

export type NoteLineItem = {
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  total: number
}

export type NoteDebitLineItem = NoteLineItem & {
  condition?: 'defective' | 'damaged' | 'other'
  condition_notes?: string | null
}

export type NotePdfData = {
  original_lines: NoteLineItem[]
  returned_lines: NoteDebitLineItem[]
}

export type CreditNote = {
  id: string
  credit_note_id: string
  invoice_id: string | null
  customer_name: string | null
  supplier_name: string | null
  note_type: 'credit' | 'debit'
  reason: string
  type: string
  status: CreditNoteStatus | null
  total_amount: number
  original_total: number | null
  new_total: number | null
  source_return_id: string | null
  line_items: NotePdfData | null
  created_at: string
  updated_at: string
  credit_note_lines?: CreditNoteLine[]
  // joined
  invoice_display?: string | null
  return_number?: string | null
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

/** Returns the next CN-XXXXX or DN-XXXXX id (max-based, collision-safe). */
export async function nextNoteId(type: 'credit' | 'debit'): Promise<string> {
  const supabase = createClient()
  const prefix = type === 'credit' ? 'CN-' : 'DN-'
  const { data } = await (supabase as any)
    .from('credit_notes')
    .select('credit_note_id')
    .ilike('credit_note_id', `${prefix}%`)
    .order('credit_note_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  const last = data?.credit_note_id
    ? parseInt((data.credit_note_id as string).replace(prefix, ''), 10)
    : 0
  return `${prefix}${String(last + 1).padStart(5, '0')}`
}

export function useCreditNotes() {
  return useQuery({
    queryKey: ['credit-notes'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_notes')
        .select('*, credit_note_lines(*), invoices(invoice_id), returns!source_return_id(return_number)')
        .eq('note_type', 'credit')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((cn: any) => ({
        ...cn,
        invoice_display: cn.invoices?.invoice_id ?? null,
        return_number: cn.returns?.return_number ?? null,
      })) as CreditNote[]
    },
  })
}

export function useDebitNotes() {
  return useQuery({
    queryKey: ['debit-notes'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_notes')
        .select('*, returns!source_return_id(return_number)')
        .eq('note_type', 'debit')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((cn: any) => ({
        ...cn,
        return_number: cn.returns?.return_number ?? null,
      })) as CreditNote[]
    },
  })
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateCreditNotePayload) => {
      const supabase = createClient()
      const credit_note_id = await nextNoteId('credit')
      const totalAmount = payload.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

      const { data: cn, error } = await (supabase as any)
        .from('credit_notes')
        .insert({
          credit_note_id,
          invoice_id: payload.invoice_id,
          customer_name: payload.customer_name,
          reason: payload.reason,
          type: 'manual',
          note_type: 'credit',
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
      const { data: cn } = await (supabase as any)
        .from('credit_notes')
        .select('total_amount, invoice_id, credit_note_id')
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

      const { data: cpayMax } = await (supabase as any)
        .from('payments')
        .select('payment_id')
        .ilike('payment_id', 'CPAY-%')
        .order('payment_id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const cpayLast = cpayMax?.payment_id ? parseInt(cpayMax.payment_id.replace('CPAY-', ''), 10) : 0
      const payment_id = `CPAY-${String(cpayLast + 1).padStart(5, '0')}`
      await (supabase as any).from('payments').insert({
        payment_id,
        invoice_id: invoiceId,
        amount: Math.min(cnTotal, outstanding),
        method: 'online',
        date: new Date().toISOString().split('T')[0],
        notes: `Credit note ${cn?.credit_note_id ?? id} applied`,
        direction: 'incoming',
        status: 'completed',
      })

      if (excess > 0 && inv?.customer_id) {
        await (supabase as any).rpc('increment_credit_balance', {
          p_customer_id: inv.customer_id,
          p_amount: excess,
        })
      }

      await (supabase as any)
        .from('credit_notes')
        .update({ status: 'redeemed' })
        .eq('id', id)

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
