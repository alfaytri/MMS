import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type WarehouseResponsiblePerson = {
  profile_id: string
  full_name: string | null
}

export type Warehouse = DBTable<'warehouses'> & {
  responsible_persons: WarehouseResponsiblePerson[]
  division_name: string | null
}
export type WarehouseInsert = DBInsert<'warehouses'>
export type WarehouseUpdate = DBUpdate<'warehouses'>

/**
 * Fetch warehouses. By default excludes virtual warehouses (repair-vendor
 * shadows introduced in Phase 9.2). Virtual warehouses are internal-only
 * transfer targets — they must NOT appear in operator warehouse pickers
 * (restock, receival source, delivery source, transfer picker, etc.). The
 * only surface that legitimately needs them is Master Data → Warehouses
 * (for admin visibility); that page opts in with `{ includeVirtual: true }`.
 */
export function useWarehouses(options?: { includeVirtual?: boolean }) {
  const includeVirtual = options?.includeVirtual ?? false
  return useQuery({
    queryKey: [...queryKeys.warehouses.all, { includeVirtual }],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('warehouses')
        .select('*, company_divisions(name), warehouse_responsible_persons(profile_id, user_data(full_name))')
        .order('name')
      if (!includeVirtual) {
        // is_virtual defaults to false, but be explicit — legacy rows and
        // any future virtual-flag additions must be filtered too.
        q = q.or('is_virtual.is.null,is_virtual.eq.false')
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((row) => {
        const { warehouse_responsible_persons, company_divisions, ...rest } = row as typeof row & {
          company_divisions: { name: string } | null
          warehouse_responsible_persons: Array<{
            profile_id: string
            user_data: { full_name: string | null } | null
          }>
        }
        const rps = (warehouse_responsible_persons ?? []).map((rp) => ({
          profile_id: rp.profile_id,
          full_name: rp.user_data?.full_name ?? null,
        }))
        return {
          ...rest,
          responsible_persons: rps,
          division_name: company_divisions?.name ?? null,
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
