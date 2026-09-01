import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type VariantHierarchy = { itemName: string | null; categoryName: string | null }

/**
 * Resolve brand_variant_ids → their parent item + category names, for a
 * breadcrumb "tree" above the variant. Delivery / return lines store only the
 * short variant label (e.g. "10.9 kg"), so the item + category are fetched on
 * demand. Uses plain `.in()` queries (no nested FK embed) so it can't 400
 * silently on RLS-embedded joins; degrades gracefully (missing rows just yield
 * no tree).
 */
export function useVariantHierarchy(brandVariantIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(brandVariantIds.filter((v): v is string => !!v)))
  return useQuery({
    queryKey: ['variant-hierarchy', ids.slice().sort().join(',')],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, VariantHierarchy>> => {
      const supabase = createClient()

      const { data: vars, error: e1 } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, item_id')
        .in('id', ids)
      if (e1) throw e1

      const itemIds = Array.from(
        new Set((vars ?? []).map((v) => v.item_id).filter((x): x is string => !!x)),
      )

      const itemMap = new Map<string, { name: string | null; categoryId: string | null }>()
      if (itemIds.length > 0) {
        const { data: items, error: e2 } = await supabase
          .from('inventory_items')
          .select('id, name_en, category_id')
          .in('id', itemIds)
        if (e2) throw e2
        for (const it of items ?? []) itemMap.set(it.id, { name: it.name_en, categoryId: it.category_id })
      }

      const catIds = Array.from(
        new Set(Array.from(itemMap.values()).map((i) => i.categoryId).filter((x): x is string => !!x)),
      )
      const catMap = new Map<string, string | null>()
      if (catIds.length > 0) {
        const { data: cats, error: e3 } = await supabase
          .from('inventory_categories')
          .select('id, name_en')
          .in('id', catIds)
        if (e3) throw e3
        for (const c of cats ?? []) catMap.set(c.id, c.name_en)
      }

      const map = new Map<string, VariantHierarchy>()
      for (const v of vars ?? []) {
        const it = v.item_id ? itemMap.get(v.item_id) : undefined
        map.set(v.id, {
          itemName: it?.name ?? null,
          categoryName: it?.categoryId ? (catMap.get(it.categoryId) ?? null) : null,
        })
      }
      return map
    },
  })
}
