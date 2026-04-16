import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'

export type Division = Pick<DBTable<'divisions'>, 'id' | 'name' | 'short_name' | 'color'>

export function useDivisions() {
  return useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('divisions')
        .select('id, name, short_name, color')
        .eq('is_active', true)
        .order('sort_order')

      if (error) throw error
      return data as Division[]
    },
    staleTime: 10 * 60 * 1000,
  })
}
