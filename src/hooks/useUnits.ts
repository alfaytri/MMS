'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { normalizeUnitName } from '@/lib/inventory/unitNormalize'

export type Unit = {
  id: string
  name: string
  name_ar: string | null
  sort_order: number | null
}

export function useUnits() {
  return useQuery({
    queryKey: queryKeys.units.all,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('units' as never)
        .select('id, name, name_ar, sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as unknown as Unit[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateUnit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string }) => {
      const supabase = createClient()
      const name = normalizeUnitName(payload.name)
      if (!name) throw new Error('Unit name is required')

      // Case-insensitive duplicate check (mirror useCreateBrand).
      const { data: existing, error: findErr } = await supabase
        .from('units' as never)
        .select('id, name')
        .ilike('name', name)
        .limit(1)
      if (findErr) throw findErr
      if (existing && (existing as unknown[]).length > 0) {
        return { unit: (existing as unknown as Unit[])[0], created: false }
      }

      const { data, error } = await supabase
        .from('units' as never)
        .insert({ name } as never)
        .select('id, name, name_ar, sort_order')
        .single()
      if (error) throw error
      return { unit: data as unknown as Unit, created: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.units.all })
    },
  })
}
