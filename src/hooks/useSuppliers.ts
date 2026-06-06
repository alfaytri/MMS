import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type Supplier = DBTable<'suppliers'>
export type SupplierInsert = DBInsert<'suppliers'>
export type SupplierUpdate = DBUpdate<'suppliers'>

export type SupplierWithCurrency = Supplier & {
  currencies: { code: string; symbol: string } | null
}

export function useSuppliers() {
  return useQuery({
    queryKey: queryKeys.suppliers.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('suppliers')
        .select('*, currencies(code, symbol)')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data as SupplierWithCurrency[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: SupplierInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('suppliers')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all })
    },
  })
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: SupplierUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('suppliers')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all })
    },
  })
}
