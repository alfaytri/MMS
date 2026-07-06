'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

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
  brand_variant_id?: string | null
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
  purchase_order_id?: string | null
  resolution_type: 'refund' | 'replacement' | 'store_credit' | 'supplier_credit' | null
  refund_method: string | null
  refund_reference: string | null
  line_items: NotePdfData | null
  created_at: string
  updated_at: string
  credit_note_lines?: CreditNoteLine[]
  // joined
  invoice_display?: string | null
  return_number?: string | null
  po_number?: string | null
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
  const { data } = await supabase
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
    queryKey: queryKeys.creditNotes.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('credit_notes')
        .select('*, credit_note_lines(*), invoices(invoice_id), returns!source_return_id(return_number)')
        .eq('note_type', 'credit')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((cn: any) => ({
        ...cn,
        invoice_display: cn.invoices?.invoice_id ?? null,
        return_number: cn.returns?.return_number ?? null,
      })) as CreditNote[]
    },
    staleTime: 30 * 1000,
  })
}

export function useDebitNotes() {
  return useQuery({
    queryKey: queryKeys.creditNotes.debitNotes,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('credit_notes')
        .select('*, returns!source_return_id(return_number), purchase_orders!credit_notes_purchase_order_id_fkey(po_number)')
        .eq('note_type', 'debit')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((cn: any) => ({
        ...cn,
        return_number: cn.returns?.return_number ?? null,
        po_number: cn.purchase_orders?.po_number ?? null,
      })) as CreditNote[]
    },
    staleTime: 30 * 1000,
  })
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateCreditNotePayload) => {
      const supabase = createClient()
      const credit_note_id = await nextNoteId('credit')
      const totalAmount = payload.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

      const { data: cn, error } = await supabase
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
        const { error: lErr } = await supabase
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
      void logActivity({
        action: 'Credit Note Created',
        module: 'credit_notes',
        entity_id: cn.id,
        entity_type: 'credit_note',
        new_data: cn as unknown as Record<string, unknown>,
      })
      return cn as CreditNote
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.all }),
  })
}

export function useApplyCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }) => {
      const supabase = createClient()
      const { data: cn } = await supabase
        .from('credit_notes')
        .select('total_amount, invoice_id, credit_note_id')
        .eq('id', id)
        .single()

      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('invoice_id', invoiceId)
        .eq('direction', 'incoming')
      const alreadyPaid = (payments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: inv } = await supabase
        .from('invoices')
        .select('total_amount, customer_id')
        .eq('id', invoiceId)
        .single()
      const outstanding = (inv?.total_amount ?? 0) - alreadyPaid
      const cnTotal = cn?.total_amount ?? 0
      const excess = Math.max(0, cnTotal - outstanding)

      const { data: cpayMax } = await supabase
        .from('payments')
        .select('payment_id')
        .ilike('payment_id', 'CPAY-%')
        .order('payment_id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const cpayLast = cpayMax?.payment_id ? parseInt(cpayMax.payment_id.replace('CPAY-', ''), 10) : 0
      const payment_id = `CPAY-${String(cpayLast + 1).padStart(5, '0')}`
      await supabase.from('payments').insert({
        payment_id,
        invoice_id: invoiceId,
        amount: Math.min(cnTotal, outstanding),
        method: 'online',
        date: new Date().toISOString().split('T')[0],
        notes: `Credit note ${cn?.credit_note_id ?? id} applied`,
        direction: 'incoming',
        status: 'completed',
      })

      // Excess credit is now handled via explicit "Store Credit" resolution action

      await supabase
        .from('credit_notes')
        .update({ status: 'redeemed' })
        .eq('id', id)

      const newPaid = alreadyPaid + Math.min(cnTotal, outstanding)
      const newStatus =
        newPaid >= (inv?.total_amount ?? Infinity) ? 'paid' : 'partially_paid'
      await supabase
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', invoiceId)

      void logActivity({
        action: 'refund Resolution Applied',
        module: 'credit_notes',
        entity_id: id,
        entity_type: 'credit_note',
        new_data: { resolution_type: 'refund' } as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
    },
  })
}

export function useResolveCreditNoteRefund() {
  const qc = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (input: {
      creditNoteId: string
      refundMethod: string
      refundReference: string
    }) => {
      const { error } = await supabase
        .from('credit_notes')
        .update({
          resolution_type: 'refund',
          refund_method: input.refundMethod,
          refund_reference: input.refundReference,
        })
        .eq('id', input.creditNoteId)

      if (error) throw error

      void logActivity({
        action: 'refund Resolution Applied',
        module: 'credit_notes',
        entity_id: input.creditNoteId,
        entity_type: 'credit_note',
        new_data: { resolution_type: 'refund' } as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
    },
  })
}

export function useResolveCreditNoteStoreCredit() {
  const qc = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (input: {
      creditNoteId: string
      invoiceId: string
      amount: number
    }) => {
      const { data: inv } = await supabase
        .from('invoices')
        .select('customer_id')
        .eq('id', input.invoiceId)
        .single()

      if (!inv?.customer_id) throw new Error('Could not resolve customer')

      const { error: rpcError } = await supabase.rpc('increment_credit_balance', {
        p_customer_id: inv.customer_id,
        p_amount: input.amount,
      })
      if (rpcError) throw rpcError

      const { error } = await supabase
        .from('credit_notes')
        .update({ resolution_type: 'store_credit' })
        .eq('id', input.creditNoteId)

      if (error) throw error

      void logActivity({
        action: 'store_credit Resolution Applied',
        module: 'credit_notes',
        entity_id: input.creditNoteId,
        entity_type: 'credit_note',
        new_data: { resolution_type: 'store_credit' } as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
    },
  })
}

export function useResolveCreditNoteReplacement() {
  const qc = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (creditNoteId: string) => {
      const { error } = await supabase
        .from('credit_notes')
        .update({ resolution_type: 'replacement' })
        .eq('id', creditNoteId)

      if (error) throw error

      void logActivity({
        action: 'replacement Resolution Applied',
        module: 'credit_notes',
        entity_id: creditNoteId,
        entity_type: 'credit_note',
        new_data: { resolution_type: 'replacement' } as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
    },
  })
}

export function useResolveDebitNoteSupplierCredit() {
  const qc = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (debitNoteId: string) => {
      const { error } = await supabase
        .from('credit_notes')
        .update({ resolution_type: 'supplier_credit' })
        .eq('id', debitNoteId)
      if (error) throw error

      void logActivity({
        action: 'supplier_credit Resolution Applied',
        module: 'debit_notes',
        entity_id: debitNoteId,
        entity_type: 'debit_note',
        new_data: { resolution_type: 'supplier_credit' } as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes.debitNotes })
    },
  })
}

export function useResolveDebitNoteReplacement() {
  const qc = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (debitNoteId: string) => {
      const { error } = await supabase
        .from('credit_notes')
        .update({ resolution_type: 'replacement' })
        .eq('id', debitNoteId)
      if (error) throw error

      void logActivity({
        action: 'replacement Resolution Applied',
        module: 'debit_notes',
        entity_id: debitNoteId,
        entity_type: 'debit_note',
        new_data: { resolution_type: 'replacement' } as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes.debitNotes })
    },
  })
}
