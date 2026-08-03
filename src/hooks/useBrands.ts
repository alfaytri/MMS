'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type Brand = {
  id: string
  name: string
  name_ar: string | null
  sort_order?: number | null
}

export function useBrands() {
  return useQuery({
    queryKey: queryKeys.brands.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('brands')
        .select('id, name, name_ar, sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as Brand[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateBrand() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; name_ar?: string | null }) => {
      const supabase = createClient()
      const name = payload.name.trim()
      if (!name) throw new Error('Brand name is required')

      // Case-insensitive duplicate check
      const { data: existing, error: findErr } = await supabase
        .from('brands')
        .select('id, name')
        .ilike('name', name)
        .limit(1)
      if (findErr) throw findErr
      if (existing && existing.length > 0) {
        return existing[0] as Brand
      }

      const { data, error } = await supabase
        .from('brands')
        .insert({ name, name_ar: payload.name_ar?.trim() || null })
        .select('id, name, name_ar, sort_order')
        .single()
      if (error) throw error
      return data as Brand
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.brands.all })
    },
  })
}
