// src/hooks/useReasonLists.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface ReasonListItem {
  id: string
  label: string
}

export function useReasonLists(category: string) {
  const supabase = createClient()
  const { data: reasons = [], isLoading } = useQuery({
    queryKey: ['reason-lists', category],
    queryFn: async (): Promise<ReasonListItem[]> => {
      const { data, error } = await supabase
        .from('reason_lists')
        .select('id, label')
        .eq('category', category)
        .eq('active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
  return { reasons, isLoading }
}
