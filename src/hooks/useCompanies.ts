import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'
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

/**
 * Convenience hook: the display name of the "primary" company — used
 * anywhere the app previously hardcoded the brand string (top nav, PDF
 * headers, page metadata). Returns the first companies row alphabetically
 * (the app is single-company today; if we go multi-tenant this needs a
 * proper "active company" concept). Returns an empty string while loading
 * so callers don't flash a stale hardcoded fallback.
 */
export function usePrimaryCompanyName(): string {
  const { data } = useCompanies()
  return data?.[0]?.name_en ?? ''
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
      void logActivity({
        action: 'Company Created',
        module: 'companies',
        entity_id: data.id,
        entity_type: 'company',
        new_data: data as unknown as Record<string, unknown>,
      })
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
      const { data: oldData } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single()
      const { data, error } = await supabase
        .from('companies')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Company Updated',
        module: 'companies',
        entity_id: id,
        entity_type: 'company',
        old_data: oldData as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all })
    },
  })
}
