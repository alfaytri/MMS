'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type OpenCreditNoteRow = {
  id:           string
  note_number:  string     // debit_note_id or credit_note_id
  amount:       number
  currency:     string
  created_at:   string
  status:       string | null
  reference:    string | null  // PO# for DNs, invoice/return# for CNs
  detail_url:   string          // where to open the note detail in a new tab
}

/**
 * Open (issued/approved, resolution=supplier_credit) debit notes for one
 * supplier, joined with the PO so we can surface the PO number as a
 * cross-reference in the popup.
 */
export function useOpenDebitNotesForSupplier(supplierId: string | null) {
  return useQuery({
    queryKey: ['open-debit-notes', supplierId],
    enabled:  !!supplierId,
    queryFn: async (): Promise<OpenCreditNoteRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('debit_notes')
        .select(`
          id, debit_note_id, total_amount, status, created_at, resolution_type,
          purchase_orders:purchase_order_id ( po_number, supplier_id, currency )
        `)
        .eq('resolution_type', 'supplier_credit')
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as {
        id: string
        debit_note_id: string
        total_amount: number
        status: string | null
        created_at: string
        purchase_orders: { po_number: string | null; supplier_id: string | null; currency: string | null } | null
      }[]
      return rows
        .filter((r) => r.purchase_orders?.supplier_id === supplierId)
        .map((r) => ({
          id:          r.id,
          note_number: r.debit_note_id,
          amount:      Number(r.total_amount ?? 0),
          currency:    r.purchase_orders?.currency ?? 'QAR',
          created_at:  r.created_at,
          status:      r.status,
          reference:   r.purchase_orders?.po_number ?? null,
          detail_url:  `/purchase/debit-notes?dn=${r.id}`,
        }))
    },
    staleTime: 30_000,
  })
}

/**
 * Open credit notes carrying store credit for one customer. Reads the
 * customer_open_credit_notes view — derived from the Phase 7 customer
 * resolution ledger, so mixed-type CNs (refund + store_credit on the same
 * CN) surface only the store-credit portion correctly.
 */
export function useOpenCreditNotesForCustomer(customerId: string | null) {
  return useQuery({
    queryKey: ['open-credit-notes', customerId],
    enabled:  !!customerId,
    queryFn: async (): Promise<OpenCreditNoteRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_open_credit_notes')
        .select('id, note_number, customer_id, currency, status, created_at, so_number, invoice_number, return_number, amount_remaining')
        .eq('customer_id', customerId!)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as {
        id: string
        note_number: string
        customer_id: string
        currency: string
        status: string | null
        created_at: string
        so_number: string | null
        invoice_number: string | null
        return_number: string | null
        amount_remaining: number
      }[]
      return rows.map((r) => ({
        id:          r.id,
        note_number: r.note_number,
        amount:      Number(r.amount_remaining ?? 0),
        currency:    r.currency ?? 'QAR',
        created_at:  r.created_at,
        status:      r.status,
        reference:   r.so_number ?? r.invoice_number ?? r.return_number ?? null,
        detail_url:  `/sales/credit-notes?cn=${r.id}`,
      }))
    },
    staleTime: 30_000,
  })
}
