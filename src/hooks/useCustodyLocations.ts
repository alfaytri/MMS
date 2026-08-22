/**
 * Custody Locations — unified hook family (replaces useTeamSubContainers +
 * usePlaceSubContainers after the Virtual Warehouses redesign, 2026-08-12).
 *
 * "Teams" and "Places" collapsed into ONE `warehouse_kind='custody'` behavior.
 * A custody location is a `warehouse_sub_containers` row under a custody warehouse
 * (e.g. the "Teams" or "Projects" warehouse), scoped to a division. Operators can
 * create any number of custody warehouses, each holding any number of locations.
 *
 * Reads go through the SECURITY DEFINER RPC `get_custody_master_list` so master-data
 * screens see every division's rows regardless of active-division RLS. Writes go
 * through `rpc_upsert_warehouse_sub_container` (also SECURITY DEFINER, bypasses the
 * sub_container insert RLS so an admin can create in any division).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type CustodyLocationRow = {
  id:                              string
  name:                            string
  warehouse_id:                    string
  warehouse_name:                  string
  division_id:                     string | null
  division_name:                   string | null
  is_active:                       boolean
  responsible_person_profile_id:   string | null
  responsible_person_name:         string | null
  responsible_person_phone:        string | null
  created_at:                      string | null
  updated_at:                      string | null
}

export type CustodyWarehouse = {
  id:                   string
  name:                 string
  warehouse_kind:       string
  is_project_warehouse: boolean
}

// 23505 is the (warehouse_id, division_id, name) unique violation on
// warehouse_sub_containers — same name is allowed in different divisions.
function mapDbError(err: { code?: string; message?: string } | null | undefined): Error {
  if (!err) return new Error('Unknown error')
  if (err.code === '23505') {
    return new Error('A custody location with that name already exists in this warehouse and division.')
  }
  return new Error(err.message ?? 'Unknown error')
}

// ─── 1. Custody warehouses (for tabs, admin grouping, permission tree) ────
export function useCustodyWarehouses() {
  return useQuery({
    queryKey: queryKeys.custody.warehouses,
    queryFn: async (): Promise<CustodyWarehouse[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name, warehouse_kind, is_project_warehouse')
        .eq('warehouse_kind', 'custody')
        .order('name')
        .limit(200)
      if (error) throw error
      return (data ?? []) as CustodyWarehouse[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── 2. Custody locations (all, or one warehouse) ─────────────────────────
export function useCustodyLocations(warehouseId?: string | null) {
  return useQuery({
    queryKey: queryKeys.custody.locations(warehouseId ?? undefined),
    queryFn: async (): Promise<CustodyLocationRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_custody_master_list', {
        p_warehouse_id: warehouseId ?? undefined,
      })
      if (error) throw error
      return (data ?? []).map((r): CustodyLocationRow => ({
        id:                              r.id,
        name:                            r.name,
        warehouse_id:                    r.warehouse_id,
        warehouse_name:                  r.warehouse_name,
        division_id:                     r.division_id,
        division_name:                   r.division_name,
        is_active:                       r.is_active,
        responsible_person_profile_id:   r.responsible_person_profile_id,
        responsible_person_name:         r.responsible_person_name,
        responsible_person_phone:        r.responsible_person_phone,
        created_at:                      r.created_at,
        updated_at:                      r.updated_at,
      }))
    },
    staleTime: 60_000,
  })
}

// ─── 3. Create ────────────────────────────────────────────────────────────
export function useCreateCustodyLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      warehouse_id: string
      name: string
      division_id: string
      responsible_person_profile_id?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_upsert_warehouse_sub_container', {
        p_warehouse_id: payload.warehouse_id,
        p_name:         payload.name.trim(),
        p_division_id:  payload.division_id,
        p_is_active:    true,
        p_responsible_person_profile_id: payload.responsible_person_profile_id ?? undefined,
      })
      if (error) throw mapDbError(error)
      return data as unknown as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custody-locations'] })
      qc.invalidateQueries({ queryKey: ['sub-containers-by-warehouse'] })
      qc.invalidateQueries({ queryKey: ['warehouse-sub-containers'] })
    },
  })
}

// ─── 4. Update ────────────────────────────────────────────────────────────
export function useUpdateCustodyLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      warehouse_id: string
      name?: string
      division_id?: string
      is_active?: boolean
      responsible_person_profile_id?: string | null  // undefined = leave alone, null = clear
    }) => {
      const supabase = createClient()
      const { data: rows, error: listErr } = await supabase.rpc('get_custody_master_list', {
        p_warehouse_id: payload.warehouse_id,
      })
      if (listErr) throw listErr
      const current = (rows ?? []).find((r) => r.id === payload.id)
      if (!current) throw new Error('Custody location not found')

      const { data, error } = await supabase.rpc('rpc_upsert_warehouse_sub_container', {
        p_warehouse_id: payload.warehouse_id,
        p_id:           payload.id,
        p_name:         (payload.name ?? current.name).trim(),
        p_division_id:  payload.division_id ?? current.division_id ?? undefined,
        p_is_active:    payload.is_active ?? current.is_active,
        p_responsible_person_profile_id:
          (payload.responsible_person_profile_id === undefined
            ? current.responsible_person_profile_id
            : payload.responsible_person_profile_id) ?? undefined,
      })
      if (error) throw mapDbError(error)
      return data as unknown as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custody-locations'] })
      qc.invalidateQueries({ queryKey: ['sub-containers-by-warehouse'] })
      qc.invalidateQueries({ queryKey: ['warehouse-sub-containers'] })
    },
  })
}
