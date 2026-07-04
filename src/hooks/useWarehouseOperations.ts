import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockMovementType =
  | 'purchase_receival'
  | 'sale_delivery'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'cost_adjustment'
  | 'receival_edit'
  | 'free_receival'
  | 'sale_return'
  | 'sale_return_damaged'
  | 'purchase_return'
  | 'purchase_return_cancelled'
  | 'transfer_shrinkage'

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
  category_name: string | null
  subcategory_name: string | null
  item_type: string | null
  allocated_qty: number
  available_qty: number
}

export type TransferStatus = 'pending' | 'in_transit' | 'received' | 'rejected' | 'cancelled'
  | 'pending_approval' | 'approved' // deprecated — kept for historical data

export type TransferItem = {
  id: string
  transfer_id: string
  brand_variant_id: string
  item_name: string
  sku: string | null
  requested_qty: number
  unit_cost: number
  dispatched_qty: number | null
  received_qty: number | null
  shrinkage_qty: number
  shrinkage_reason: string | null
}

export type WarehouseTransfer = {
  id: string
  transfer_number: string
  from_warehouse_id: string
  to_warehouse_id: string
  status: TransferStatus
  created_by_name: string | null
  created_by_profile_id: string | null
  dispatched_by_profile_id: string | null
  dispatched_by_name: string | null
  dispatched_at: string | null
  received_by_profile_id: string | null
  received_by_name: string | null
  received_at: string | null
  cancelled_by_name: string | null
  cancelled_at: string | null
  date: string
  notes: string | null
  created_at: string
  updated_at: string
  from_warehouse?: { name: string } | null
  to_warehouse?: { name: string } | null
  transfer_items?: TransferItem[]
}

