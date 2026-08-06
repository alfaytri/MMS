import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { sendNotifications, getApprovalScopeRecipients } from '@/lib/notify'
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
  | 'damaged_return_from_repair_as_good'
  // D.13 — types that live in `inventory_damaged_movements`, unioned into
  // the same feed by useStockMovements so the Warehouses → Movements tab
  // shows both good- and damaged-side history in one stream.
  | 'restock_as_damaged_in'
  | 'send_for_repair_out'
  | 'return_from_repair_as_writeoff'
  | 'damaged_write_off'
  | 'damaged_adjust'

export type StockMovement = {
  id: string
  warehouse_id: string
  sub_container_id: string | null
  sub_container_name: string | null
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
  // D.13 — 'damaged' means the row was sourced from
  // `inventory_damaged_movements`; 'good' from `inventory_stock_movements`.
  // Used by the UI stream chip + filter, and by the sub-container display
  // (damaged rows have no direct sub_container_id — the name is resolved
  // via the D.11 source-transfer chain).
  stream: 'good' | 'damaged'
}

export type WarehouseStockItem = {
  warehouse_id: string
  sub_container_id: string | null
  sub_container_name: string | null
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
  image_url: string | null
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
  from_sub_container_id: string | null
  to_sub_container_id: string | null
  from_sub_container_name: string | null
  to_sub_container_name: string | null
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
  from_sub_container_id?: string | null
  to_sub_container_id?: string | null
  date: string
  items: Array<{ brand_variant_id: string; item_name: string; sku: string | null; qty: number; unit_cost: number }>
  notes?: string | null
  created_by_profile_id?: string | null
  created_by_name?: string | null
}

export type StockAdjustment = {
  id: string
  warehouse_id: string
  sub_container_id: string | null
  sub_container_name: string | null
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
  source_check_id: string | null
  source_check_item_id: string | null
}

export type StockAdjustmentApprovalStep = {
  id: string
  adjustment_id: string
  step_order: number
  step_role: string
  step_label: string
  status: 'pending' | 'approved' | 'rejected'
  profile_id: string | null
  profile_name: string | null
  action_at: string | null
  notes: string | null
  created_at: string
}

