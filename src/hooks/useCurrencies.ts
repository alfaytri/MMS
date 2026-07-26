import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

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
      void logActivity({
        action: is_active ? 'Currency Activated' : 'Currency Deactivated',
        module: 'currencies',
        entity_id: id,
        entity_type: 'currency',
        old_data: { is_active: !is_active },
        new_data: { is_active },
      })
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
    mutationFn: async (values: { code: string; symbol?: string; name?: string }) => {
      const supabase = createClient()
      const existing = qc.getQueryData<Currency[]>(queryKeys.currencies.list(false)) ?? []
      const maxOrder = existing.reduce((m, r) => Math.max(m, r.sort_order), 0)
      const { error } = await supabase
        .from('currencies')
        .insert({
          code: values.code,
          symbol: values.symbol?.trim() || null,
          name: values.name?.trim() || null,
          sort_order: maxOrder + 1,
        })
      if (error) throw error
      void logActivity({
        action: 'Currency Added',
        module: 'currencies',
        entity_id: values.code,
        entity_type: 'currency',
        new_data: values as unknown as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.currencies.all })
    },
  })
}
