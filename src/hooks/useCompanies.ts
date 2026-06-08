import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Company = DBTable<'companies'>
export type CompanyInsert = DBInsert<'companies'>
export type CompanyUpdate = DBUpdate<'companies'>

export function useCompanies() {
  return useQuery({
    queryKey: queryKeys.companies.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name_en')
      if (error) throw error
      return data as Company[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useCreateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: CompanyInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('companies')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all })
    },
  })
}

export function useUpdateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: CompanyUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('companies')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all })
    },
  })
}
