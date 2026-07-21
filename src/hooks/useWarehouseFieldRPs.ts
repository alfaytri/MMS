'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type FieldRPRow = {
  id: string
  warehouse_id: string
  profile_id: string
  created_at: string
  profile_name: string | null
}

/**
 * Fetch all Warehouse RP assignments for a warehouse.
 */
export function useWarehouseFieldRPs(warehouseId: string | null) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.warehouseFieldRPsByWarehouse(warehouseId),
    enabled: !!warehouseId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_field_rps')
        .select('*, profiles(full_name)')
        .eq('warehouse_id', warehouseId!)
      if (error) throw error
      return (data ?? []).map((row) => {
        const { profiles, ...rest } = row as typeof row & { profiles: { full_name: string | null } | null }
        return { ...rest, profile_name: profiles?.full_name ?? null } as FieldRPRow
      })
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch all profiles that have a Field-RP-flagged role assigned —
 * for the warehouse assignment dropdown.
 *
 * Previously this queried by role NAME ('field_rp'). Now it queries by the
 * `custom_roles.is_warehouse_responsible` toggle added in migration 20260627117000, so
 * any role can be flagged as a Warehouse RP source (multiple flagged roles =
 * dedupe by profile_id).
 */
export function useFieldRPCandidates() {
  return useQuery({
    queryKey: ['field_rp_candidates'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('profile_id, profiles!user_custom_roles_profile_id_fkey(full_name), custom_roles!inner(name, is_warehouse_responsible, deleted_at)')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq('custom_roles.is_warehouse_responsible' as any, true)
        .is('custom_roles.deleted_at', null)
      if (error) throw error
      const dedup = new Map<string, { profile_id: string; full_name: string | null }>()
      for (const row of (data ?? [])) {
        const r = row as typeof row & { profiles: { full_name: string | null } | null }
        if (!dedup.has(r.profile_id)) {
          dedup.set(r.profile_id, {
            profile_id: r.profile_id,
            full_name: r.profiles?.full_name ?? null,
          })
        }
      }
      return Array.from(dedup.values())
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Replace all Warehouse RP assignments for a warehouse atomically.
 * Uses a SECURITY DEFINER RPC to bypass RLS (no INSERT/DELETE policies on the table).
 */
export function useReplaceWarehouseFieldRPs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ warehouseId, profileIds }: { warehouseId: string; profileIds: string[] }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('replace_warehouse_field_rps', {
        p_warehouse_id: warehouseId,
        p_profile_ids: profileIds,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseFieldRPs })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}
