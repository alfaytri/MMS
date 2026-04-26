import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Division = DBTable<'divisions'>
export type DivisionInsert = DBInsert<'divisions'>
export type DivisionUpdate = DBUpdate<'divisions'>

/** Active divisions only — used across the app for DivisionFilter, selectors, etc. */
export function useDivisions() {
  return useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
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
    queryKey: ['divisions', 'all'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as Division[]
    },
  })
}

export function useDivisionsByCompany(companyId: string | null) {
  return useQuery({
    queryKey: ['divisions', 'company', companyId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
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
        .from('divisions')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
    },
  })
}

export function useUpdateDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: DivisionUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
    },
  })
}

export function useDeleteDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('divisions')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['divisions'] })
    },
  })
}
