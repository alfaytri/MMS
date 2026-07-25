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
      // NOTE: We can't embed sale_orders through so_po_returns.source_id because
      // source_id is polymorphic (sale_order OR purchase_order). PostgREST 400s
      // when asked to auto-resolve that FK. So fetch the CN + its return + its
      // invoice first, then batch-fetch the sale_orders separately.
      const { data, error } = await supabase
        .from('credit_notes')
        .select(`
          id, credit_note_id, total_amount, status, created_at, resolution_type,
          invoice_id, source_return_id,
          so_invoices:invoice_id (
            invoice_id, sale_order_id
          ),
          so_po_returns:source_return_id (
            return_number, source_type, source_id
          )
        `)
        .eq('resolution_type', 'store_credit')
        .in('status', ['issued', 'approved'])
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message)

      // Batch-fetch sale_orders for both the invoice.sale_order_id and the
      // return.source_id-when-sale_order paths.
      const soIds = new Set<string>()
      for (const r of (data ?? []) as unknown as {
        so_invoices: { sale_order_id: string | null } | null
        so_po_returns: { source_type: string | null; source_id: string | null } | null
      }[]) {
        if (r.so_invoices?.sale_order_id) soIds.add(r.so_invoices.sale_order_id)
        if (r.so_po_returns?.source_type === 'sale_order' && r.so_po_returns.source_id) {
          soIds.add(r.so_po_returns.source_id)
        }
      }
      const soMap: Record<string, { so_number: string; customer_id: string | null; currency: string | null }> = {}
      if (soIds.size > 0) {
        const { data: sos } = await supabase
          .from('sale_orders')
          .select('id, so_number, customer_id, currency')
          .in('id', Array.from(soIds))
        for (const so of (sos ?? []) as { id: string; so_number: string; customer_id: string | null; currency: string | null }[]) {
          soMap[so.id] = so
        }
      }

      // Subtract already-applied payments per CN so `amount` is the REMAINING
      // balance available to redeem, not the original total.
      const cnIds = (data ?? []).map((r) => (r as { id: string }).id)
      const applied: Record<string, number> = {}
      if (cnIds.length > 0) {
        const { data: pays } = await supabase
          .from('payments')
          .select('credit_note_id, amount')
          .in('credit_note_id', cnIds)
          .eq('direction', 'incoming')
          .is('deleted_at', null)
        for (const p of (pays ?? []) as { credit_note_id: string | null; amount: number }[]) {
          if (!p.credit_note_id) continue
          applied[p.credit_note_id] = (applied[p.credit_note_id] ?? 0) + Number(p.amount ?? 0)
        }
      }
      const rows = (data ?? []) as unknown as {
        id: string
        credit_note_id: string
        total_amount: number
        status: string | null
        created_at: string
        so_invoices: { invoice_id: string | null; sale_order_id: string | null } | null
        so_po_returns: { return_number: string | null; source_type: string | null; source_id: string | null } | null
      }[]
      return rows
        .map((r) => {
          const invSoId = r.so_invoices?.sale_order_id ?? null
          const retSoId = r.so_po_returns?.source_type === 'sale_order' ? (r.so_po_returns?.source_id ?? null) : null
          const soRow = (invSoId && soMap[invSoId]) || (retSoId && soMap[retSoId]) || null
          const remaining = Number(r.total_amount ?? 0) - (applied[r.id] ?? 0)
          return {
            row: r,
            customer_id: soRow?.customer_id ?? null,
            currency:    soRow?.currency ?? 'QAR',
            reference:   soRow?.so_number ?? r.so_invoices?.invoice_id ?? r.so_po_returns?.return_number ?? null,
            remaining,
          }
        })
        .filter((x) => x.customer_id === customerId && x.remaining > 0)
        .map((x) => ({
          id:          x.row.id,
          note_number: x.row.credit_note_id,
          amount:      x.remaining,
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