export type CreateTransferPayload = {
  from_warehouse_id: string
  to_warehouse_id: string
  date: string
  items: Array<{ brand_variant_id: string; item_name: string; sku: string | null; qty: number; unit_cost: number }>
  notes?: string | null
  created_by_profile_id?: string | null
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

export type StockAdjustmentApprovalStep = {
  id: string
  adjustment_id: string
  step_order: number
  step_role: 'accounting_manager' | 'inventory_manager' | 'responsible_person' | 'brand_manager' | 'owner'
  step_label: string
  status: 'pending' | 'approved' | 'rejected'
  profile_id: string | null
  profile_name: string | null
  action_at: string | null
  notes: string | null
  created_at: string
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
  initiated_by_profile_id: string | null
  initiated_by_name: string | null
  started_at: string | null
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
  variance_type: string | null
  notes: string | null
  assignment_id: string | null
  category_name: string | null
  assigned_profile_id: string | null
  assigned_profile_name: string | null
  system_qty_at_close: number | null
}

export type InventoryCheckAssignment = {
  id: string
  check_id: string
  profile_id: string
  profile_name: string
  assigned_categories: string[]
  status: 'pending' | 'in_progress' | 'completed'
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type InventoryCheckLogEntry = {
  id: string
  check_id: string
  event_type: string
  profile_id: string | null
  profile_name: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export type InventoryCheckApprovalStep = {
  id: string
  check_id: string
  step_order: number
  step_role: string
  step_label: string
  profile_id: string | null
  profile_name: string | null
  status: 'pending' | 'approved' | 'rejected'
  action_at: string | null
  notes: string | null
  created_at: string
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
  items: { name: string; sku: string; qty: number; brand_variant_id?: string | null }[]
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
    queryKey: queryKeys.warehouseOps.stockMovements(warehouseId, limit),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_stock_movements')
        .select('id, warehouse_id, brand_variant_id, item_name, sku, movement_type, qty, unit_cost, reference_type, reference_id, notes, created_at')
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
    queryKey: queryKeys.warehouseOps.warehouseStock(warehouseId),
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = supabase
        .from('warehouse_stock_view')
        .select('warehouse_id, brand_variant_id, item_name, brand, sku, unit, qty, avg_cost, total_value, category_name, subcategory_name, item_type, allocated_qty, available_qty')
        .order('item_name', { ascending: true })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WarehouseStockItem[]
    },
    staleTime: 5 * 60 * 1000,
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

export function useWarehouseStockByItems(brandVariantIds: string[]) {
  const { data: allStock = [], isLoading } = useWarehouseStock()
  const data = useMemo(() => {
    const idSet = new Set(brandVariantIds)
    const map = new Map<string, { warehouse_id: string; warehouse_name?: string; qty: number }[]>()
    for (const s of allStock) {
      if (!idSet.has(s.brand_variant_id) || s.qty <= 0) continue
      if (!map.has(s.brand_variant_id)) map.set(s.brand_variant_id, [])
      map.get(s.brand_variant_id)!.push({ warehouse_id: s.warehouse_id, qty: s.qty })
    }
    return map
  }, [allStock, brandVariantIds])
  return { data, isLoading }
}

export function useWarehouseTransfers({ status }: { status?: TransferStatus } = {}) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.warehouseTransfersByStatus(status),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('warehouse_transfers')
        .select(`
  *, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name),
  transfer_items:warehouse_transfer_items(*)
`)
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as WarehouseTransfer[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateTransferPayload) => {
      const supabase = createClient()
      // IMPORTANT: Do NOT JSON.stringify — supabase-js auto-serializes JS objects to JSONB.
      const { data, error } = await supabase.rpc('create_transfer_v2', {
        p_from_warehouse_id: payload.from_warehouse_id,
        p_to_warehouse_id: payload.to_warehouse_id,
        p_date: payload.date,
        p_items: payload.items,
        p_notes: payload.notes ?? undefined,
        p_created_by_profile_id: payload.created_by_profile_id ?? undefined,
        p_created_by_name: payload.created_by_name ?? undefined,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
    },
  })
}

export function useDispatchTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, profileId, profileName }: { id: string; profileId: string; profileName: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('dispatch_transfer', {
        p_transfer_id: id,
        p_dispatched_by_profile_id: profileId,
        p_dispatched_by_name: profileName,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.inventoryBrandVariants })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useReceiveTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id, profileId, profileName, receivedItems,
    }: {
      id: string
      profileId: string
      profileName: string
      receivedItems: Array<{ transfer_item_id: string; received_qty: number; shrinkage_reason?: string }>
    }) => {
      const supabase = createClient()
      // Do NOT JSON.stringify — supabase-js auto-serializes to JSONB
      const { error } = await supabase.rpc('receive_transfer', {
        p_transfer_id: id,
        p_received_by_profile_id: profileId,
        p_received_by_name: profileName,
        p_received_items: receivedItems,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.inventoryBrandVariants })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useCancelTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, profileId, profileName }: { id: string; profileId: string; profileName: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('cancel_transfer', {
        p_transfer_id: id,
        p_cancelled_by_profile_id: profileId,
        p_cancelled_by_name: profileName,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useRejectTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, profileId, profileName }: { id: string; profileId: string; profileName: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('reject_transfer_v2', {
        p_transfer_id: id,
        p_rejected_by_profile_id: profileId,
        p_rejected_by_name: profileName,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useStockAdjustments({ warehouseId }: { warehouseId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.stockAdjustmentsByWarehouse(warehouseId),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('stock_adjustments')
        .select(`
          *,
          warehouses(name),
          inventory_brand_variants(brand, inventory_items(name_en, sku, inventory_categories(id, name_en, type))),
          stock_adjustment_approvals(
            id, adjustment_id, step_order, step_role, step_label, status,
            profile_id, profile_name, action_at, notes, created_at
          )
        `)
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
      const { data, error } = await supabase
        .from('stock_adjustments')
        .insert({ ...payload, status: 'pending_approval' })
        .select()
        .single()
      if (error) throw error
      return data as StockAdjustment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments }),
  })
}

export type CreateAdjustmentV2Payload = {
  warehouseId: string
  brandVariantId: string
  adjustmentType: 'increase' | 'decrease' | 'damage' | 'write_off'
  qty: number
  reason: string
  notes?: string | null
  photoUrls: string[]
  requestedBy: string | null
  requestedByName: string | null
}

export function useCreateStockAdjustmentV2() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateAdjustmentV2Payload) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('create_stock_adjustment_v2', {
        p_warehouse_id:      payload.warehouseId,
        p_brand_variant_id:  payload.brandVariantId,
        p_adjustment_type:   payload.adjustmentType,
        p_qty:               payload.qty,
        p_reason:            payload.reason,
        p_notes:             (payload.notes ?? null) as string,
        p_photo_urls:        payload.photoUrls,
        p_requested_by:      payload.requestedBy as string,
        p_requested_by_name: payload.requestedByName as string,
      })
      if (error) {
        const cleanMessage = error.message.replace(/^P\d{4}:\s*/, '')
        throw new Error(cleanMessage)
      }
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments }),
  })
}

