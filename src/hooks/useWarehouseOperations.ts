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
  brand_variant_id: string
  item_name: string
  brand: string | null
  sku: string | null
  unit: string
  stock_level: number
  average_cost: number
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
      const { data, error } = await (supabase as any)
        .from('inventory_brand_variants')
        .select('id, item_name, brand, sku, unit, stock_level, average_cost')
        .gt('stock_level', 0)
        .order('item_name', { ascending: true })
      if (error) throw error
      return ((data ?? []) as any[]).map((v) => ({
        brand_variant_id: v.id,
        item_name: v.item_name,
        brand: v.brand,
        sku: v.sku,
        unit: v.unit,
        stock_level: v.stock_level,
        average_cost: v.average_cost,
        total_value: v.stock_level * v.average_cost,
      })) as WarehouseStockItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
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
        .from('warehouse_transfers')
        .update({ status: 'approved', approved_by_name: approvedByName, approved_date: new Date().toISOString().split('T')[0] })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse_transfers'] }),
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
        .from('stock_adjustments')
        .update({ status: 'approved', approved_by_name: approvedByName, approved_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock_adjustments'] }),
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
      const { data, error } = await (supabase as any)
        .from('inventory_checks')
        .insert({ warehouse_id: warehouseId, warehouse_name: warehouseName, status: 'draft', notes })
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
