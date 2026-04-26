import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SOStatus =
  | 'quotation'
  | 'pending_approval'
  | 'confirmed'
  | 'partial_delivery'
  | 'delivered'
  | 'invoiced'
  | 'closed'
  | 'cancelled'

export type SOLineItem = {
  id:                  string
  sale_order_id:       string
  item_name:           string
  sku:                 string | null
  qty:                 number
  unit:                string
  unit_price:          number
  total:               number
  delivered_qty:       number
  line_type:           string
  brand_variant_id:    string | null
  tool_asset_item_id:  string | null
  avg_cost:            number
  created_at:          string
}

export type SaleDelivery = {
  id: string
  delivery_number: string
  sale_order_id: string
  warehouse_id: string
  warehouse_name: string | null
  date: string
  items: {
    item_name: string
    sku: string | null
    qty_delivered: number
    brand_variant_id: string | null
  }[]
  status: string
  created_by_name: string | null
  created_at: string
}

export type SaleOrder = {
  id:                       string
  so_number:                string
  customer_id:              string
  status:                   SOStatus
  subtotal:                 number
  tax:                      number
  total:                    number
  discount_amount:          number
  discount_label:           string | null
  discount_type:            string | null
  discount_amount_resolved: number
  currency:                 string
  exchange_rate:            number
  expected_delivery:        string | null
  payment_terms:            string | null
  payment_terms_notes:      string | null
  payment_milestones:       { label: string; percent: number }[] | null
  delivery_terms:           string | null
  delivery_terms_notes:     string | null
  customer_notes:           string | null
  validity_days:            number
  notes:                    string | null
  created_by_name:          string | null
  created_at:               string
  updated_at:               string
  deleted_at:               string | null
  sale_order_lines?:        SOLineItem[]
  sale_deliveries?:         SaleDelivery[]
  customer_name?:           string
  customer_phone?:          string
}

export type SalePayment = {
  id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  currency: string
  exchange_rate: number
  amount_qar: number | null
  created_at: string
}

export type Customer = {
  id:                  string
  name:                string
  phone:               string | null
  email:               string | null
  customer_number:     string | null
  customer_type:       string | null
  is_blocked:          boolean
  credit_group_id:     string | null
  credit_group_name?:  string | null
  credit_group_limit?: number | null
}

export type SOLineItemDraft = {
  item_name:          string
  sku:                string
  qty:                number
  unit:               string
  unit_price:         number
  total:              number
  line_type:          string
  brand_variant_id:   string | null
  tool_asset_item_id: string | null
  avg_cost:           number
}

export type CreateSOPayload = {
  customer_id:          string
  intent:               'quotation' | 'confirm'
  currency:             string
  exchange_rate:        number
  expected_delivery:    string | null
  payment_terms:        string | null
  payment_terms_notes:  string | null
  payment_milestones:   { label: string; percent: number }[] | null
  delivery_terms:       string | null
  delivery_terms_notes: string | null
  customer_notes:       string | null
  validity_days:        number
  discount_amount:      number
  discount_label:       string | null
  discount_type:        'fixed' | 'percentage'
  line_items:           SOLineItemDraft[]
}

export type CreateSOResult = {
  so_id:        string
  so_number:    string
  status:       SOStatus
  credit_limit: number
  group_name:   string
  open_total:   number
  available:    number
}

export type UpdateSOPayload = Partial<CreateSOPayload> & { id: string }

