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
  id: string
  sale_order_id: string
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  total: number
  delivered_qty: number
  brand_variant_id: string | null
  created_at: string
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
  id: string
  so_number: string
  customer_id: string
  status: SOStatus
  subtotal: number
  tax: number
  total: number
  discount_amount: number
  discount_label: string | null
  discount_type: string | null
  discount_amount_resolved: number
  notes: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // joined
  sale_order_lines?: SOLineItem[]
  sale_deliveries?: SaleDelivery[]
  // denormalised from customers join
  customer_name?: string
  customer_phone?: string
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
  id: string
  name: string
  email: string | null
  customer_number: string | null
  customer_type: string | null
  is_blocked: boolean
  credit_category_id: string | null
}

export type SOLineItemDraft = {
  item_name: string
  sku: string
  qty: number
  unit_price: number
  total: number
  brand_variant_id: string | null
  avg_cost?: number // for margin check
}

export type CreateSOPayload = {
  customer_id: string
  customer_name: string
  notes: string | null
  discount_amount: number
  discount_label: string | null
  discount_type: 'fixed' | 'percentage'
  line_items: SOLineItemDraft[]
}

export type UpdateSOPayload = Partial<CreateSOPayload> & { id: string }

export interface SOFilters {
  search?: string
  status?: SOStatus | ''
  dateFrom?: string
  dateTo?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateSONumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { count } = await (supabase as any)
    .from('sale_orders')
    .select('*', { count: 'exact', head: true })
  const seq = String((count ?? 0) + 1).padStart(5, '0')
  return `SO-${seq}`
  // TODO: replace with server-side sequence to avoid race conditions. Current
  // implementation is prone to duplicates under concurrent load; the UNIQUE
  // constraint on so_number is the safety net.
}

export function calcSOSubtotal(lines: SOLineItemDraft[]): number {
  return lines.reduce((s, l) => s + l.total, 0)
}

export function calcSOTotal(subtotal: number, discountAmount: number, discountType: 'fixed' | 'percentage'): number {
  if (discountType === 'percentage') {
    return subtotal - (subtotal * discountAmount) / 100
  }
  return subtotal - discountAmount
}

export function hasNegativeMargin(lines: SOLineItemDraft[]): boolean {
  return lines.some((l) => l.avg_cost !== undefined && l.unit_price < l.avg_cost)
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('customers')
        .select('id, name, email, customer_number, customer_type, is_blocked, credit_category_id')
        .is('deleted_at', null)
        .order('name')
        .limit(50)
      if (search) {
        const safe = search.replace(/%/g, '\\%')
        q = q.ilike('name', `%${safe}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return data as Customer[]
    },
    staleTime: 30 * 1000,
    enabled: true,
  })
}

export function useCreateCustomer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; email?: string | null; customer_type?: string }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('customers')
        .insert({ name: payload.name, email: payload.email ?? null, customer_type: payload.customer_type ?? 'individual' })
        .select()
        .single()
      if (error) throw error
      return data as Customer
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
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
        .select('*, sale_order_lines(*), sale_deliveries(*), customers(name, email, customer_number)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return {
        ...data,
        customer_name: data.customers?.name ?? null,
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
      if (error) throw error
      return data as SalePayment[]
    },
    enabled: !!soId,
    staleTime: 30 * 1000,
  })
}

export function useCreateSO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateSOPayload) => {
      const supabase = createClient()
      const so_number = await generateSONumber(supabase)
      const subtotal = calcSOSubtotal(payload.line_items)
      const discountResolved = payload.discount_type === 'percentage'
        ? (subtotal * payload.discount_amount) / 100
        : payload.discount_amount
      const total = subtotal - discountResolved

      const { data: so, error: soErr } = await (supabase as any)
        .from('sale_orders')
        .insert({
          so_number,
          customer_id: payload.customer_id,
          status: 'quotation',
          subtotal,
          tax: 0,
          total,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
          discount_type: payload.discount_type,
          discount_amount_resolved: discountResolved,
          notes: payload.notes,
        })
        .select()
        .single()
      if (soErr) throw soErr

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('sale_order_lines')
          .insert(
            payload.line_items.map(({ avg_cost: _unused, ...li }) => ({
              ...li,
              sale_order_id: so.id,
            }))
          )
        if (liErr) throw liErr
      }

      return so as SaleOrder
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

      // Update SO status
      const { error: soErr } = await (supabase as any)
        .from('sale_orders')
        .update({ status: 'confirmed' })
        .eq('id', id)
      if (soErr) throw soErr

      // Call reserve-stock edge function (best-effort; warns if insufficient stock)
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
        // Non-blocking: log warning but don't fail the confirmation
        console.warn('reserve-stock edge function failed — stock not reserved')
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.id] })
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

      // Call deduct-sale-stock edge function (FIFO deduction)
      const { error: fnErr } = await supabase.functions.invoke('deduct-sale-stock', {
        body: {
          sale_order_id: payload.so_id,
          delivery_id: delivery.id,
          warehouse_id: payload.warehouse_id,
          items: payload.items
            .filter((i) => i.brand_variant_id)
            .map((i) => ({ brand_variant_id: i.brand_variant_id, qty: i.qty_delivered })),
        },
      })
      if (fnErr) throw fnErr

      return delivery as SaleDelivery
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-orders'] })
      queryClient.invalidateQueries({ queryKey: ['sale-order', variables.so_id] })
    },
  })
}