export function useApproveStockAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approvedByName }: { id: string; approvedByName: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .rpc('approve_stock_adjustment_inventory', {
          p_adjustment_id: id,
          p_approved_by: approvedByName,
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsGrouped })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariants })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
    },
  })
}

export function useActionStockAdjustmentStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stepId, action, profileId, profileName, notes,
    }: {
      stepId: string
      action: 'approved' | 'rejected'
      profileId: string | null
      profileName: string
      notes?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('action_stock_adjustment_step', {
        p_step_id:      stepId,
        p_action:       action,
        p_profile_id:   profileId as string,
        p_profile_name: profileName,
        p_notes:        (notes ?? null) as string,
      })
      if (error) {
        const cleanMessage = error.message.replace(/^P\d{4}:\s*/, '')
        throw new Error(cleanMessage)
      }
      return data as string
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments })
      // Only invalidate heavy inventory caches when the chain actually completed
      // (i.e. the last step was approved and stock movement was committed)
      if (result === 'chain_completed') {
        qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
        qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
        qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
        qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      }
    },
  })
}

export function useInventoryChecks({ warehouseId }: { warehouseId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.inventoryChecksByWarehouse(warehouseId),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_checks')
        .select('id, check_number, warehouse_id, warehouse_name, status, submitted_by_name, submitted_at, reviewed_by_name, reviewed_at, review_notes, notes, created_at, initiated_by_profile_id, initiated_by_name, started_at')
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
    queryKey: queryKeys.warehouseOps.inventoryCheckDetail(id),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
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
      const { data: checkNumber, error: seqErr } = await supabase.rpc('generate_check_number')
      if (seqErr) throw seqErr
      const { data, error } = await supabase
        .from('inventory_checks')
        .insert({ check_number: checkNumber, warehouse_id: warehouseId, warehouse_name: warehouseName, status: 'draft', notes })
        .select()
        .single()
      if (error) throw error
      return data as InventoryCheck
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryChecks }),
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
      const { error } = await supabase
        .from('inventory_check_items')
        .update({ counted_qty: countedQty, is_counted: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryChecks })
    },
  })
}

export function useSubmitInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, submittedByName }: { id: string; submittedByName: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('inventory_checks')
        .update({
          status: 'submitted',
          submitted_by_name: submittedByName,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryChecks }),
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
      const { error } = await supabase
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
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryChecks }),
  })
}