export interface SOFilters {
  search?: string
  status?: SOStatus | ''
  dateFrom?: string
  dateTo?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcSOSubtotal(lineItems: { total: number }[]): number {
  return lineItems.reduce((sum, li) => sum + li.total, 0)
}

export function calcSOTotal(subtotal: number, discountAmount: number, discountType: 'fixed' | 'percentage'): number {
  const discount = discountType === 'percentage' ? (subtotal * discountAmount) / 100 : discountAmount
  return subtotal - discount
}

export function hasNegativeMargin(lineItems: { unit_price: number; avg_cost: number }[]): boolean {
  return lineItems.some((li) => li.avg_cost > 0 && li.unit_price < li.avg_cost)
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('customers')
        .select('id, name, phone, email, customer_number, customer_type, is_blocked, credit_group_id, credit_groups(name, credit_limit)')
        .order('name')
        .limit(50)
      if (search) {
        const safe = search.replace(/%/g, '\\%')
        q = q.ilike('name', `%${safe}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        credit_group_name:  row.credit_groups?.name         ?? null,
        credit_group_limit: row.credit_groups?.credit_limit ?? null,
      })) as Customer[]
    },
    staleTime: 30 * 1000,
    enabled: true,
  })
}

const CUSTOMERS_PAGE_SIZE = 50

export function useAllCustomers(search: string, page: number) {
  return useQuery({
    queryKey: ['all-customers', search, page],
    queryFn:  async () => {
      const supabase = createClient()
      const from = page * CUSTOMERS_PAGE_SIZE
      const to   = from + CUSTOMERS_PAGE_SIZE - 1
      let q = (supabase as any)
        .from('customers')
        .select('id, name, phone, email, customer_type, is_blocked, credit_group_id, credit_groups(name, credit_limit)', { count: 'exact' })
        .order('name')
        .range(from, to)
      if (search) {
        const safe = search.replace(/%/g, '\\%')
        q = q.ilike('name', `%${safe}%`)
      }
      const { data, count, error } = await q
      if (error) throw error
      return {
        customers: (data ?? []).map((row: any) => ({
          ...row,
          credit_group_name:  row.credit_groups?.name         ?? null,
          credit_group_limit: row.credit_groups?.credit_limit ?? null,
        })) as Customer[],
        total: count ?? 0,
      }
    },
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; phone: string; email: string | null; credit_group_id?: string | null }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('customers')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['all-customers'] })
    },
  })
}

export function useSaleOrders(filters: SOFilters = {}) {
  return useQuery({
    queryKey: ['sale-orders', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('sale_orders')
        .select('*, sale_order_lines(*), sale_deliveries(*), customers!inner(name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) q = q.eq('status', filters.status)
      if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom)
      if (filters.dateTo) q = q.lte('created_at', filters.dateTo)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.or(`so_number.ilike.%${safe}%,customers.name.ilike.%${safe}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row: any) => ({
        ...row,
        customer_name: row.customers?.name ?? null,
      })) as SaleOrder[]
    },
    staleTime: 30 * 1000,
  })
}

export function useSaleOrder(id: string | null) {
  return useQuery({
    queryKey: ['sale-order', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('sale_orders')
        .select('*, sale_order_lines(*), sale_deliveries(*), customers(name, phone, email)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        ...data,
        customer_name:  data.customers?.name  ?? null,
        customer_phone: data.customers?.phone ?? null,
      } as SaleOrder
    },
    enabled: !!id,
  })
}

export function useSOPayments(soId: string | null) {
  return useQuery({
    queryKey: ['so-payments', soId],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('payments')
        .select('*')
        .eq('source_type', 'sale_order')
        .eq('source_id', soId!)
        .is('deleted_at', null)
        .order('date', { ascending: false })
      if (error) return [] as SalePayment[] // columns may not exist until migration 20260422000002 is applied
      return data as SalePayment[]
    },
    enabled: !!soId,
    staleTime: 30 * 1000,
  })
}

export function useCreateSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateSOPayload): Promise<CreateSOResult> => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('create_sale_order', {
        p_customer_id:          payload.customer_id,
        p_intent:               payload.intent,
        p_currency:             payload.currency,
        p_exchange_rate:        payload.exchange_rate,
        p_expected_delivery:    payload.expected_delivery,
        p_payment_terms:        payload.payment_terms,
        p_payment_terms_notes:  payload.payment_terms_notes,
        p_payment_milestones:   payload.payment_milestones,
        p_delivery_terms:       payload.delivery_terms,
        p_delivery_terms_notes: payload.delivery_terms_notes,
        p_customer_notes:       payload.customer_notes,
        p_validity_days:        payload.validity_days,
        p_discount_amount:      payload.discount_amount,
        p_discount_label:       payload.discount_label,
        p_discount_type:        payload.discount_type,
        p_line_items:           payload.line_items,
      })
      if (error) throw error
      return data as CreateSOResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
    },
  })
}

export function useUpdateSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, line_items, ...fields }: UpdateSOPayload & { line_items?: SOLineItemDraft[] }) => {
      const supabase = createClient()

      let extraFields: Record<string, unknown> = {}
      if (line_items) {
        const subtotal = calcSOSubtotal(line_items)
        const discountType = (fields as any).discount_type ?? 'fixed'
        const discountAmount = (fields as any).discount_amount ?? 0
        const discountResolved = discountType === 'percentage'
          ? (subtotal * discountAmount) / 100
          : discountAmount
        extraFields = { subtotal, total: subtotal - discountResolved, discount_amount_resolved: discountResolved }
      }

      const { error: soErr } = await (supabase as any)
        .from('sale_orders')
        .update({ ...fields, ...extraFields })
        .eq('id', id)
      if (soErr) throw soErr

      if (line_items) {
        await (supabase as any).from('sale_order_lines').delete().eq('sale_order_id', id)
        if (line_items.length > 0) {
          const { error: liErr } = await (supabase as any)
            .from('sale_order_lines')
            .insert(line_items.map(({ avg_cost: _unused, ...li }) => ({ ...li, sale_order_id: id })))
          if (liErr) throw liErr
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.id] })
    },
  })
}