export type InventoryCheck = {
  id: string
  check_number: string
  warehouse_id: string
  warehouse_name: string
  sub_container_id: string | null
  sub_container_name: string | null
  status: string
  initiated_by_profile_id: string | null
  initiated_by_name: string | null
  started_at: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
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
  assignment_id: string | null
  category_name: string | null
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
  // Inbound: sub-container name(s) from receival_items — one entry per DISTINCT
  // sub_container the receival touched. Almost always length 1 in practice.
  // Outbound: [] — sale_deliveries has no header sub_container_id column
  // (D.3 stamped only the movement). Sub-container is visible via Movements
  // tab or the delivery detail dialog.
  subContainerNames: string[]
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

      // D.13 — fetch both good-stock and damaged-stock movements in parallel,
      // then merge + sort by created_at desc + trim to `limit`. The
      // Warehouses → Movements tab is the single unified movement view now;
      // the Damaged Stock page's own Movements tab was dropped.
      let goodQ = supabase
        .from('inventory_stock_movements')
        .select('id, warehouse_id, sub_container_id, brand_variant_id, item_name, sku, movement_type, qty, unit_cost, reference_type, reference_id, notes, created_at, warehouse_sub_containers:sub_container_id(name)')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (warehouseId) goodQ = goodQ.eq('warehouse_id', warehouseId)

      // Damaged movements have no direct sub_container_id column (per D.5.a).
      // The source is resolved through the D.11 chain: prefer the direct
      // `source_transfer_id → warehouse_transfers.from_sub_container` join;
      // fall back via `source_return_line_disposition_id →
      // return_line_inventory_dispositions.warehouse_transfer_id →
      // warehouse_transfers.from_sub_container`.
      let damagedQ = supabase
        .from('inventory_damaged_movements')
        .select(`
          id,
          warehouse_id,
          brand_variant_id,
          movement_type,
          qty,
          unit_cost,
          notes,
          created_at,
          source_transfer_id,
          source_return_line_disposition_id,
          inventory_item_brand_variants (
            brand,
            code,
            inventory_items ( name_en, sku )
          ),
          direct_transfer:source_transfer_id (
            from_sub_container_id,
            warehouse_sub_containers:from_sub_container_id ( name )
          ),
          disposition:source_return_line_disposition_id (
            warehouse_transfer_id,
            warehouse_transfers:warehouse_transfer_id (
              from_sub_container_id,
              warehouse_sub_containers:from_sub_container_id ( name )
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (warehouseId) damagedQ = damagedQ.eq('warehouse_id', warehouseId)

      const [
        { data: goodRows,    error: goodErr    },
        { data: damagedRows, error: damagedErr },
      ] = await Promise.all([goodQ, damagedQ])
      if (goodErr)    throw goodErr
      if (damagedErr) throw damagedErr

      const good: StockMovement[] = (goodRows ?? []).map((r) => {
        const { warehouse_sub_containers, ...rest } = r as typeof r & { warehouse_sub_containers: { name: string } | null }
        return {
          ...rest,
          sub_container_name: warehouse_sub_containers?.name ?? null,
          stream: 'good',
        }
      }) as StockMovement[]

      type DamagedMovementJoinRow = {
        id: string
        warehouse_id: string
        brand_variant_id: string
        movement_type: string
        qty: number | string | null
        unit_cost: number | string | null
        notes: string | null
        created_at: string
        source_transfer_id: string | null
        source_return_line_disposition_id: string | null
        inventory_item_brand_variants: {
          brand: string | null
          code: string | null
          inventory_items: { name_en: string | null; sku: string | null } | null
        } | null
        direct_transfer: { warehouse_sub_containers: { name: string | null } | null } | null
        disposition: { warehouse_transfers: { warehouse_sub_containers: { name: string | null } | null } | null } | null
      }
      const damaged: StockMovement[] = ((damagedRows ?? []) as unknown as DamagedMovementJoinRow[]).map((r) => {
        // Resolve the source-chain sub-container name (direct wins, then
        // disposition), matching the D.11 damaged-stock page behaviour.
        const direct = r.direct_transfer?.warehouse_sub_containers?.name ?? null
        const viaDisp = r.disposition?.warehouse_transfers?.warehouse_sub_containers?.name ?? null
        const subName = direct ?? viaDisp

        // Damaged-side items — pull the display name via the brand-variant
        // join so the Item column looks the same as good-stock rows even
        // though `inventory_damaged_movements` has no `item_name` / `sku`
        // columns of its own.
        const bv = r.inventory_item_brand_variants
        const baseName = bv?.inventory_items?.name_en ?? ''
        const brand    = bv?.brand ?? ''
        const itemName = brand ? `${baseName} — ${brand}` : baseName || 'Unknown item'
        const baseSku  = bv?.inventory_items?.sku ?? ''
        const code     = bv?.code ?? ''
        const sku      = baseSku && code ? `${baseSku}-${code}` : baseSku || code || null

        // Best-effort reference for the Ref column: the outbound transfer if
        // present, else the disposition. Reference dialog already handles
        // `transfer` and can degrade for unknown types.
        const referenceType: string | null =
          r.source_transfer_id ? 'transfer' :
          r.source_return_line_disposition_id ? 'return' :
          null
        const referenceId: string | null =
          r.source_transfer_id ?? r.source_return_line_disposition_id ?? null

        return {
          id: r.id,
          warehouse_id: r.warehouse_id,
          // Damaged tables carry no sub_container_id column. The name comes
          // from the chain; leaving id null keeps the sub-container filter
          // from unintentionally matching a good-stock sub with the same name.
          sub_container_id: null,
          sub_container_name: subName,
          brand_variant_id: r.brand_variant_id,
          item_name: itemName,
          sku,
          movement_type: r.movement_type as StockMovementType,
          qty: Number(r.qty ?? 0),
          unit_cost: Number(r.unit_cost ?? 0),
          reference_type: referenceType,
          reference_id: referenceId,
          notes: r.notes ?? null,
          created_at: r.created_at,
          stream: 'damaged',
        }
      })

      const merged = [...good, ...damaged]
      merged.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      return merged.slice(0, limit)
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useWarehouseStock(warehouseId?: string, subContainerId?: string | null) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.warehouseStock(warehouseId ?? null, subContainerId ?? null),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('warehouse_stock_view')
        .select('warehouse_id, sub_container_id, sub_container_name, brand_variant_id, item_name, brand, sku, unit, qty, avg_cost, total_value, category_name, subcategory_name, item_type, allocated_qty, available_qty, image_url')
        .order('item_name', { ascending: true })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      if (subContainerId) q = q.eq('sub_container_id', subContainerId)
      // With sub-container broken out, one variant can now produce multiple
      // rows per warehouse. Bump the ceiling proportionally.
      const cap = warehouseId ? (subContainerId ? 1500 : 5000) : 20000
      const { data, error } = await q.limit(cap)
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
  const data = useMemo(() => {
    // Post-D.5: one variant can have multiple sub-container rows in the
    // same warehouse. Sum them so consumers get a warehouse-level total.
    const map = new Map<string, number>()
    for (const item of items) {
      map.set(item.brand_variant_id, (map.get(item.brand_variant_id) ?? 0) + item.qty)
    }
    return map
  }, [items])
  return { data, isLoading }
}

export function useWarehouseStockByItems(
  brandVariantIds: string[],
  subContainerId?: string | null,
) {
  const { data: allStock = [], isLoading } = useWarehouseStock(undefined, subContainerId)

  // Roll up first — needed to know which warehouse ids to name-lookup.
  const perWhRollup = useMemo(() => {
    const idSet = new Set(brandVariantIds)
    const perWhKey = new Map<string, { warehouse_id: string; qty: number }>()
    for (const s of allStock) {
      if (!idSet.has(s.brand_variant_id) || s.qty <= 0) continue
      const key = `${s.brand_variant_id}|${s.warehouse_id}`
      const existing = perWhKey.get(key)
      if (existing) existing.qty += s.qty
      else perWhKey.set(key, { warehouse_id: s.warehouse_id, qty: s.qty })
    }
    return perWhKey
  }, [allStock, brandVariantIds])

  const warehouseIds = useMemo(() => {
    const set = new Set<string>()
    for (const entry of perWhRollup.values()) set.add(entry.warehouse_id)
    return Array.from(set)
  }, [perWhRollup])

  // Fetch names by id so cross-division warehouses (not in the caller's
  // useWarehouses() list) still resolve to a readable label instead of "?".
  // Phase D.12 Task 5 surfaced this: Kitchen consuming shared Maintenance
  // stock previously rendered "?: 46" on the Create Delivery dialog because
  // the `warehouses` table is division-RLS-scoped. `get_warehouse_names`
  // is a SECURITY DEFINER RPC that bypasses that scope — names are non-
  // sensitive, and if the caller can see the stock row through the view
  // they can see the warehouse name too.
  const { data: whNames } = useQuery({
    queryKey: ['warehouse-names-by-id', [...warehouseIds].sort().join('|')],
    enabled: warehouseIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_warehouse_names', {
        p_ids: warehouseIds,
      })
      if (error) throw error
      const m = new Map<string, string>()
      for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
        m.set(row.id, row.name ?? '')
      }
      return m
    },
  })

  const data = useMemo(() => {
    const map = new Map<string, { warehouse_id: string; warehouse_name?: string; qty: number }[]>()
    for (const [key, entry] of perWhRollup.entries()) {
      const bvId = key.split('|')[0]
      const name = whNames?.get(entry.warehouse_id)
      const enriched = { ...entry, warehouse_name: name }
      if (!map.has(bvId)) map.set(bvId, [])
      map.get(bvId)!.push(enriched)
    }
    return map
  }, [perWhRollup, whNames])

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
  from_sub_container:from_sub_container_id(name),
  to_sub_container:to_sub_container_id(name),
  transfer_items:warehouse_transfer_items(*)
`)
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q.limit(50)
      if (error) throw error
      return (data ?? []).map((r) => {
        const { from_sub_container, to_sub_container, ...rest } = r as typeof r & {
          from_sub_container: { name: string } | null
          to_sub_container: { name: string } | null
        }
        return {
          ...rest,
          from_sub_container_name: from_sub_container?.name ?? null,
          to_sub_container_name: to_sub_container?.name ?? null,
        }
      }) as unknown as WarehouseTransfer[]
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
        p_from_sub_container_id: payload.from_sub_container_id ?? undefined,
        p_to_sub_container_id: payload.to_sub_container_id ?? undefined,
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
          warehouse_sub_containers:sub_container_id(name),
          inventory_item_brand_variants(brand, inventory_items(name_en, sku, inventory_categories(id, name_en, type))),
          stock_adjustment_approvals(
            id, adjustment_id, step_order, step_role, step_label, status,
            profile_id, profile_name, action_at, notes, created_at
          ),
          source_check:inventory_checks!source_check_id(id, check_number)
        `)
        .order('created_at', { ascending: false })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q.limit(100)
      if (error) throw error
      return (data ?? []).map((r) => {
        const { warehouse_sub_containers, ...rest } = r as typeof r & { warehouse_sub_containers: { name: string } | null }
        return { ...rest, sub_container_name: warehouse_sub_containers?.name ?? null }
      }) as unknown as StockAdjustment[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export type CreateAdjustmentV2Payload = {
  warehouseId: string
  subContainerId?: string | null
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
        p_sub_container_id:  payload.subContainerId ?? undefined,
      })
      if (error) {
        const cleanMessage = error.message.replace(/^P\d{4}:\s*/, '')
        throw new Error(cleanMessage)
      }
      return data as string
    },
    onSuccess: async (adjustmentId) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments })

      const recipients = await getApprovalScopeRecipients('stock_adj')
      if (recipients.length > 0) {
        await sendNotifications(recipients.map(pid => ({
          profile_id: pid,
          type: 'stock_adj_pending',
          title: 'Stock adjustment requires approval',
          related_id: adjustmentId,
          related_type: 'stock_adjustment',
        })))
        qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
      }
    },
  })
}

export function useAdjustmentPhotoSignedUrls(paths: (string | null | undefined)[]) {
  const validPaths = (paths.filter(Boolean) as string[])
    .filter((p) => !p.startsWith('http'))
    .slice()
    .sort()
  return useQuery({
    queryKey: queryKeys.warehouseOps.adjustmentPhotoSignedUrls(validPaths),
    enabled: validPaths.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const result: Record<string, string> = {}
      await Promise.all(
        validPaths.map(async (path) => {
          const { data } = await supabase.storage.from('adjustment-photos').createSignedUrl(path, 3600)
          if (data?.signedUrl) result[path] = data.signedUrl
        }),
      )
      return result
    },
    staleTime: 50 * 60 * 1000,
  })
}

export function useActionStockAdjustmentStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stepId, adjustmentId, action, profileId, profileName, notes,
    }: {
      stepId: string
      adjustmentId: string
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
      return { result: data as string, adjustmentId, action }
    },
    onSuccess: async ({ result, adjustmentId, action }) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments })
      if (result === 'chain_completed') {
        qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
        qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
        qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
        qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      }

      const supabase = createClient()
      const { data: adj } = await supabase
        .from('stock_adjustments')
        .select('requested_by')
        .eq('id', adjustmentId)
        .single()
      if (adj?.requested_by) {
        const type = action === 'rejected' ? 'stock_adj_rejected'
          : result === 'chain_completed' ? 'stock_adj_approved' : null
        if (type) {
          await sendNotifications([{
            profile_id: adj.requested_by,
            type,
            title: type === 'stock_adj_approved'
              ? 'Stock adjustment has been approved'
              : 'Stock adjustment has been rejected',
            related_id: adjustmentId,
            related_type: 'stock_adjustment',
          }])
          qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
        }
      }
    },
  })
}

export function useForceApproveStockAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      adjustmentId, comment,
    }: {
      adjustmentId: string
      comment?:     string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'force_approve_stock_adjustment' as never,
        {
          p_adjustment_id: adjustmentId,
          p_comment:       comment?.trim() || undefined,
        } as never,
      )
      if (error) {
        const cleanMessage = error.message.replace(/^P\d{4}:\s*/, '')
        throw new Error(cleanMessage)
      }
      return { count: Number(data ?? 0), adjustmentId }
    },
    onSuccess: async ({ adjustmentId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })

      const supabase = createClient()
      const { data: adj } = await supabase
        .from('stock_adjustments')
        .select('requested_by')
        .eq('id', adjustmentId)
        .single()
      if (adj?.requested_by) {
        await sendNotifications([{
          profile_id: adj.requested_by,
          type: 'stock_adj_approved',
          title: 'Stock adjustment force-approved by Owner',
          related_id: adjustmentId,
          related_type: 'stock_adjustment',
        }])
        qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
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
        .select('id, check_number, warehouse_id, warehouse_name, sub_container_id, status, reviewed_by_name, reviewed_at, notes, created_at, initiated_by_profile_id, initiated_by_name, started_at, warehouse_sub_containers:sub_container_id(name)')
        .order('created_at', { ascending: false })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q.limit(100)
      if (error) throw error
      return (data ?? []).map((r) => {
        const { warehouse_sub_containers, ...rest } = r as typeof r & { warehouse_sub_containers: { name: string } | null }
        return { ...rest, sub_container_name: warehouse_sub_containers?.name ?? null }
      }) as InventoryCheck[]
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
      return { ...data, sub_container_name: null } as unknown as InventoryCheck
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  })
}

export function useReceivalsAndDeliveries() {
  return useQuery({
    queryKey: queryKeys.warehouseOps.receivalsDeliveries,
    queryFn: async () => {
      const supabase = createClient()

      // Six-domains M1: cap join-heavy list fetches. PostgREST silently caps
      // at max_rows=1000; making it explicit prevents future drift.
      const [receivalsRes, deliveriesRes] = await Promise.all([
        supabase
          .from('receivals')
          .select('id, receival_number, po_id, warehouse_id, date, status, received_by_name, purchase_orders(po_number, supplier_name), warehouses(name), receival_items(id, item_name, sku, qty_received, brand_variant_id, sub_container_id, warehouse_sub_containers:sub_container_id(name))')
          .order('date', { ascending: false })
          .limit(200),
        supabase
          .from('sale_deliveries')
          .select('id, delivery_number, sale_order_id, warehouse_id, warehouse_name, date, status, sale_delivery_lines(item_name, sku, qty_delivered, brand_variant_id), sale_orders(so_number, customers(name))')
          .order('date', { ascending: false })
          .limit(200),
      ])

      if (receivalsRes.error) throw receivalsRes.error
      if (deliveriesRes.error) throw deliveriesRes.error

      const inbound: ReceivalDelivery[] = (receivalsRes.data ?? []).map((r) => {
        const rItems = Array.isArray(r.receival_items) ? r.receival_items : []
        const subNames = Array.from(
          new Set(
            rItems
              .map((ri) => (ri as unknown as { warehouse_sub_containers?: { name: string } | null }).warehouse_sub_containers?.name)
              .filter((n): n is string => !!n),
          ),
        )
        return {
          id: r.id,
          direction: 'inbound' as const,
          docNumber: r.receival_number ?? '',
          reference: r.purchase_orders?.po_number ?? '',
          warehouseId: r.warehouse_id ?? '',
          warehouseName: r.warehouses?.name ?? '',
          subContainerNames: subNames,
          counterparty: r.purchase_orders?.supplier_name ?? '',
          date: r.date ?? '',
          items: rItems.map((ri) => ({ name: ri.item_name ?? '', sku: ri.sku ?? '', qty: ri.qty_received ?? 0, brand_variant_id: ri.brand_variant_id ?? null })),
          itemCount: rItems.length,
          status: r.status ?? 'pending',
        }
      })

      const outbound: ReceivalDelivery[] = (deliveriesRes.data ?? []).map((d) => ({
        id: d.id,
        direction: 'outbound' as const,
        docNumber: d.delivery_number ?? '',
        reference: d.sale_orders?.so_number ?? '',
        warehouseId: d.warehouse_id ?? '',
        warehouseName: d.warehouse_name ?? '',
        // sale_deliveries has no header sub_container_id — D.3 stamped only the
        // movement. Left empty here; see Movements tab or delivery detail dialog.
        subContainerNames: [],
        counterparty: d.sale_orders?.customers?.name ?? '',
        date: d.date ?? '',
        items: Array.isArray(d.sale_delivery_lines) ? d.sale_delivery_lines.map((di) => ({ name: di.item_name ?? '', sku: di.sku ?? '', qty: di.qty_delivered ?? 0, brand_variant_id: di.brand_variant_id ?? null })) : [],
        itemCount: Array.isArray(d.sale_delivery_lines) ? d.sale_delivery_lines.length : 0,
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

export type CheckGeneratedSA = {
  id: string
  adjustment_type: string
  qty: number
  status: string
  created_at: string
  approved_at: string | null
  source_check_item_id: string | null
  reason: string
  notes: string | null
  item_name: string | null
  sku: string | null
  brand: string | null
}

export function useInventoryCheckGeneratedSAs(checkId: string) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.inventoryCheckGeneratedSAs(checkId),
    queryFn: async () => {
      const supabase = createClient()
      // Cast through unknown: source_check_id / source_check_item_id landed
      // in migration 20260726120000 but generated types are still stale
      // (dev project paused during regen).
      const q = supabase.from('stock_adjustments' as never)
        .select(`
          id, adjustment_type, qty, status, created_at, approved_at,
          source_check_item_id, reason, notes,
          inventory_item_brand_variants(brand, inventory_items(name_en, sku))
        `)
        .eq('source_check_id', checkId)
        .order('created_at', { ascending: true })
      const { data, error } = await q as unknown as {
        data: Array<{
          id: string
          adjustment_type: string
          qty: number | string
          status: string
          created_at: string
          approved_at: string | null
          source_check_item_id: string | null
          reason: string
          notes: string | null
          inventory_item_brand_variants: {
            brand: string | null
            inventory_items: { name_en: string | null; sku: string | null } | null
          } | null
        }> | null
        error: Error | null
      }
      if (error) throw error
      return (data ?? []).map((r) => ({
        id:                    r.id,
        adjustment_type:       r.adjustment_type,
        qty:                   Number(r.qty),
        status:                r.status,
        created_at:            r.created_at,
        approved_at:           r.approved_at,
        source_check_item_id:  r.source_check_item_id,
        reason:                r.reason,
        notes:                 r.notes,
        item_name:             r.inventory_item_brand_variants?.inventory_items?.name_en ?? null,
        sku:                   r.inventory_item_brand_variants?.inventory_items?.sku ?? null,
        brand:                 r.inventory_item_brand_variants?.brand ?? null,
      } as CheckGeneratedSA))
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
  subContainerId?: string | null
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
          sub_container_id: payload.subContainerId ?? null,
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

      return { ...check, sub_container_name: null } as unknown as InventoryCheck
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

      const { error: userCompletedErr } = await supabase.from('inventory_check_log').insert({
        check_id: checkId,
        event_type: 'user_completed',
        profile_id: profileId,
        profile_name: profileName,
      })
      if (userCompletedErr) throw userCompletedErr

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

        // step_role is stored as text in the DB (migration 20260726130000
        // reverted the Pass 1 enum — workflow admins can configure any role
        // slug). database.types.ts matches: `step_role: string`.
        const chainRows = steps.map((s) => ({ check_id: checkId, ...s, status: 'pending' as const }))
        const { error: chainInsertErr } = await supabase
          .from('inventory_check_approvals')
          .insert(chainRows)
        if (chainInsertErr) throw chainInsertErr

        await supabase.from('inventory_checks').update({ status: 'pending_approval' }).eq('id', checkId)

        const { error: allCountedErr } = await supabase.from('inventory_check_log').insert({
          check_id: checkId,
          event_type: 'all_counted',
          profile_name: 'System',
        })
        if (allCountedErr) throw allCountedErr

        const recipients = await getApprovalScopeRecipients('inv_check')
        if (recipients.length > 0) {
          await sendNotifications(recipients.map(pid => ({
            profile_id: pid,
            type: 'inv_check_pending',
            title: 'Inventory check requires approval',
            related_id: checkId,
            related_type: 'inventory_check',
          })))
        }
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

      const { error: approvalActionErr } = await supabase.from('inventory_check_log').insert({
        check_id: checkId,
        event_type: 'approval_action',
        profile_id: profileId,
        profile_name: profileName,
        meta: { action },
      })
      if (approvalActionErr) throw approvalActionErr

      let outcome: 'rejected' | 'approved' | 'step_approved' = 'step_approved'

      if (action === 'rejected') {
        await supabase.from('inventory_checks').update({ status: 'rejected', reviewed_at: now, reviewed_by_name: profileName }).eq('id', checkId)
        await supabase.from('inventory_check_log').insert({ check_id: checkId, event_type: 'rejected', profile_id: profileId, profile_name: profileName })
        const { error: snapErr } = await supabase.rpc('snapshot_inventory_check_system_qty', { p_check_id: checkId })
        if (snapErr) throw snapErr
        outcome = 'rejected'
      } else {
        const { data: allSteps } = await supabase
          .from('inventory_check_approvals').select('status').eq('check_id', checkId)
        if ((allSteps ?? []).every((s) => s.status === 'approved')) {
          await supabase.from('inventory_checks').update({ status: 'approved', reviewed_at: now, reviewed_by_name: profileName }).eq('id', checkId)
          await supabase.from('inventory_check_log').insert({ check_id: checkId, event_type: 'approved', profile_id: profileId, profile_name: profileName })

          const { error: adjErr } = await supabase.rpc('apply_inventory_check_adjustments', { p_check_id: checkId })
          if (adjErr) throw adjErr
          outcome = 'approved'
        }
      }

      return outcome
    },
    onSuccess: async (outcome, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryChecks })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckApprovals(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckLog(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckDetail(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckGeneratedSAs(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })

      if (outcome === 'approved' || outcome === 'rejected') {
        const supabase = createClient()
        const { data: check } = await supabase
          .from('inventory_checks')
          .select('initiated_by_profile_id')
          .eq('id', vars.checkId)
          .single()
        if (check?.initiated_by_profile_id) {
          const type = outcome === 'approved' ? 'inv_check_approved' : 'inv_check_rejected'
          await sendNotifications([{
            profile_id: check.initiated_by_profile_id,
            type,
            title: outcome === 'approved'
              ? 'Inventory check has been approved'
              : 'Inventory check has been rejected',
            related_id: vars.checkId,
            related_type: 'inventory_check',
          }])
          qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
        }
      }
    },
  })
}

export function useSaveItemCount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      itemId,
      checkId: _checkId,
      countedQty,
      varianceType,
      assignmentId,
      profileId,
      profileName,
    }: {
      itemId: string
      checkId: string
      countedQty: number
      varianceType: string | null
      // Optional assignment context — when the counter is saving their own
      // assignment's items, pass these so the RPC atomically transitions
      // pending → in_progress + writes a 'user_started' log event on the
      // very first save. Idempotent: only fires when status is still 'pending'.
      assignmentId?: string | null
      profileId?: string | null
      profileName?: string | null
    }) => {
      const supabase = createClient()
      // variance is a generated column on inventory_check_items — DB computes it from counted_qty - system_qty
      const { error } = await supabase.rpc('save_inventory_check_item_count', {
        p_item_id:        itemId,
        p_counted_qty:    countedQty,
        p_variance_type:  varianceType ?? '',
        p_assignment_id:  assignmentId ?? undefined,
        p_profile_id:     profileId ?? undefined,
        p_profile_name:   profileName ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckDetail(vars.checkId) })
      // Refresh the log so the fresh 'user_started' event shows up on the Timeline tab.
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckLog(vars.checkId) })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.inventoryCheckAssignments(vars.checkId) })
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
      // Six-domains M3: explicit cap. Realistic size = variants × warehouses.
      let q = supabase
        .from('warehouse_reorder_points')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000)
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
