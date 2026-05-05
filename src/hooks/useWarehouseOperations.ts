import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockMovementType =
  | 'purchase_receival'
  | 'sale_delivery'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'return'
  | 'sale_return'

export type StockMovement = {
  id: string
  warehouse_id: string
  brand_variant_id: string
  item_name: string
  sku: string | null
  movement_type: StockMovementType
  qty: number
  unit_cost: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_at: string
}

export type WarehouseStockItem = {
  warehouse_id: string
  brand_variant_id: string
  item_name: string
  brand: string | null
  sku: string | null
  unit: string
  qty: number
  avg_cost: number
  total_value: number
}

export type TransferStatus = 'pending' | 'in_transit' | 'pending_approval' | 'approved' | 'rejected'

export type TransferItem = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty: number
  unit_cost: number
}

export type WarehouseTransfer = {
  id: string
  transfer_number: string
  from_warehouse_id: string
  to_warehouse_id: string
  status: TransferStatus
  created_by_name: string | null
  approved_by_name: string | null
  date: string
  approved_date: string | null
  items: TransferItem[]
  notes: string | null
  created_at: string
  updated_at: string
  from_warehouse?: { name: string } | null
  to_warehouse?: { name: string } | null
}

export type CreateTransferPayload = {
  from_warehouse_id: string
  to_warehouse_id: string
  date: string
  items: TransferItem[]
  notes?: string | null
  created_by_name?: string | null
}

