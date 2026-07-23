'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type WarehouseResponsiblePersonRow = {
  id: string
  warehouse_id: string
  profile_id: string
  created_at: string
  profile_name: string | null
}

/**
 * Fetch all responsible-person assignments for a warehouse.
 */
export function useWarehouseResponsiblePersons(warehouseId: string | null) {
  return useQuery({
    queryKey: queryKeys.warehouseOps.responsiblePersonsByWarehouse(warehouseId),
    enabled: !!warehouseId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_responsible_persons')
        .select('*, profiles(full_name)')
        .eq('warehouse_id', warehouseId!)
      if (error) throw error
      return (data ?? []).map((row) => {
        const { profiles, ...rest } = row as typeof row & { profiles: { full_name: string | null } | null }
        return { ...rest, profile_name: profiles?.full_name ?? null } as WarehouseResponsiblePersonRow
      })
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch all profiles eligible to be a warehouse responsible person —
 * any role holding the `warehouse.responsible_person` permission. Replaces
 * the old custom_roles.is_warehouse_responsible boolean (dropped 2026-07-24).
 */
export function useResponsiblePersonCandidates() {
  return useQuery({
    queryKey: ['warehouse_responsible_person_candidates'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('profile_id, profiles!user_custom_roles_profile_id_fkey(full_name), custom_roles!inner(name, permissions, deleted_at)')
        .contains('custom_roles.permissions', ['warehouse.responsible_person'])
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
 * Replace all responsible-person assignments for a warehouse atomically.
 * Uses a SECURITY DEFINER RPC to bypass RLS.
 */
export function useReplaceWarehouseResponsiblePersons() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ warehouseId, profileIds }: { warehouseId: string; profileIds: string[] }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('replace_warehouse_responsible_persons', {
        p_warehouse_id: warehouseId,
        p_profile_ids: profileIds,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.responsiblePersons })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}
