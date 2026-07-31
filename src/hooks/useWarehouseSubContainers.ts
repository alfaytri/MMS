import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { DBTable, DBInsert } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type WarehouseSubContainer = DBTable<'warehouse_sub_containers'> & {
  division_name: string | null
}

export function useWarehouseSubContainers(warehouseId?: string | null) {
  return useQuery({
    queryKey: queryKeys.warehouseSubContainers.byWarehouse(warehouseId ?? null),
    queryFn: async () => {
      if (!warehouseId) return [] as WarehouseSubContainer[]
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .select('*, company_divisions(name)')
        .eq('warehouse_id', warehouseId)
        .order('created_at')
      if (error) throw error
      return (data ?? []).map((row) => {
        const { company_divisions, ...rest } = row as typeof row & {
          company_divisions: { name: string } | null
        }
        return { ...rest, division_name: company_divisions?.name ?? null }
      }) as WarehouseSubContainer[]
    },
    enabled: !!warehouseId,
    staleTime: 60 * 1000,
  })
}

export function useCreateWarehouseSubContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      warehouse_id: string
      division_id: string | null
      name: string
    }) => {
      const supabase = createClient()
      // The generated types were captured before Phase C.1's
      // ALTER COLUMN division_id DROP NOT NULL, so they still forbid null on
      // insert. At the DB level the trigger `_enforce_sub_container_division_rule`
      // permits null only for virtual warehouses. Cast through the Insert type
      // so callers can pass null when the parent warehouse is virtual.
      const payload = values as unknown as DBInsert<'warehouse_sub_containers'>
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Sub-container Created',
        module: 'warehouses',
        entity_id: data.id,
        entity_type: 'warehouse_sub_container',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: queryKeys.warehouseSubContainers.byWarehouse(data.warehouse_id),
      })
      qc.invalidateQueries({ queryKey: queryKeys.warehouses.all })
    },
  })
}

export function useUpdateWarehouseSubContainer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: {
      id: string
      name?: string
      is_active?: boolean
    }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('warehouse_sub_containers')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: values.is_active === false ? 'Sub-container Deactivated' : 'Sub-container Updated',
        module: 'warehouses',
        entity_id: id,
        entity_type: 'warehouse_sub_container',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: queryKeys.warehouseSubContainers.byWarehouse(data.warehouse_id),
      })
    },
  })
}

export function useDeactivateWarehouseSubContainer() {
  const update = useUpdateWarehouseSubContainer()
  return {
    ...update,
    mutate: (id: string, opts?: Parameters<typeof update.mutate>[1]) =>
      update.mutate({ id, is_active: false }, opts),
    mutateAsync: (id: string) => update.mutateAsync({ id, is_active: false }),
  }
}