export type StockAdjustment = {
  id: string
  warehouse_id: string
  brand_variant_id: string
  adjustment_type: string
  qty: number
  reason: string
  notes: string | null
  status: string
  requested_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type CreateAdjustmentPayload = {
  warehouse_id: string
  brand_variant_id: string
  adjustment_type: 'increase' | 'decrease' | 'set'
  qty: number
  reason: string
  notes?: string | null
  requested_by_name?: string | null
}

export type InventoryCheck = {
  id: string
  check_number: string
  warehouse_id: string
  warehouse_name: string
  status: string
  submitted_by_name: string | null
  submitted_at: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_notes: string | null
  notes: string | null
  created_at: string
  items?: InventoryCheckItem[]
}

export type InventoryCheckItem = {
  id: string
  check_id: string
  brand_variant_id: string
  item_name: string
  brand: string
  sku: string | null
  system_qty: number
  counted_qty: number | null
  is_counted: boolean
  variance: number | null
  notes: string | null
}

export type ReceivalDelivery = {
  id: string
  direction: 'inbound' | 'outbound'
  docNumber: string
  reference: string // po_id (inbound) | sale_order_id (outbound)
  warehouseId: string
  warehouseName: string
  counterparty: string // supplier name (inbound) | customer name (outbound)
  date: string
  items: { name: string; sku: string; qty: number }[]
  itemCount: number
  status: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useStockMovements({
  warehouseId,
  limit = 100,
}: {
  warehouseId?: string
  limit?: number
} = {}) {
  return useQuery({
    queryKey: ['stock_movements', { warehouseId, limit }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('inventory_stock_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as StockMovement[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useWarehouseStock(warehouseId?: string) {
  return useQuery({
    queryKey: ['warehouse_stock', warehouseId],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('warehouse_stock_view')
        .select('warehouse_id, brand_variant_id, item_name, brand, sku, unit, qty, avg_cost, total_value')
        .order('item_name', { ascending: true })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WarehouseStockItem[]
    },
    staleTime: 5 * 60 * 1000,
    enabled: warehouseId !== null,
  })
}

export function useWarehouseStockSummary(warehouseId: string | null): {
  data: Map<string, number>
  isLoading: boolean
} {
  const { data: items = [], isLoading } = useWarehouseStock(warehouseId ?? undefined)
  const data = useMemo(
    () => new Map(items.map((item) => [item.brand_variant_id, item.qty])),
    [items],
  )
  return { data, isLoading }
}

export function useWarehouseTransfers({ status }: { status?: TransferStatus } = {}) {
  return useQuery({
    queryKey: ['warehouse_transfers', { status }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('warehouse_transfers')
        .select('*, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name)')
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WarehouseTransfer[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateTransferPayload) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('warehouse_transfers')
        .insert({ ...payload, status: 'pending' })
        .select()
        .single()
      if (error) throw error
      return data as WarehouseTransfer
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse_transfers'] }),
  })
}

export function useApproveTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approvedByName }: { id: string; approvedByName: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .rpc('approve_warehouse_transfer_inventory', {
          p_transfer_id: id,
          p_approved_by: approvedByName,
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse_transfers'] })
      qc.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
      qc.invalidateQueries({ queryKey: ['fifo-layers'] })
    },
  })
}

export function useRejectTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('warehouse_transfers')
        .update({ status: 'rejected' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse_transfers'] }),
  })
}

export function useStockAdjustments({ warehouseId }: { warehouseId?: string } = {}) {
  return useQuery({
    queryKey: ['stock_adjustments', { warehouseId }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('stock_adjustments')
        .select('*')
        .order('created_at', { ascending: false })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as StockAdjustment[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateStockAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateAdjustmentPayload) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('stock_adjustments')
        .insert({ ...payload, status: 'pending_approval' })
        .select()
        .single()
      if (error) throw error
      return data as StockAdjustment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock_adjustments'] }),
  })
}

export function useApproveStockAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approvedByName }: { id: string; approvedByName: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .rpc('approve_stock_adjustment_inventory', {
          p_adjustment_id: id,
          p_approved_by: approvedByName,
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock_adjustments'] })
      qc.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
      qc.invalidateQueries({ queryKey: ['fifo-layers'] })
    },
  })
}

export function useInventoryChecks({ warehouseId }: { warehouseId?: string } = {}) {
  return useQuery({
    queryKey: ['inventory_checks', { warehouseId }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('inventory_checks')
        .select('*')
        .order('created_at', { ascending: false })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as InventoryCheck[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useInventoryCheck(id: string) {
  return useQuery({
    queryKey: ['inventory_checks', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_checks')
        .select('*, items:inventory_check_items(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as InventoryCheck
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      warehouseId,
      warehouseName,
      notes,
    }: {
      warehouseId: string
      warehouseName: string
      notes?: string | null
    }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: checkNumber, error: seqErr } = await (supabase as any).rpc('generate_check_number')
      if (seqErr) throw seqErr
      const { data, error } = await (supabase as any)
        .from('inventory_checks')
        .insert({ check_number: checkNumber, warehouse_id: warehouseId, warehouse_name: warehouseName, status: 'draft', notes })
        .select()
        .single()
      if (error) throw error
      return data as InventoryCheck
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_checks'] }),
  })
}

export function useUpdateInventoryCheckItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      countedQty,
    }: {
      id: string
      countedQty: number
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_check_items')
        .update({ counted_qty: countedQty, is_counted: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory_checks'] })
    },
  })
}

export function useSubmitInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, submittedByName }: { id: string; submittedByName: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_checks')
        .update({
          status: 'submitted',
          submitted_by_name: submittedByName,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_checks'] }),
  })
}

export function useReviewInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      reviewedByName,
      reviewNotes,
    }: {
      id: string
      reviewedByName: string
      reviewNotes?: string | null
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_checks')
        .update({
          status: 'reviewed',
          reviewed_by_name: reviewedByName,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_checks'] }),
  })
}

export function useReceivalsAndDeliveries() {
  return useQuery({
    queryKey: ['receivals_deliveries'],
    queryFn: async () => {
      const supabase = createClient()

      const [receivalsRes, deliveriesRes] = await Promise.all([
        (supabase as any)
          .from('receivals')
          .select('id, receival_number, po_id, warehouse_id, date, status, received_by_name, receival_items(id)')
          .order('date', { ascending: false }),
        (supabase as any)
          .from('sale_deliveries')
          .select('id, delivery_number, sale_order_id, warehouse_id, warehouse_name, date, items, status')
          .order('date', { ascending: false }),
      ])

      if (receivalsRes.error) throw receivalsRes.error
      if (deliveriesRes.error) throw deliveriesRes.error

      const inbound: ReceivalDelivery[] = (receivalsRes.data ?? []).map((r: any) => ({
        id: r.id,
        direction: 'inbound' as const,
        docNumber: r.receival_number ?? '',
        reference: r.po_id ?? '',
        warehouseId: r.warehouse_id ?? '',
        warehouseName: '',
        counterparty: r.received_by_name ?? '',
        date: r.date ?? '',
        items: Array.isArray(r.receival_items) ? r.receival_items : [],
        itemCount: Array.isArray(r.receival_items) ? r.receival_items.length : 0,
        status: r.status ?? 'pending',
      }))

      const outbound: ReceivalDelivery[] = (deliveriesRes.data ?? []).map((d: any) => ({
        id: d.id,
        direction: 'outbound' as const,
        docNumber: d.delivery_number ?? '',
        reference: d.sale_order_id ?? '',
        warehouseId: d.warehouse_id ?? '',
        warehouseName: d.warehouse_name ?? '',
        counterparty: '', // customer name not directly available, would need join with sale_orders
        date: d.date ?? '',
        items: Array.isArray(d.items) ? d.items : [],
        itemCount: Array.isArray(d.items) ? d.items.length : 0,
        status: d.status ?? 'pending',
      }))

      return [...inbound, ...outbound].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    },
    staleTime: 5 * 60 * 1000,
  })
}
