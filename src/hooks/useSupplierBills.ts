// src/hooks/useSupplierBills.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Bill, BillLineItem, PaymentPlan } from '@/types/invoice'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

export type { Bill }

export type BillFilters = {
  search?: string
  payment_status?: Bill['payment_status'] | ''
  supplier_id?: string
}

export function useSupplierBills(filters?: BillFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.supplierBills.list(filters),
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('bills')
        .select(`
          *,
          bill_line_items(*),
          suppliers(name),
          purchase_orders(po_number)
        `)
        .order('created_at', { ascending: false })
      if (filters?.payment_status) q = q.eq('payment_status', filters.payment_status)
      if (filters?.search) {
        q = q.or(`bill_number.ilike.%${filters.search}%`)
      }
      if (filters?.supplier_id) q = q.eq('supplier_id', filters.supplier_id)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((b) => ({
        ...b,
        supplier_name: b.suppliers?.name ?? null,
        po_number: b.purchase_orders?.po_number ?? null,
      })) as Bill[]
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
        .from('bills')
        .select('*, bill_line_items(*), suppliers(name), purchase_orders(po_number, po_line_items(*))')
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        ...data,
        supplier_name: (data as unknown as { suppliers?: { name: string } | null }).suppliers?.name ?? null,
        po_number: (data as unknown as { purchase_orders?: { po_number: string } | null }).purchase_orders?.po_number ?? null,
      } as unknown as Bill
    },
  })
}

export type POBillRow = {
  id: string
  bill_number: string
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
        .from('bills')
        .select('id, bill_number, payment_status, total_amount, paid_amount, due_date, issued_date, created_at')
        .eq('purchase_order_id', poId!)
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
        match_status: BillLineItem['match_status']
        match_note: string | null
      }[]
    }) => {
      const supabase = createClient()

      // rpc_create_purchase_bill runs the header + lines insert
      // atomically and enforces 0 ≤ discount ≤ subtotal server-side.
      // See migration 20260806160000.
      const { data: billJson, error: rpcErr } = await supabase.rpc(
        'rpc_create_purchase_bill',
        { p_payload: payload as unknown as import('@/types/database.types').Json },
      )
      if (rpcErr) {
        throw new Error(
          `Create bill failed: ${rpcErr.code} ${rpcErr.message}` +
          `${rpcErr.details ? ' — ' + rpcErr.details : ''}` +
          `${rpcErr.hint ? ' (' + rpcErr.hint + ')' : ''}`,
        )
      }
      const bill = billJson as unknown as Bill
      void logActivity({
        action: 'Bill Created',
        module: 'bills',
        entity_id: bill.id,
        entity_type: 'bill',
        new_data: bill as unknown as Record<string, unknown>,
      })
      return bill
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.supplierBills.all }),
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
  bill: Bill & {
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
          .from('bills')
          .select(`
            *,
            bill_line_items(*),
            suppliers(name, contact_name, phone, email, address),
            purchase_orders(po_number, created_date, currency)
          `)
          .eq('id', id!)
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
          .eq('bill_id', id!)
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

