import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Warehouse = DBTable<'warehouses'> & {
  manager_name: string | null
  manager_profile_id: string | null
  manager_profile_name: string | null
}
export type WarehouseInsert = DBInsert<'warehouses'>
export type WarehouseUpdate = DBUpdate<'warehouses'>

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouses')
        .select('*, manager:employees!warehouses_manager_id_fkey(name), manager_profile:profiles!warehouses_manager_profile_id_fkey(id, full_name)')
        .order('name')
      if (error) throw error
      return (data ?? []).map((row) => {
        const { manager, manager_profile, ...rest } = row as typeof row & {
          manager: { name: string } | null
          manager_profile: { id: string; full_name: string | null } | null
        }
        return {
          ...rest,
          manager_name: manager?.name ?? null,
          manager_profile_id: manager_profile?.id ?? (rest as any).manager_profile_id ?? null,
          manager_profile_name: manager_profile?.full_name ?? null,
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
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
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
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
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
      queryClient.invalidateQueries({ queryKey: ['warehouses'] })
    },
  })
}
