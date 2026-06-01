import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'

export type Currency = DBTable<'currencies'>

export function useCurrencies(activeOnly = true) {
  return useQuery({
    queryKey: ['currencies', activeOnly],
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
      await qc.cancelQueries({ queryKey: ['currencies'] })
      const prev = qc.getQueryData<Currency[]>(['currencies', false])
      qc.setQueryData<Currency[]>(['currencies', false], (old = []) =>
        old.map((c) => (c.id === id ? { ...c, is_active } : c))
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['currencies', false], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['currencies'] })
    },
  })
}

export function useAddCurrency() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: { code: string; name: string; symbol: string }) => {
      const supabase = createClient()
      const existing = qc.getQueryData<Currency[]>(['currencies', false]) ?? []
      const maxOrder = existing.reduce((m, r) => Math.max(m, r.sort_order), 0)
      const { error } = await supabase
        .from('currencies')
        .insert({ ...values, sort_order: maxOrder + 1 })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currencies'] })
    },
  })
}
