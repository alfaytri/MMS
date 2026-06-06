import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type Currency = DBTable<'currencies'>

export function useCurrencies(activeOnly = true) {
  return useQuery({
    queryKey: queryKeys.currencies.list(activeOnly),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('currencies')
        .select('*')
        .order('sort_order', { ascending: true })
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return data as Currency[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useToggleCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('currencies')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: queryKeys.currencies.all })
      const prev = qc.getQueryData<Currency[]>(queryKeys.currencies.list(false))
      qc.setQueryData<Currency[]>(queryKeys.currencies.list(false), (old = []) =>
        old.map((c) => (c.id === id ? { ...c, is_active } : c))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.currencies.list(false), ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.currencies.all })
    },
  })
}

export function useAddCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: { code: string; name: string; symbol: string }) => {
      const supabase = createClient()
      const existing = qc.getQueryData<Currency[]>(queryKeys.currencies.list(false)) ?? []
      const maxOrder = existing.reduce((m, r) => Math.max(m, r.sort_order), 0)
      const { error } = await supabase
        .from('currencies')
        .insert({ ...values, sort_order: maxOrder + 1 })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.currencies.all })
    },
  })
}
