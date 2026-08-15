import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * The division ids an item is assigned to (inventory_item_divisions). Powers the
 * Item dialog's "Assigned divisions" section — replaces the old
 * shared_with_division_ids read.
 */
export function useItemDivisions(itemId: string | null) {
  return useQuery({
    queryKey: ['item-divisions', itemId],
    enabled: !!itemId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_divisions')
        .select('division_id')
        .eq('item_id', itemId as string)
      if (error) throw error
      return (data ?? []).map((r) => r.division_id as string)
    },
  })
}

/**
 * Replace-set an item's division assignments (atomic, permission-gated in the
 * RPC). Existing rows for divisions that stay keep their category overlay.
 */
export function useSetItemDivisions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, divisionIds }: { itemId: string; divisionIds: string[] }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc(
        'rpc_set_item_divisions' as never,
        { p_item_id: itemId, p_division_ids: divisionIds } as never,
      )
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['item-divisions', vars.itemId] })
      qc.invalidateQueries({ queryKey: ['cascade-accessible', 'assignment'] })
      qc.invalidateQueries({ queryKey: ['item-divisions-by-stock'] })
    },
  })
}