export function useConfirmSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, lineItems }: { id: string; lineItems: SOLineItem[] }) => {
      const supabase = createClient()

      // 1. Update SO status
      const { error: soErr } = await (supabase as any)
        .from('sale_orders')
        .update({ status: 'confirmed' })
        .eq('id', id)
      if (soErr) throw soErr

      // 2. Reserve stock (best-effort)
      try {
        await supabase.functions.invoke('reserve-stock', {
          body: {
            sale_order_id: id,
            items: lineItems
              .filter((l) => l.brand_variant_id)
              .map((l) => ({ brand_variant_id: l.brand_variant_id, qty: l.qty })),
          },
        })
      } catch {
        console.warn('reserve-stock edge function failed — stock not reserved')
      }

      // 3. Create stub delivery (warehouse_id nullable after migration)
      const { count: delCount } = await (supabase as any)
        .from('sale_deliveries')
        .select('*', { count: 'exact', head: true })
      const delivery_number = `DEL-${String((delCount ?? 0) + 1).padStart(5, '0')}`
      const { error: delErr } = await (supabase as any).from('sale_deliveries').insert({
        delivery_number,
        sale_order_id: id,
        warehouse_id: null,
        date: new Date().toISOString().split('T')[0],
        items: lineItems.map((l) => ({
          item_name: l.item_name,
          sku: l.sku,
          qty_delivered: l.qty,
          brand_variant_id: l.brand_variant_id,
        })),
        status: 'pending',
      })
      if (delErr) throw delErr

      // 4. Create draft AR invoice via syncInvoiceToSalesOrder
      const { syncInvoiceToSalesOrder } = await import('@/lib/invoiceSync')
      await syncInvoiceToSalesOrder(id)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['sale-deliveries'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}

export function useCreateSOPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: {
      so_id: string
      amount: number
      method: string
      date: string
      reference: string | null
      notes: string | null
      currency: string
      exchange_rate: number
    }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('payments').insert({
        source_type: 'sale_order',
        source_id: payment.so_id,
        supplier_id: null,
        amount: payment.amount,
        method: payment.method,
        date: payment.date,
        reference: payment.reference,
        notes: payment.notes,
        currency: payment.currency,
        exchange_rate: payment.exchange_rate,
        amount_qar: payment.amount * payment.exchange_rate,
        status: 'pending',
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['so-payments', variables.so_id] })
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
    },
  })
}

export function useCreateDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      so_id: string
      warehouse_id: string
      warehouse_name: string
      date: string
      items: { item_name: string; sku: string | null; qty_delivered: number; brand_variant_id: string | null }[]
    }) => {
      const supabase = createClient()

      // Generate delivery number
      const { count } = await (supabase as any)
        .from('sale_deliveries')
        .select('*', { count: 'exact', head: true })
      const delivery_number = `DEL-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data: delivery, error: delErr } = await (supabase as any)
        .from('sale_deliveries')
        .insert({
          delivery_number,
          sale_order_id: payload.so_id,
          warehouse_id: payload.warehouse_id,
          warehouse_name: payload.warehouse_name,
          date: payload.date,
          items: payload.items,
          status: 'pending',
        })
        .select()
        .single()
      if (delErr) throw delErr

      // Call deduct-sale-stock edge function (FIFO deduction) — best-effort
      try {
        await supabase.functions.invoke('deduct-sale-stock', {
          body: {
            sale_order_id: payload.so_id,
            delivery_id: delivery.id,
            warehouse_id: payload.warehouse_id,
            items: payload.items
              .filter((i) => i.brand_variant_id)
              .map((i) => ({ brand_variant_id: i.brand_variant_id, qty: i.qty_delivered })),
          },
        })
      } catch {
        console.warn('deduct-sale-stock edge function failed — stock not deducted')
      }

      return delivery as SaleDelivery
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.so_id] })
    },
  })
}

export function useCancelSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()

      // Fetch lines to release reserved stock before cancelling
      const { data: lines } = await (supabase as any)
        .from('sale_order_lines')
        .select('brand_variant_id, qty')
        .eq('sale_order_id', id)

      const releases = (lines ?? [])
        .filter((l: any) => l.brand_variant_id && l.qty > 0)
        .map((l: any) => ({ bv_id: l.brand_variant_id, delta: -l.qty }))

      if (releases.length > 0) {
        const { error: relErr } = await (supabase as any).rpc('batch_update_reserved_qty', { p_updates: releases })
        if (relErr) throw relErr
      }

      const { error } = await (supabase as any)
        .from('sale_orders')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', id] })
      queryClient.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
    },
  })
}

export function useApproveSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('sale_orders')
        .update({ status: 'confirmed' })
        .eq('id', id)
        .eq('status', 'pending_approval')
      if (error) throw error
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', id] })
    },
  })
}
