import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type Discipline = DBTable<'disciplines'>

/**
 * Reference list of disciplines (Plumbing / Electrical / Automation, seeded).
 * Feeds the discipline multi-select checkboxes in `ProjectFormDialog` and
 * the discipline-name join in `useProjects`. Rarely changes — long staleTime.
 */
export function useDisciplines() {
  return useQuery({
    queryKey: queryKeys.disciplines.all,
    queryFn: async (): Promise<Discipline[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('disciplines')
        .select('id, name, sort_order, is_active, created_at')
        .eq('is_active', true)
        .order('sort_order')
        .limit(200)
      if (error) {
        throw new Error(
          [error.code, error.message, error.details, error.hint].filter(Boolean).join(' — ')
            || 'Failed to load disciplines',
        )
      }
      return (data ?? []) as Discipline[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
