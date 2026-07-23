import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type Division = DBTable<'company_divisions'>
export type DivisionInsert = DBInsert<'company_divisions'>
export type DivisionUpdate = DBUpdate<'company_divisions'>

/** Active divisions only — used across the app for DivisionFilter, selectors, etc. */
export function useDivisions() {
  return useQuery({
    queryKey: queryKeys.divisions.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('company_divisions')
        .select('id,slug,name,short_name')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

/** All divisions including inactive — used by admin Companies page. */
export function useAllDivisions() {
  return useQuery({
    queryKey: queryKeys.divisions.allList,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('company_divisions')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useDivisionsByCompany(companyId: string | null) {
  return useQuery({
    queryKey: queryKeys.divisions.byCompany(companyId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('company_divisions')
        .select('*')
        .eq('company_id', companyId!)
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
    enabled: !!companyId,
  })
}

export function useCreateDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: DivisionInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('company_divisions')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.divisions.all })
    },
  })
}

export function useUpdateDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: DivisionUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('company_divisions')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.divisions.all })
    },
  })
}

export function useDeleteDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('company_divisions')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.divisions.all })
    },
  })
}

