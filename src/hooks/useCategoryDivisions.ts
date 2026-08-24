import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useCategoryDivisions(categoryId: string | null) {
  return useQuery({
    queryKey: ['category-divisions', categoryId],
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'rpc_category_divisions' as never,
        { p_category_id: categoryId } as never,
      )
      if (error) throw error
      const j = (data ?? {}) as { own?: string[]; inherited?: string[] }
      return { own: j.own ?? [], inherited: j.inherited ?? [] }
    },
  })
}

export function useSetCategoryDivisions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, divisionIds }: { categoryId: string; divisionIds: string[] }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc(
        'rpc_set_category_divisions' as never,
        { p_category_id: categoryId, p_division_ids: divisionIds } as never,
      )
      if (error) throw error
    },
    onSuccess: (_d, _vars) => {
      // Bare prefix, not scoped to categoryId: rpc_category_divisions computes
      // `inherited` by walking ancestors, so a descendant category's cached result
      // also depends on this category's rows.
      qc.invalidateQueries({ queryKey: ['category-divisions'] })
      qc.invalidateQueries({ queryKey: ['item-divisions-by-stock'] })
      qc.invalidateQueries({ queryKey: ['cascade-accessible', 'assignment'] })
      // useItemEffectiveDivisions derives `inherited` from inventory_category_divisions,
      // the table this mutation writes — refetch so an open Item dialog isn't stale.
      qc.invalidateQueries({ queryKey: ['item-effective-divisions'] })
    },
  })
}

export function useCascadeCategoryUnitsDivision() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoryId, divisionId }: { categoryId: string; divisionId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'rpc_cascade_category_units_division' as never,
        { p_category_id: categoryId, p_division_id: divisionId } as never,
      )
      if (error) throw error
      const j = (data ?? {}) as { moved?: number; skipped?: string[] }
      return { moved: j.moved ?? 0, skipped: j.skipped ?? [] }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['item-divisions-by-stock'] })
    },
  })
}