export function useReceivalsAndDeliveries() {
  return useQuery({
    queryKey: queryKeys.warehouseOps.receivalsDeliveries,
    queryFn: async () => {
      const supabase = createClient()

      const [receivalsRes, deliveriesRes] = await Promise.all([
        supabase
          .from('receivals')
          .select('id, receival_number, po_id, warehouse_id, date, status, received_by_name, purchase_orders(po_number, supplier_name), warehouses(name), receival_items(id, item_name, sku, qty_received, brand_variant_id)')
          .order('date', { ascending: false }),
        supabase
          .from('sale_deliveries')
          .select('id, delivery_number, sale_order_id, warehouse_id, warehouse_name, date, items, status, sale_orders(so_number, customers(name))')
          .order('date', { ascending: false }),
      ])

      if (receivalsRes.error) throw receivalsRes.error
      if (deliveriesRes.error) throw deliveriesRes.error

      const inbound: ReceivalDelivery[] = (receivalsRes.data ?? []).map((r: any) => ({
        id: r.id,
        direction: 'inbound' as const,
        docNumber: r.receival_number ?? '',
        reference: r.purchase_orders?.po_number ?? '',
        warehouseId: r.warehouse_id ?? '',
        warehouseName: r.warehouses?.name ?? '',
        counterparty: r.purchase_orders?.supplier_name ?? '',
        date: r.date ?? '',
        items: Array.isArray(r.receival_items)
          ? r.receival_items.map((ri: any) => ({ name: ri.item_name ?? '', sku: ri.sku ?? '', qty: ri.qty_received ?? 0, brand_variant_id: ri.brand_variant_id ?? null }))
          : [],
        itemCount: Array.isArray(r.receival_items) ? r.receival_items.length : 0,
        status: r.status ?? 'pending',
      }))

      const outbound: ReceivalDelivery[] = (deliveriesRes.data ?? []).map((d: any) => ({
        id: d.id,
        direction: 'outbound' as const,
        docNumber: d.delivery_number ?? '',
        reference: d.sale_orders?.so_number ?? '',
        warehouseId: d.warehouse_id ?? '',
        warehouseName: d.warehouse_name ?? '',
        counterparty: d.sale_orders?.customers?.name ?? '',
        date: d.date ?? '',
        items: Array.isArray(d.items) ? d.items.map((di: any) => ({ name: di.item_name ?? '', sku: di.sku ?? '', qty: di.qty_delivered ?? 0, brand_variant_id: di.brand_variant_id ?? null })) : [],
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

// ─── Inventory Check Redesign Hooks ──────────────────────────────────────────

export function useInventoryCheckAssignments(checkId: string) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.inventoryCheckAssignments(checkId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_check_assignments')
        .select('*')
        .eq('check_id', checkId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as InventoryCheckAssignment[]
    },
    enabled: !!checkId,
    staleTime: 30_000,
  })
}

export function useInventoryCheckLog(checkId: string) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.inventoryCheckLog(checkId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_check_log')
        .select('*')
        .eq('check_id', checkId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as InventoryCheckLogEntry[]
    },
    enabled: !!checkId,
    staleTime: 30_000,
  })
}

export function useInventoryCheckApprovals(checkId: string) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.inventoryCheckApprovals(checkId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_check_approvals')
        .select('*')
        .eq('check_id', checkId)
        .order('step_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as InventoryCheckApprovalStep[]
    },
    enabled: !!checkId,
    staleTime: 30_000,
  })
}

export type PostCountMovement = {
  id: string
  brand_variant_id: string
  item_name: string
  sku: string | null
  movement_type: string
  qty: number
  created_at: string
}

export function usePostCountMovements(checkId: string, warehouseId: string | undefined, countCompletedAt: string | null, approvedAt?: string | null) {
  return useQuery({
    queryKey: [...queryKeys.warehouseOps.inventoryCheckDetail(checkId), 'post-count-movements', approvedAt],
    queryFn: async () => {
      if (!warehouseId || !countCompletedAt) return []
      const supabase = createClient()
      let q = supabase
        .from('inventory_stock_movements')
        .select('id, brand_variant_id, item_name, sku, movement_type, qty, created_at')
        .eq('warehouse_id', warehouseId)
        .gt('created_at', countCompletedAt)
        .neq('movement_type', 'inventory_check')
        .order('created_at', { ascending: true })
      if (approvedAt) q = q.lte('created_at', approvedAt)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as PostCountMovement[]
    },
    enabled: !!checkId && !!warehouseId && !!countCompletedAt,
    staleTime: 30_000,
  })
}

type StartCheckPayload = {
  warehouseId: string
  warehouseName: string
  initiatedByProfileId: string | null
  initiatedByName: string | null
  notes?: string | null
  assignments: Array<{
    profileId: string
    profileName: string
    categories: string[]
    items: Array<{
      brand_variant_id: string
      item_name: string
      brand: string | null
      sku: string | null
      qty: number
      category_name: string | null
    }>
  }>
}

export function useStartInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: StartCheckPayload) => {
      const supabase = createClient()

      const { data: checkNumber, error: seqErr } = await supabase.rpc('generate_check_number')
      if (seqErr) throw seqErr

      const { data: check, error: checkErr } = await supabase
        .from('inventory_checks')
        .insert({
          check_number: checkNumber as string,
          warehouse_id: payload.warehouseId,
          warehouse_name: payload.warehouseName,
          status: 'in_progress',
          initiated_by_profile_id: payload.initiatedByProfileId,
          initiated_by_name: payload.initiatedByName,
          started_at: new Date().toISOString(),
          notes: payload.notes ?? null,
        })
        .select()
        .single()
      if (checkErr) throw checkErr

      for (const a of payload.assignments) {
        const { data: assignment, error: assignErr } = await supabase
          .from('inventory_check_assignments')
          .insert({
            check_id: check.id,
            profile_id: a.profileId,
            profile_name: a.profileName,
            assigned_categories: a.categories,
            status: 'pending',
          })
          .select()
          .single()
        if (assignErr) throw assignErr

        if (a.items.length > 0) {
          const itemRows = a.items.map((item) => ({
            check_id: check.id,
            assignment_id: assignment.id,
            brand_variant_id: item.brand_variant_id,
            item_name: item.item_name,
            brand: item.brand ?? '',
            sku: item.sku ?? null,
            system_qty: item.qty,
            is_counted: false,
            category_name: item.category_name,
            assigned_profile_id: a.profileId,
            assigned_profile_name: a.profileName,
          }))
          const { error: itemsErr } = await supabase.from('inventory_check_items').insert(itemRows)
          if (itemsErr) throw itemsErr
        }
      }

      await supabase.from('inventory_check_log').insert({
        check_id: check.id,
        event_type: 'initialized',
        profile_id: payload.initiatedByProfileId,
        profile_name: payload.initiatedByName,
      })

      return check as InventoryCheck
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryChecks }),
  })
}


