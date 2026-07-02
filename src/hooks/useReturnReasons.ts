import { useQuery } from '@tanstack/react-query'
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
