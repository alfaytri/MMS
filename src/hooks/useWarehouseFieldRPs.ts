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
 * Fetch all Field RP assignments for a warehouse.
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
 * Fetch all profiles that have the field_rp role — for the assignment dropdown.
 */
export function useFieldRPCandidates() {
  return useQuery({
    queryKey: ['field_rp_candidates'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('profile_id, profiles!user_custom_roles_profile_id_fkey(full_name), custom_roles!inner(name)')
        .eq('custom_roles.name', 'field_rp')
      if (error) throw error
      return (data ?? []).map((row) => {
        const r = row as typeof row & { profiles: { full_name: string | null } | null }
        return {
          profile_id: r.profile_id,
          full_name: r.profiles?.full_name ?? null,
        }
      })
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Replace all Field RP assignments for a warehouse atomically.
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
