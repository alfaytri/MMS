'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBTable } from '@/types/database.types'

export type WarehouseItemRequest = DBTable<'warehouse_item_requests'>
export type ItemRequestStatus = 'pending' | 'fulfilled' | 'dismissed'

type Filters = { status?: ItemRequestStatus | 'all'; warehouseIds?: string[] }

/**
 * PostgrestError is not an Error subclass — wrap it into a real Error that keeps
 * the code/message/details/hint so the UI surfaces the real reason, not a generic one.
 */
function asError(
  e: { code?: string | null; message?: string; details?: string | null; hint?: string | null } | null,
  fallback: string,
): Error {
  if (!e) return new Error(fallback)
  const parts = [e.code, e.message, e.details, e.hint].filter(Boolean)
  return new Error(parts.length ? parts.join(' — ') : fallback)
}

/**
 * Item requests for the warehouse(s) the caller is RP of (owners/accountants/
 * admins see all — enforced by RLS). Default view is Pending, newest first.
 */
export function useWarehouseItemRequests(filters: Filters = {}) {
  return useQuery({
    queryKey: queryKeys.warehouseItemRequests.list(filters),
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('warehouse_item_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300)
      if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status)
      if (filters.warehouseIds && filters.warehouseIds.length > 0) {
        q = q.in('warehouse_id', filters.warehouseIds)
      }
      const { data, error } = await q
      if (error) throw asError(error, 'Failed to load item requests')
      return (data ?? []) as WarehouseItemRequest[]
    },
  })
}

/** Fulfil or dismiss a request (guarded RPC clears the related bell notifications). */
export function useResolveItemRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: 'fulfilled' | 'dismissed'; note?: string | null }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_resolve_item_request', {
        p_request_id: v.id,
        p_status: v.status,
        p_note: v.note ?? undefined,
      })
      if (error) throw asError(error, 'Failed to resolve the request')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseItemRequests.all })
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export type CustodyAssignRequest = {
  id: string
  transfer_number: string
  request_group_id: string | null
  from_warehouse_id: string
  dest_name: string | null
  requester_name: string | null
  status: string               // 'pending' (awaiting dispatch) | 'in_transit' (dispatched) | 'received' | 'cancelled' | …
  created_at: string
  items: { id: string; item_name: string; requested_qty: number }[]
}

/**
 * The "in inventory" side of a team request: custody stock-assign transfers.
 * `warehouse_transfers` RLS is permissive (internal users see all), so callers
 * must pass the RP's warehouse ids to scope (or omit to show all, for admins).
 */
export function useCustodyAssignRequests(warehouseIds?: string[]) {
  return useQuery({
    queryKey: [...queryKeys.warehouseItemRequests.all, 'custody-assigns', warehouseIds ? [...warehouseIds].sort() : 'all'],
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('warehouse_transfers')
        .select('id, transfer_number, request_group_id, from_warehouse_id, status, created_at, created_by_name, to_sub:to_sub_container_id(name), warehouse_transfer_items(id, item_name, requested_qty)')
        .eq('transfer_kind', 'custody_assign')
        .order('created_at', { ascending: false })
        .limit(300)
      if (warehouseIds && warehouseIds.length > 0) q = q.in('from_warehouse_id', warehouseIds)
      const { data, error } = await q
      if (error) throw asError(error, 'Failed to load stock requests')
      type SubRef = { name: string | null } | { name: string | null }[] | null
      type Row = {
        id: string; transfer_number: string; request_group_id: string | null
        from_warehouse_id: string; status: string; created_at: string; created_by_name: string | null
        to_sub: SubRef
        warehouse_transfer_items: { id: string; item_name: string | null; requested_qty: number }[] | null
      }
      return ((data ?? []) as unknown as Row[]).map((r) => {
        const sub = Array.isArray(r.to_sub) ? r.to_sub[0] : r.to_sub
        return {
          id: r.id,
          transfer_number: r.transfer_number,
          request_group_id: r.request_group_id,
          from_warehouse_id: r.from_warehouse_id,
          dest_name: sub?.name ?? null,
          requester_name: r.created_by_name,
          status: r.status,
          created_at: r.created_at,
          items: (r.warehouse_transfer_items ?? []).map((i) => ({
            id: i.id, item_name: i.item_name ?? '—', requested_qty: i.requested_qty,
          })),
        }
      }) as CustodyAssignRequest[]
    },
  })
}

/** Warehouse ids the current user is a responsible person of — used to scope the in-inventory side. */
export function useMyResponsibleWarehouseIds() {
  return useQuery({
    queryKey: [...queryKeys.warehouseItemRequests.all, 'my-rp-warehouses'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return [] as string[]
      const { data: prof } = await supabase.from('user_data').select('id').eq('auth_user_id', auth.user.id).maybeSingle()
      if (!prof?.id) return [] as string[]
      const { data, error } = await supabase
        .from('warehouse_responsible_persons').select('warehouse_id').eq('profile_id', prof.id).limit(200)
      if (error) throw asError(error, 'Failed to load your warehouses')
      return [...new Set((data ?? []).map((r) => r.warehouse_id).filter(Boolean))] as string[]
    },
  })
}
