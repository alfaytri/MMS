import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/**
 * Per-(item, division) tracking mode + stock for the tool items in a category
 * that carry at least one per-division override. Powers the "one item,
 * per-division modes" catalog row (Tools Per-Division Mode, Phase 2). Returns a
 * Map keyed by item_id; an item absent from the map has no override and renders
 * via the normal category-mode path.
 */
export interface ToolDivisionMode {
  division_id: string
  division_name: string
  effective_mode: 'bulk' | 'serialized'
  bulk_qty: number
  unit_count: number
}

type RpcRow = {
  item_id: string
  item_name: string
  division_id: string
  division_name: string
  effective_mode: 'bulk' | 'serialized'
  bulk_qty: number | string | null
  unit_count: number | null
}

export function useToolPerDivisionModes(categoryId: string | null) {
  return useQuery({
    queryKey: ['tool-per-division-modes', categoryId],
    enabled: !!categoryId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, ToolDivisionMode[]>> => {
      const supabase = createClient()
      // RPC added in migration 20260831001500 — not yet in generated database.types.ts.
      const { data, error } = await supabase.rpc(
        'get_tool_item_division_modes' as never,
        { p_category_id: categoryId } as never,
      )
      if (error) throw error
      const map = new Map<string, ToolDivisionMode[]>()
      for (const r of ((data ?? []) as unknown as RpcRow[])) {
        const arr = map.get(r.item_id) ?? []
        arr.push({
          division_id: r.division_id,
          division_name: r.division_name,
          effective_mode: r.effective_mode,
          bulk_qty: Number(r.bulk_qty ?? 0),
          unit_count: Number(r.unit_count ?? 0),
        })
        map.set(r.item_id, arr)
      }
      return map
    },
  })
}
