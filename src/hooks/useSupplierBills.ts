// src/hooks/useSupplierBills.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ApInvoice, InvoiceLineItem, PaymentPlan } from '@/types/invoice'
import { queryKeys } from '@/lib/queryKeys'

export type { ApInvoice }

export type BillFilters = {
  search?: string
  doc_status?: ApInvoice['doc_status'] | ''
  payment_status?: ApInvoice['payment_status'] | ''
  supplier_id?: string
}

export function useSupplierBills(filters?: BillFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.supplierBills.list(filters),
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
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
      if (filters?.supplier_id) q = q.eq('supplier_id', filters.supplier_id)
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
    queryKey: queryKeys.supplierBills.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('supplier_bills')
        .select('*, invoice_line_items(*), suppliers(name), purchase_orders(po_number, po_line_items(*))')
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        ...data,
        supplier_name: (data as unknown as { suppliers?: { name: string } | null }).suppliers?.name ?? null,
        po_number: (data as unknown as { purchase_orders?: { po_number: string } | null }).purchase_orders?.po_number ?? null,
      } as unknown as ApInvoice
    },
  })
}

export type POBillRow = {
  id: string
  invoice_id: string
  doc_status: string
  payment_status: string
  total_amount: number
  paid_amount: number
  due_date: string | null
  issued_date: string | null
  created_at: string
}

export function useBillsByPO(poId: string | null) {
  return useQuery({
    queryKey: queryKeys.supplierBills.byPo(poId),
    enabled: !!poId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_id, doc_status, payment_status, total_amount, paid_amount, due_date, issued_date, created_at')
        .eq('purchase_order_id', poId!)
        .eq('direction', 'ap')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as POBillRow[]
    },
  })
}

export function useCreateBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      supplier_id: string
      purchase_order_id: string
      po_number: string
      discount_amount: number
      discount_label: string | null
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

      // Count existing AP bills for this PO to generate PO-XXXXX-Bn ID
      const { count: billCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('purchase_order_id', payload.purchase_order_id)
        .eq('direction', 'ap')
      const invoiceIdDisplay = `${payload.po_number}-B${(billCount ?? 0) + 1}`

      const today = new Date().toISOString().split('T')[0]
      const subtotal = payload.line_items.reduce((s, l) => s + l.total, 0)
      const discount = payload.discount_amount ?? 0
      const totalAmount = subtotal - discount

      const { data: bill, error } = await supabase
        .from('invoices')
        .insert({
          invoice_id:        invoiceIdDisplay,
          direction:         'ap',
          supplier_id:       payload.supplier_id,
          purchase_order_id: payload.purchase_order_id,
          receival_id:       payload.receival_id,
          doc_status:        'draft',
          payment_status:    'unpaid',
          needs_refresh:     false,
          source:            'order',
          source_id:         payload.purchase_order_id,
          source_label:      payload.source_label ?? null,
          subtotal:          subtotal,
          discount_amount:   discount,
          discount_label:    payload.discount_label ?? null,
          total_amount:      totalAmount,
          tax:               0,
          issued_date:       today,
          due_date:          payload.due_date,
          notes:             payload.notes || null,
          status:            'draft',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.line_items.length > 0) {
        const { error: liErr } = await supabase
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.supplierBills.all }),
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
      const { error } = await supabase
        .from('invoices')
        .update({ doc_status: action })
        .eq('id', id)
        .eq('direction', 'ap')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierBills.all })
    },
  })
}

export type BillPayment = {
  id: string
  payment_id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  status: string
  full_amount?: number
}

export type BillReceival = {
  id: string
  receival_number: string
  date: string
  status: string
  receival_items: {
    id: string
    item_name: string
    sku: string | null
    qty_received: number
    is_free: boolean
  }[]
}

export type BillViewModel = {
  bill: ApInvoice & {
    paid_amount: number | null
    suppliers: {
      name: string
      contact_name: string | null
      phone: string | null
      email: string | null
      address: string | null
    } | null
    purchase_orders: {
      po_number: string
      created_date: string
      currency: string
    } | null
  }
  payments: BillPayment[]
  paymentPlan: PaymentPlan | null
  receival: BillReceival | null
}

export function useBillViewModel(id: string | null) {
  return useQuery({
    queryKey: queryKeys.supplierBills.viewModelById(id),
    enabled: !!id,
    queryFn: async (): Promise<BillViewModel> => {
      const supabase = createClient()

      const [billResult, paymentsResult, planResult] = await Promise.all([
        supabase
          .from('invoices')
          .select(`
            *,
            invoice_line_items(*),
            suppliers(name, contact_name, phone, email, address),
            purchase_orders(po_number, created_date, currency)
          `)
          .eq('id', id!)
          .eq('direction', 'ap')
          .single(),
        supabase
          .from('payment_bill_allocations')
          .select(`
            id,
            amount,
            payments (
              id,
              payment_id,
              method,
              date,
              reference,
              notes,
              status,
              amount
            )
          `)
          .eq('bill_id', id!)
          .order('created_at', { ascending: false }),
        supabase
          .from('payment_plans')
          .select('*, payment_installments(*)')
          .eq('invoice_id', id!)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (billResult.error) throw billResult.error
      if (paymentsResult.error) throw paymentsResult.error

      let receival: BillReceival | null = null
      if (billResult.data?.receival_id) {
        const { data } = await supabase
          .from('receivals')
          .select('id, receival_number, date, status, receival_items(id, item_name, sku, qty_received, is_free)')
          .eq('id', billResult.data.receival_id)
          .single()
        receival = data as unknown as BillReceival | null
      }

      return {
        bill: billResult.data as unknown as BillViewModel['bill'],
        payments: (paymentsResult.data ?? [] as { id: string; amount: number; payments: { payment_id: string; method: string; date: string; reference: string | null; notes: string | null; status: string; amount: number } | null }[]).map((alloc) => ({
          id:          alloc.id,
          payment_id:  alloc.payments?.payment_id ?? '—',
          amount:      alloc.amount,
          method:      alloc.payments?.method ?? '',
          date:        alloc.payments?.date ?? '',
          reference:   alloc.payments?.reference ?? null,
          notes:       alloc.payments?.notes ?? null,
          status:      alloc.payments?.status ?? '',
          full_amount: alloc.payments?.amount ?? 0,
        })),
        paymentPlan: planResult.data as unknown as PaymentPlan | null,
        receival,
      }
    },
  })
}

export function useMarkBillPaymentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ billId, status }: { billId: string; status: 'paid' | 'unpaid' }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('invoices')
        .update({
          payment_status: status,
          manually_paid: status === 'paid',
        })
        .eq('id', billId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierBills.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierBills.viewModel })
    },
  })
}
