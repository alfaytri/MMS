import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type WarehouseFieldRP = {
  profile_id: string
  full_name: string | null
}

export type Warehouse = DBTable<'warehouses'> & {
  field_rps: WarehouseFieldRP[]
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
        .select('*, warehouse_field_rps(profile_id, profiles(full_name))')
        .order('name')
      if (error) throw error
      return (data ?? []).map((row) => {
        const { warehouse_field_rps, ...rest } = row as typeof row & {
          warehouse_field_rps: Array<{ profile_id: string; profiles: { full_name: string | null } | null }>
        }
        return {
          ...rest,
          field_rps: (warehouse_field_rps ?? []).map((rp) => ({
            profile_id: rp.profile_id,
            full_name: rp.profiles?.full_name ?? null,
          })),
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
      const { data, error } = await supabase
        .from('warehouses')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
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
      const { error } = await supabase.from('warehouses').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}
