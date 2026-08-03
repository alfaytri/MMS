import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ResolvedSubContainer = {
  sub_container_id: string
  sub_container_name: string
  warehouse_id: string
  warehouse_name: string
  division_id: string | null
}

/**
 * Warehouse Model v2 — Phase D.8.
 *
 * Resolves the default sub-container for a category by walking up the
 * `inventory_categories.parent_id` chain via the `resolve_category_sub_container`
 * SQL function, then hydrating the returned sub-container id with its name,
 * parent warehouse, and division.
 *
 * Returns `null` when the category has no default anywhere in its chain — the
 * caller should treat that as "no pre-fill; operator picks manually".
 */
export function useCategorySubContainer(categoryId?: string | null) {
  return useQuery<ResolvedSubContainer | null>({
    queryKey: ['category-sub-container', categoryId ?? null],
    enabled: !!categoryId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!categoryId) return null
      const supabase = createClient()

      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'resolve_category_sub_container',
        { p_category_id: categoryId },
      )
      if (rpcErr) throw rpcErr
      const subId = rpcData as string | null
      if (!subId) return null

      const { data: sub, error: subErr } = await supabase
        .from('warehouse_sub_containers')
        .select('id, name, warehouse_id, division_id, warehouses(name)')
        .eq('id', subId)
        .maybeSingle()
      if (subErr) throw subErr
      if (!sub) return null

      const row = sub as unknown as {
        id: string
        name: string
        warehouse_id: string
        division_id: string | null
        warehouses: { name: string } | null
      }
      return {
        sub_container_id: row.id,
        sub_container_name: row.name,
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouses?.name ?? '',
        division_id: row.division_id,
      }
    },
  })
}
