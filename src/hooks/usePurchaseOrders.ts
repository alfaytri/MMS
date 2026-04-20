import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type POStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'partially_received'
  | 'received'
  | 'cancelled'

export type POLineItem = {
  id: string
  po_id: string
  item_name: string
  sku: string | null
  qty: number
  received_qty: number
  free_qty: number
  unit: string
  unit_price: number
  total_price: number
  fifo_layers: unknown
  brand_variant_id: string | null
  tool_asset_item_id: string | null
  brand_id: string | null
  created_at: string
}

export type POApprovalStep = {
  id: string
  po_id: string
  role: string
  status: 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  date: string | null
  comment: string | null
}

export type PurchaseOrder = {
  id: string
  po_number: string
  supplier_id: string
  supplier_name: string
  status: POStatus
  currency: string
  exchange_rate: number
  subtotal: number
  total_qar: number
  created_date: string
  expected_delivery: string | null
  approval_level: number
  payment_terms: string | null
  payment_terms_notes: string | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  vendor_notes: string | null
  discount_amount: number
  discount_label: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  // joined
  po_line_items?: POLineItem[]
  po_approvals?: POApprovalStep[]
}

export type POPayment = {
  id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  source_type: string
  source_id: string
  supplier_id: string | null
  currency: string
  exchange_rate: number
  amount_qar: number | null
  created_at: string
}

export type POReceival = {
  id: string
  receival_number: string
  po_id: string
  warehouse_id: string
  received_by_name: string | null
  date: string
  status: string
  notes: string | null
  created_at: string
  // joined
  receival_items?: {
    id: string
    item_name: string
    sku: string | null
    qty_received: number
    unit_cost: number
    is_free: boolean
  }[]
}

export type POLineItemDraft = {
  item_name: string
  sku: string
  qty: number
  unit: string
  unit_price: number
  total_price: number
  brand_variant_id: string | null
  tool_asset_item_id: string | null
  free_qty: number
}

export type CreatePOPayload = {
  supplier_id: string
  supplier_name: string
  currency: string
  exchange_rate: number
  expected_delivery: string | null
  payment_terms: string | null
  payment_terms_notes: string | null
  delivery_terms: string | null
  delivery_terms_notes: string | null
  vendor_notes: string | null
  discount_amount: number
  discount_label: string | null
  line_items: POLineItemDraft[]
}

export type UpdatePOPayload = Partial<CreatePOPayload> & { id: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function calcApprovalLevel(totalQar: number): number {
  if (totalQar < 5000) return 1
  if (totalQar < 50000) return 2
  return 3
}

export function getApprovalRoles(level: number): string[] {
  if (level === 1) return ['purchase_manager']
  if (level === 2) return ['purchase_manager', 'accountant']
  return ['purchase_manager', 'accountant', 'owner']
}

export const PAYMENT_METHODS = [
  'cash', 'bank_transfer', 'cheque', 'credit_card', 'debit_card', 'online', 'other',
] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]

// NOTE: count+1 approach is race-prone under concurrent creates.
// The DB has a UNIQUE constraint on po_number, so concurrent collisions
// will produce a DB error rather than a silent duplicate.
// TODO: replace with a server-side DB sequence when types are regenerated.
async function generatePONumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { count } = await (supabase as any)
    .from('purchase_orders')
    .select('*', { count: 'exact', head: true })
  const seq = String((count ?? 0) + 1).padStart(5, '0')
  return `PO-${seq}`
}

// ─── Filters type ─────────────────────────────────────────────────────────────

export interface POFilters {
  search?: string
  status?: POStatus | ''
  dateFrom?: string
  dateTo?: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePurchaseOrders(filters: POFilters = {}) {
  return useQuery({
    queryKey: ['purchase-orders', filters],
    queryFn: async () => {
      const supabase = createClient()
      let query = (supabase as any)
        .from('purchase_orders')
        .select('*, po_approvals(*)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) query = query.eq('status', filters.status)
      if (filters.dateFrom) query = query.gte('created_date', filters.dateFrom)
      if (filters.dateTo) query = query.lte('created_date', filters.dateTo)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        query = query.or(`po_number.ilike.%${safe}%,supplier_name.ilike.%${safe}%`)
      }

      const { data, error } = await query
      if (error) throw error
      return data as PurchaseOrder[]
    },
    staleTime: 30 * 1000,
  })
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as PurchaseOrder
    },
    enabled: !!id,
  })
}

