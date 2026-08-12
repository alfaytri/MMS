/**
 * Teams + Places custody moves — hook family for the /warehouse/custody page.
 *
 * Wraps the three SECURITY DEFINER RPCs shipped in migration
 * 20260815000900_rpc_custody_moves.sql:
 *
 *   rpc_create_custody_assign  → useCreateCustodyAssign
 *   rpc_accept_custody_assign  → useAcceptCustodyAssign
 *   rpc_create_custody_return  → useCreateCustodyReturn
 *
 * Plus one read hook — usePendingCustodyAssigns — that surfaces every
 * in_transit custody_assign transfer routed to a Teams / Places sub so
 * the card can show a "Pending your acceptance" badge to the destination
 * sub's responsible person.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

// ─── Types ──────────────────────────────────────────────────────────────

export type CustodyAssignStage = 'pending' | 'in_transit'

export type PendingCustodyAssign = {
  transfer_id:            string
  transfer_number:        string
  status:                 CustodyAssignStage
  from_warehouse_id:      string
  from_warehouse_name:    string | null
  from_sub_container_id:  string | null
  from_sub_container_name: string | null
  to_sub_container_id:    string
  dispatched_at:          string | null
  created_by_name:        string | null
  item_count:             number
  total_qty:              number
}

export type CustodyLine = { brand_variant_id: string; qty: number }

// ─── 1. Read — pending + in-transit custody-assign transfers ─────────
// Returns every warehouse_transfer where transfer_kind='custody_assign'
// AND status IN ('pending','in_transit') so the Custody page card can
// render both "awaiting dispatch" and "awaiting acceptance" chips at
// the same time.
export function usePendingCustodyAssigns() {
  return useQuery({
    queryKey: queryKeys.custody.pendingAll,
    queryFn: async (): Promise<PendingCustodyAssign[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_transfers')
        .select(`
          id, transfer_number, status,
          from_warehouse_id, to_sub_container_id, from_sub_container_id,
          dispatched_at, created_by_name,
          from_warehouse:from_warehouse_id(name),
          from_sub:from_sub_container_id(name),
          warehouse_transfer_items(id, requested_qty)
        `)
        .eq('transfer_kind', 'custody_assign')
        .in('status', ['pending', 'in_transit'])
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) throw error

      return (data ?? []).map((row) => {
        const items = (row as unknown as { warehouse_transfer_items: Array<{ requested_qty: number | null }> }).warehouse_transfer_items ?? []
        const fromWh = (row as unknown as { from_warehouse: { name: string | null } | null }).from_warehouse
        const fromSub = (row as unknown as { from_sub: { name: string | null } | null }).from_sub
        return {
          transfer_id:             row.id as string,
          transfer_number:         row.transfer_number as string,
          status:                  (row.status as CustodyAssignStage),
          from_warehouse_id:       row.from_warehouse_id as string,
          from_warehouse_name:     fromWh?.name ?? null,
          from_sub_container_id:   row.from_sub_container_id as string | null,
          from_sub_container_name: fromSub?.name ?? null,
          to_sub_container_id:     row.to_sub_container_id as string,
          dispatched_at:           (row.dispatched_at as string | null) ?? null,
          created_by_name:         (row.created_by_name as string | null) ?? null,
          item_count:              items.length,
          total_qty:               items.reduce((sum, i) => sum + (i.requested_qty ?? 0), 0),
        }
      })
    },
    staleTime: 30 * 1000,
  })
}

// ─── 2. Mutation — create custody_assign transfer (WH → custody sub) ──
export function useCreateCustodyAssign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_warehouse_id:     string
      source_sub_container_id: string
      dest_sub_container_id:   string
      items:                   CustodyLine[]
      notes?:                  string | null
      created_by_profile_id?:  string | null
      created_by_name?:        string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_create_custody_assign', {
        p_source_warehouse_id:     payload.source_warehouse_id,
        p_source_sub_container_id: payload.source_sub_container_id,
        p_dest_sub_container_id:   payload.dest_sub_container_id,
        p_items:                   payload.items,
        p_notes:                   payload.notes ?? undefined,
        p_created_by_profile_id:   payload.created_by_profile_id ?? undefined,
        p_created_by_name:         payload.created_by_name ?? undefined,
      })
      if (error) throw new Error(error.message)
      return data as unknown as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.custody.pendingAll })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
    },
  })
}

// ─── 3. Mutation — dispatch custody_assign (source WH RP loads van) ──
export function useDispatchCustodyAssign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      transfer_id:                string
      dispatched_by_profile_id?:  string | null
      dispatched_by_name?:        string | null
    }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_dispatch_custody_assign', {
        p_transfer_id:              payload.transfer_id,
        p_dispatched_by_profile_id: payload.dispatched_by_profile_id ?? undefined,
        p_dispatched_by_name:       payload.dispatched_by_name ?? undefined,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.custody.pendingAll })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
    },
  })
}

// ─── 4. Mutation — accept custody_assign (custodian confirms) ─────────
export function useAcceptCustodyAssign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      transfer_id:              string
      receipts:                 { transfer_item_id: string; received_qty: number; shrinkage_reason?: string | null }[]
      accepted_by_profile_id?:  string | null
      accepted_by_name?:        string | null
    }) => {
      const supabase = createClient()
      // Cast — the new 4-arg signature (adds p_receipts) is typed after the next gen-types run.
      const { error } = await supabase.rpc('rpc_accept_custody_assign' as never, {
        p_transfer_id:            payload.transfer_id,
        p_receipts:               payload.receipts,
        p_accepted_by_profile_id: payload.accepted_by_profile_id ?? null,
        p_accepted_by_name:       payload.accepted_by_name ?? null,
      } as never)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.custody.pendingAll })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
    },
  })
}

// ─── 4. Mutation — create custody_return transfer (custody sub → WH) ─
export function useCreateCustodyReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_sub_container_id: string
      dest_warehouse_id:       string
      dest_sub_container_id:   string
      items:                   CustodyLine[]
      notes?:                  string | null
      created_by_profile_id?:  string | null
      created_by_name?:        string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_create_custody_return', {
        p_source_sub_container_id: payload.source_sub_container_id,
        p_dest_warehouse_id:       payload.dest_warehouse_id,
        p_dest_sub_container_id:   payload.dest_sub_container_id,
        p_items:                   payload.items,
        p_notes:                   payload.notes ?? undefined,
        p_created_by_profile_id:   payload.created_by_profile_id ?? undefined,
        p_created_by_name:         payload.created_by_name ?? undefined,
      })
      if (error) throw new Error(error.message)
      return data as unknown as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
    },
  })
}

// ─── 6. Mutation — request an item the warehouse doesn't stock (notify RP) ─
// Fires an in-app notification to every responsible person of the source
// warehouse. No stock moves — it's a "please buy this" signal. Returns the
// number of people notified.
export function useRequestWarehouseItem() {
  return useMutation({
    mutationFn: async (payload: {
      warehouse_id:            string
      item_name:               string
      qty:                     number
      dest_sub_container_id?:  string | null
      notes?:                  string | null
    }) => {
      const supabase = createClient()
      // Cast the name/args — this RPC is typed after the next `gen types` run.
      const { data, error } = await supabase.rpc('rpc_request_warehouse_item' as never, {
        p_warehouse_id:          payload.warehouse_id,
        p_item_name:             payload.item_name,
        p_qty:                   payload.qty,
        p_dest_sub_container_id: payload.dest_sub_container_id ?? null,
        p_notes:                 payload.notes ?? null,
      } as never)
      if (error) throw new Error(error.message)
      return data as unknown as number
    },
  })
}

// ─── 7. Read — a custody-assign transfer's line items (for the Accept dialog) ─
export type CustodyTransferItem = {
  id:               string
  brand_variant_id: string
  item_name:        string
  sku:              string | null
  dispatched_qty:   number
}

export function useCustodyTransferItems(transferId: string | null) {
  return useQuery({
    queryKey: ['custody-transfer-items', transferId],
    enabled: !!transferId,
    queryFn: async (): Promise<CustodyTransferItem[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_transfer_items')
        .select('id, brand_variant_id, item_name, sku, dispatched_qty, requested_qty')
        .eq('transfer_id', transferId!)
        .order('item_name')
      if (error) throw error
      return (data ?? []).map((r) => ({
        id:               r.id as string,
        brand_variant_id: r.brand_variant_id as string,
        item_name:        (r.item_name as string) ?? '',
        sku:              (r.sku as string | null) ?? null,
        dispatched_qty:   (r.dispatched_qty as number | null) ?? (r.requested_qty as number | null) ?? 0,
      }))
    },
    staleTime: 30 * 1000,
  })
}
