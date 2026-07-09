import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type WarehouseFieldRP = {
  profile_id: string
  full_name: string | null
  division_id: string | null
  division_name: string | null
}

export type Warehouse = DBTable<'warehouses'> & {
  field_rps: WarehouseFieldRP[]
  division_id: string | null
  division_name: string | null
}
export type WarehouseInsert = DBInsert<'warehouses'>
export type WarehouseUpdate = DBUpdate<'warehouses'>

export function useWarehouses() {
  return useQuery({
    queryKey: queryKeys.warehouses.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouses')
        .select('*, warehouse_field_rps(profile_id, profiles(full_name, division_id, company_divisions(id, name)))')
        .order('name')
      if (error) throw error
      return (data ?? []).map((row) => {
        const { warehouse_field_rps, ...rest } = row as typeof row & {
          warehouse_field_rps: Array<{
            profile_id: string
            profiles: {
              full_name: string | null
              division_id: string | null
              company_divisions: { id: string; name: string } | null
            } | null
          }>
        }
        const rps = (warehouse_field_rps ?? []).map((rp) => ({
          profile_id: rp.profile_id,
          full_name: rp.profiles?.full_name ?? null,
          division_id: rp.profiles?.division_id ?? null,
          division_name: rp.profiles?.company_divisions?.name ?? null,
        }))
        const firstWithDiv = rps.find((rp) => rp.division_id)
        return {
          ...rest,
          field_rps: rps,
          division_id: firstWithDiv?.division_id ?? null,
          division_name: firstWithDiv?.division_name ?? null,
        }
      }) as Warehouse[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: WarehouseInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouses')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Warehouse Created',
        module: 'warehouses',
        entity_id: data.id,
        entity_type: 'warehouse',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: WarehouseUpdate & { id: string }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('warehouses')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Warehouse Updated',
        module: 'warehouses',
        entity_id: id,
        entity_type: 'warehouse',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useDeleteWarehouse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { error } = await supabase.from('warehouses').delete().eq('id', id)
      if (error) throw error
      void logActivity({
        action: 'Warehouse Deleted',
        module: 'warehouses',
        entity_id: id,
        entity_type: 'warehouse',
        severity: 'warning',
        old_data: old as unknown as Record<string, unknown> | null,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}
