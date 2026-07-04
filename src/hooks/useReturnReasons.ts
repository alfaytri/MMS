import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type ReturnReason = {
  id: string
  label: string
  category: string
  sort_order: number
}

export function useReturnReasons(category: 'sale_return' | 'po_return') {
  return useQuery({
    queryKey: queryKeys.reasonLists.byCategory(category),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reason_lists')
        .select('id, label, category, sort_order')
        .eq('category', category)
        .eq('active', true)
        .is('deleted_at', null)
        .order('sort_order')
      if (error) throw error
      return data as ReturnReason[]
    },
    staleTime: 5 * 60_000,
  })
}

export function useAddReturnReason() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ label, category }: { label: string; category: 'sale_return' | 'po_return' }) => {
      const supabase = createClient()
      const { data: maxRow } = await supabase
        .from('reason_lists')
        .select('sort_order')
        .eq('category', category)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextSort = (maxRow?.sort_order ?? 0) + 1

      const { data, error } = await supabase
        .from('reason_lists')
        .insert({ label, category, sort_order: nextSort, active: true })
        .select('id, label, category, sort_order')
        .single()
      if (error) throw error
      return data as ReturnReason
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reasonLists.byCategory(variables.category) })
    },
  })
}
