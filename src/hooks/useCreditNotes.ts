'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'
import type { DebitNote } from '@/types/invoice'

export type CreditNoteStatus = 'draft' | 'approved' | 'issued' | 'redeemed'

export type CreditNoteLine = {
  id: string
  credit_note_id: string
  invoice_line_id: string | null
  description: string | null
  sku: string | null
  qty: number
  unit_price: number
  total: number
  line_type: 'original' | 'returned'
  condition: string | null
  condition_notes: string | null
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
  reason: string
  type: string
  status: CreditNoteStatus | null
  total_amount: number
  original_total: number | null
  new_total: number | null
  currency?: string | null
  source_return_id: string | null
  resolution_type: 'refund' | 'replacement' | 'store_credit' | null
  refund_method: string | null
  refund_reference: string | null
  credit_note_lines?: CreditNoteLine[]
  created_at: string
  updated_at: string
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
  if (type === 'credit') {
    const { data } = await supabase
      .from('credit_notes')
      .select('credit_note_id')
      .ilike('credit_note_id', 'CN-%')
      .order('credit_note_id', { ascending: false })
      .limit(1)
      .maybeSingle()
    const last = data?.credit_note_id
      ? parseInt((data.credit_note_id as string).replace('CN-', ''), 10)
      : 0
    return `CN-${String(last + 1).padStart(5, '0')}`
  }
  // debit — query the separate debit_notes table
  const { data } = await supabase
    .from('debit_notes')
    .select('debit_note_id')
    .ilike('debit_note_id', 'DN-%')
    .order('debit_note_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  const last = data?.debit_note_id
    ? parseInt((data.debit_note_id as string).replace('DN-', ''), 10)
    : 0
  return `DN-${String(last + 1).padStart(5, '0')}`
}

export function useCreditNotes() {
  return useQuery({
    queryKey: queryKeys.creditNotes.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('credit_notes')
        .select('*, credit_note_lines(*), so_invoices!credit_notes_invoice_id_fkey(invoice_id), so_po_returns!source_return_id(return_number)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((cn) => ({
        ...cn,
        invoice_display: cn.so_invoices?.invoice_id ?? null,
        return_number: cn.so_po_returns?.return_number ?? null,
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
        .from('debit_notes')
        .select('*, debit_note_lines(*), so_po_returns!source_return_id(return_number), purchase_orders!debit_notes_purchase_order_id_fkey(po_number)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((dn) => ({
        ...dn,
        return_number: dn.so_po_returns?.return_number ?? null,
        po_number: dn.purchase_orders?.po_number ?? null,
      })) as unknown as DebitNote[]
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
      const alreadyPaid = (payments ?? []).reduce((s: number, p) => s + p.amount, 0)

      const { data: inv } = await supabase
        .from('so_invoices')
        .select('total_amount, customer_id')
        .eq('id', invoiceId)
        .single()
      const outstanding = (inv?.total_amount ?? 0) - alreadyPaid
      const cnTotal = cn?.total_amount ?? 0

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
        method: 'online_transfer',
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
        .from('so_invoices')
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
      // Customer is only needed for the activity log. The CN is the
      // authoritative record; resolving customer isn't strictly required to
      // flip resolution_type. Try invoice first, then fall back to the
      // linked return's source SO, but don't hard-fail if neither yields one
      // (some CNs are created from returns with no invoice link).
      let resolvedCustomerId: string | null = null
      if (input.invoiceId) {
        const { data: inv } = await supabase
          .from('so_invoices')
          .select('customer_id')
          .eq('id', input.invoiceId)
          .maybeSingle()
        resolvedCustomerId = inv?.customer_id ?? null
      }
      if (!resolvedCustomerId) {
        const { data: cn } = await supabase
          .from('credit_notes')
          .select('source_return_id')
          .eq('id', input.creditNoteId)
          .maybeSingle()
        if (cn?.source_return_id) {
          const { data: ret } = await supabase
            .from('so_po_returns')
            .select('source_type, source_id')
            .eq('id', cn.source_return_id)
            .maybeSingle()
          if (ret?.source_type === 'sale_order' && ret.source_id) {
            const { data: so } = await supabase
              .from('sale_orders')
              .select('customer_id')
              .eq('id', ret.source_id)
              .maybeSingle()
            resolvedCustomerId = so?.customer_id ?? null
          }
        }
      }
      // Note: resolvedCustomerId can still be null; we log it either way.

      // Store-credit resolution marks the credit note; the "credit balance"
      // is derived from credit_notes at read time (customers.credit_balance
      // column was dropped 2026-07-24).

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
        .from('debit_notes')
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
        .from('debit_notes')
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