export function useCompleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      assignmentId,
      checkId,
      profileId,
      profileName,
    }: {
      assignmentId: string
      checkId: string
      profileId: string | null
      profileName: string
    }) => {
      const supabase = createClient()
      const now = new Date().toISOString()

      const { error: assignErr } = await supabase
        .from('inventory_check_assignments')
        .update({ status: 'completed', completed_at: now })
        .eq('id', assignmentId)
      if (assignErr) throw assignErr

      await supabase.from('inventory_check_log').insert({
        check_id: checkId,
        event_type: 'user_completed',
        profile_id: profileId,
        profile_name: profileName,
      })

      const { data: allAssignments, error: allErr } = await supabase
        .from('inventory_check_assignments')
        .select('status')
        .eq('check_id', checkId)
      if (allErr) throw allErr

      const allDone = (allAssignments ?? []).every((a) => a.status === 'completed')
      if (allDone) {
        const { data: items } = await supabase
          .from('inventory_check_items')
          .select('variance, variance_type')
          .eq('check_id', checkId)

        const hasVariance = (items ?? []).some((i) => (i.variance ?? 0) !== 0)
        const hasDamage   = (items ?? []).some(
          (i) => i.variance_type === 'damage' || i.variance_type === 'write_off',
        )

        const { data: chainSteps, error: chainErr } = await supabase.rpc(
          'build_inv_check_approval_chain',
          { p_has_damage_or_writeoff: hasDamage, p_has_variance: hasVariance },
        )
        if (chainErr) throw chainErr
        const steps = (chainSteps ?? []) as Array<{ step_order: number; step_role: string; step_label: string }>
        if (steps.length === 0) throw new Error('No approval steps configured for inv_check workflow')

        await supabase.from('inventory_check_approvals').insert(
          steps.map((s) => ({ check_id: checkId, ...s, status: 'pending' as const })),
        )

        await supabase.from('inventory_checks').update({ status: 'pending_approval' }).eq('id', checkId)

        await supabase.from('inventory_check_log').insert({
          check_id: checkId,
          event_type: 'all_counted',
          profile_name: 'System',
        })
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryChecks })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckAssignments(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckLog(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckApprovals(vars.checkId) })
    },
  })
}