export function usePOPayments(poId: string | null) {
  return useQuery({
    queryKey: ['po-payments', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('payments')
        .select('*')
        .eq('source_type', 'purchase_order')
        .eq('source_id', poId!)
        .is('deleted_at', null)
        .order('date', { ascending: false })
      if (error) throw error
      return data as POPayment[]
    },
    enabled: !!poId,
    staleTime: 30 * 1000,
  })
}

export function usePOReceivalsByPO(poId: string | null) {
  return useQuery({
    queryKey: ['po-receivals', poId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select('*, receival_items(*)')
        .eq('po_id', poId!)
        .order('date', { ascending: false })
      if (error) throw error
      return data as POReceival[]
    },
    enabled: !!poId,
    staleTime: 30 * 1000,
  })
}

export function useCreatePO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreatePOPayload) => {
      const supabase = createClient()
      const po_number = await generatePONumber(supabase)

      const subtotal = payload.line_items.reduce((s, li) => s + li.total_price, 0)
      const total_qar = (subtotal - payload.discount_amount) * payload.exchange_rate
      const approval_level = calcApprovalLevel(total_qar)

      const { data: po, error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .insert({
          po_number,
          supplier_id: payload.supplier_id,
          supplier_name: payload.supplier_name,
          status: 'draft',
          currency: payload.currency,
          exchange_rate: payload.exchange_rate,
          subtotal,
          total_qar,
          approval_level,
          created_date: new Date().toISOString().split('T')[0],
          expected_delivery: payload.expected_delivery,
          payment_terms: payload.payment_terms,
          payment_terms_notes: payload.payment_terms_notes,
          delivery_terms: payload.delivery_terms,
          delivery_terms_notes: payload.delivery_terms_notes,
          vendor_notes: payload.vendor_notes,
          discount_amount: payload.discount_amount,
          discount_label: payload.discount_label,
        })
        .select()
        .single()
      if (poErr) throw poErr

      if (payload.line_items.length > 0) {
        const { error: liErr } = await (supabase as any)
          .from('po_line_items')
          .insert(payload.line_items.map((li) => ({ ...li, po_id: po.id })))
        if (liErr) throw liErr
      }

      return po as PurchaseOrder
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}

export function useUpdatePO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, line_items, ...fields }: UpdatePOPayload & { line_items?: POLineItemDraft[] }) => {
      const supabase = createClient()

      // Recalculate totals if line items provided
      let extraFields: Record<string, unknown> = {}
      if (line_items) {
        const subtotal = line_items.reduce((s, li) => s + li.total_price, 0)
        const discount = (fields as any).discount_amount ?? 0
        const rate = (fields as any).exchange_rate ?? 1
        const total_qar = (subtotal - discount) * rate
        extraFields = { subtotal, total_qar, approval_level: calcApprovalLevel(total_qar) }
      }

      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({ ...fields, ...extraFields })
        .eq('id', id)
      if (poErr) throw poErr

      if (line_items) {
        // Delete existing line items and re-insert
        await (supabase as any).from('po_line_items').delete().eq('po_id', id)
        if (line_items.length > 0) {
          const { error: liErr } = await (supabase as any)
            .from('po_line_items')
            .insert(line_items.map((li) => ({ ...li, po_id: id })))
          if (liErr) throw liErr
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
    },
  })
}

export function useSubmitPOForApproval() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approval_level }: { id: string; approval_level: number }) => {
      const supabase = createClient()
      const roles = getApprovalRoles(approval_level)

      // Create approval steps
      const { error: approvalErr } = await (supabase as any)
        .from('po_approvals')
        .insert(roles.map((role) => ({ po_id: id, role, status: 'pending' })))
      if (approvalErr) throw approvalErr

      // Update PO status
      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: 'pending_approval' })
        .eq('id', id)
      if (poErr) throw poErr
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.id] })
    },
  })
}

export function useCreatePOPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payment: {
      po_id: string
      supplier_id: string
      amount: number
      method: PaymentMethod
      date: string
      reference: string | null
      notes: string | null
      currency: string
      exchange_rate: number
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).from('payments').insert({
        source_type: 'purchase_order',
        source_id: payment.po_id,
        supplier_id: payment.supplier_id,
        amount: payment.amount,
        method: payment.method as any, // DB enum — cast needed due to stale generated types
        date: payment.date,
        reference: payment.reference,
        notes: payment.notes,
        currency: payment.currency,
        exchange_rate: payment.exchange_rate,
        amount_qar: payment.amount * payment.exchange_rate,
        status: 'pending' as any,
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-payments', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}

export function useSubmitPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: 'pending_approval' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
    },
  })
}

export function useCancelPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
    },
  })
}
