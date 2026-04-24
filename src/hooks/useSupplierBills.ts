// src/hooks/useSupplierBills.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ApInvoice, InvoiceLineItem } from '@/types/invoice'

export type { ApInvoice }

export type BillFilters = {
  search?: string
  doc_status?: ApInvoice['doc_status'] | ''
  payment_status?: ApInvoice['payment_status'] | ''
}

export function useSupplierBills(filters?: BillFilters) {
  return useQuery({
    queryKey: ['supplier-bills', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('supplier_bills')           // queries the VIEW
        .select(`
          *,
          invoice_line_items(*),
          suppliers(name),
          purchase_orders(po_number)
        `)
        .order('created_at', { ascending: false })
      if (filters?.doc_status) q = q.eq('doc_status', filters.doc_status)
      if (filters?.payment_status) q = q.eq('payment_status', filters.payment_status)
      if (filters?.search) {
        q = q.or(`invoice_id.ilike.%${filters.search}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((b: any) => ({
        ...b,
        supplier_name: b.suppliers?.name ?? null,
        po_number: b.purchase_orders?.po_number ?? null,
      })) as ApInvoice[]
    },
  })
}

export function useSupplierBill(id: string | null) {
  return useQuery({
    queryKey: ['supplier-bill', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('supplier_bills')
        .select('*, invoice_line_items(*), suppliers(name), purchase_orders(po_number, po_line_items(*))')
        .eq('id', id)
        .single()
      if (error) throw error
      return {
        ...data,
        supplier_name: data.suppliers?.name ?? null,
        po_number: data.purchase_orders?.po_number ?? null,
      } as ApInvoice
    },
  })
}

export function useCreateBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      supplier_id: string
      purchase_order_id: string
      receival_id: string | null
      due_date: string
      source_label?: string | null
      notes: string
      line_items: {
        description: string
        qty: number
        unit_price: number
        total: number
        match_status: InvoiceLineItem['match_status']
        match_note: string | null
      }[]
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'ap')
      const invoiceIdDisplay = `BILL-${String((count ?? 0) + 1).padStart(5, '0')}`
      const today = new Date().toISOString().split('T')[0]
      const totalAmount = payload.line_items.reduce((s, l) => s + l.total, 0)

      const { data: bill, error } = await (supabase as any)
        .from('invoices')
        .insert({
          invoice_id: invoiceIdDisplay,
          direction: 'ap',
          supplier_id: payload.supplier_id,
          purchase_order_id: payload.purchase_order_id,
          receival_id: payload.receival_id,
          doc_status: 'draft',
          payment_status: 'unpaid',
          needs_refresh: false,
          source: 'order',
          source_id: payload.purchase_order_id,
          source_label: payload.source_label ?? null,
          total_amount: totalAmount,
          subtotal: totalAmount,
          tax: 0,
          issued_date: today,
          due_date: payload.due_date,
          notes: payload.notes || null,
          status: 'draft',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('invoice_line_items')
          .insert(
            payload.line_items.map((l) => ({
              invoice_id: bill.id,
              description: l.description,
              qty: l.qty,
              unit_price: l.unit_price,
              total: l.total,
              match_status: l.match_status,
              match_note: l.match_note,
            }))
          )
        if (liErr) throw liErr
      }
      return bill as ApInvoice
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['supplier-bills'] }),
  })
}

export function useApproveBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: 'pending_approval' | 'approved' | 'rejected'
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ doc_status: action })
        .eq('id', id)
        .eq('direction', 'ap')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] })
    },
  })
}
