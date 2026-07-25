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
        .in('status', ['issued', 'approved'])
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
 * Open (issued/approved, resolution=store_credit) credit notes for one
 * customer, joined via invoice → SO or return → SO to surface a cross-ref.
 */
export function useOpenCreditNotesForCustomer(customerId: string | null) {
  return useQuery({
    queryKey: ['open-credit-notes', customerId],
    enabled:  !!customerId,
    queryFn: async (): Promise<OpenCreditNoteRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('credit_notes')
        .select(`
          id, credit_note_id, total_amount, status, created_at, resolution_type,
          invoice_id, source_return_id,
          so_invoices:invoice_id (
            invoice_id,
            sale_orders:sale_order_id ( so_number, customer_id, currency )
          ),
          so_po_returns:source_return_id (
            return_number, source_type, source_id,
            sale_orders:source_id ( so_number, customer_id, currency )
          )
        `)
        .eq('resolution_type', 'store_credit')
        .in('status', ['issued', 'approved'])
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as {
        id: string
        credit_note_id: string
        total_amount: number
        status: string | null
        created_at: string
        so_invoices: {
          invoice_id: string | null
          sale_orders: { so_number: string | null; customer_id: string | null; currency: string | null } | null
        } | null
        so_po_returns: {
          return_number: string | null
          source_type: string | null
          source_id: string | null
          sale_orders: { so_number: string | null; customer_id: string | null; currency: string | null } | null
        } | null
      }[]
      return rows
        .map((r) => {
          const invSo = r.so_invoices?.sale_orders ?? null
          const retSo = r.so_po_returns?.source_type === 'sale_order' ? (r.so_po_returns?.sale_orders ?? null) : null
          const soRow = invSo ?? retSo
          return {
            row: r,
            customer_id: soRow?.customer_id ?? null,
            currency:    soRow?.currency ?? 'QAR',
            reference:   soRow?.so_number ?? r.so_invoices?.invoice_id ?? r.so_po_returns?.return_number ?? null,
          }
        })
        .filter((x) => x.customer_id === customerId)
        .map((x) => ({
          id:          x.row.id,
          note_number: x.row.credit_note_id,
          amount:      Number(x.row.total_amount ?? 0),
          currency:    x.currency,
          created_at:  x.row.created_at,
          status:      x.row.status,
          reference:   x.reference,
          detail_url:  `/sales/credit-notes?cn=${x.row.id}`,
        }))
    },
    staleTime: 30_000,
  })
}