export function useApproveCheckStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      approvalId,
      checkId,
      action,
      profileId,
      profileName,
      notes,
    }: {
      approvalId: string
      checkId: string
      action: 'approved' | 'rejected'
      profileId: string | null
      profileName: string
      notes?: string | null
    }) => {
      const supabase = createClient()
      const now = new Date().toISOString()

      const { error: stepErr } = await supabase
        .from('inventory_check_approvals')
        .update({ status: action, profile_id: profileId, profile_name: profileName, action_at: now, notes: notes ?? null })
        .eq('id', approvalId)
      if (stepErr) throw stepErr

      await supabase.from('inventory_check_log').insert({
        check_id: checkId,
        event_type: 'approval_action',
        profile_id: profileId,
        profile_name: profileName,
        meta: { action },
      })

      if (action === 'rejected') {
        await supabase.from('inventory_checks').update({ status: 'rejected', reviewed_at: now, reviewed_by_name: profileName }).eq('id', checkId)
        await supabase.from('inventory_check_log').insert({ check_id: checkId, event_type: 'rejected', profile_id: profileId, profile_name: profileName })
        const { error: snapErr } = await supabase.rpc('snapshot_inventory_check_system_qty', { p_check_id: checkId })
        if (snapErr) throw snapErr
      } else {
        const { data: allSteps } = await supabase
          .from('inventory_check_approvals').select('status').eq('check_id', checkId)
        if ((allSteps ?? []).every((s) => s.status === 'approved')) {
          await supabase.from('inventory_checks').update({ status: 'approved', reviewed_at: now, reviewed_by_name: profileName }).eq('id', checkId)
          await supabase.from('inventory_check_log').insert({ check_id: checkId, event_type: 'approved', profile_id: profileId, profile_name: profileName })

          const { error: adjErr } = await supabase.rpc('apply_inventory_check_adjustments', { p_check_id: checkId })
          if (adjErr) throw adjErr
        }
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryChecks })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckApprovals(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckLog(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckDetail(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
    },
  })
}

export function useSaveItemCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      itemId,
      checkId,
      countedQty,
      varianceType,
    }: {
      itemId: string
      checkId: string
      countedQty: number
      varianceType: string | null
    }) => {
      const supabase = createClient()
      // variance is a generated column on inventory_check_items — DB computes it from counted_qty - system_qty
      const { error } = await supabase.rpc('save_inventory_check_item_count', {
        p_item_id:       itemId,
        p_counted_qty:   countedQty,
        p_variance_type: varianceType ?? '',
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckDetail(vars.checkId) })
    },
  })
}

// ─── Reorder Points ──────────────────────────────────────────────────

export type ReorderPoint = {
  id: string
  warehouse_id: string
  brand_variant_id: string
  reorder_point: number
  last_notified_at: string | null
  created_at: string
  updated_at: string
}

export function useReorderPoints(warehouseId?: string) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.reorderPointsByWarehouse(warehouseId),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('warehouse_reorder_points')
        .select('*')
        .order('created_at', { ascending: false })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ReorderPoint[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpsertReorderPoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      warehouseId, brandVariantId, reorderPoint,
    }: {
      warehouseId: string
      brandVariantId: string
      reorderPoint: number
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('warehouse_reorder_points')
        .upsert(
          { warehouse_id: warehouseId, brand_variant_id: brandVariantId, reorder_point: reorderPoint, updated_at: new Date().toISOString() },
          { onConflict: 'warehouse_id,brand_variant_id' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.reorderPoints })
    },
  })
}
