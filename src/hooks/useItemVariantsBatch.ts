import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { BrandVariant } from './useInventory'
import type { ScopedVariantStock } from './useItemVariantDivisionStock'

export type ItemVariantsBatchData = {
  variantsByItem: Map<string, BrandVariant[]>
  scopedStockByVariant: Map<string, ScopedVariantStock> | null
}

// Keep .in() lists under the PostgREST URL-length cap on a large category.
const CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Batches what ItemRow used to fetch per row — `useInventoryBrandVariants(itemId)`
 * (one query per row) and `useItemVariantDivisionStock(itemId, divisions)` (two
 * queries per row) — into ONE variants query (+ ONE stock query when a division
 * is selected) for every item in an expanded category, distributed to rows via
 * ItemVariantsContext. This is the Inventory-list N+1 fix.
 *
 * Variant select/order/status-filter match useInventoryBrandVariants exactly, and
 * the stock aggregation matches useItemVariantDivisionStock, so rows render
 * identically whether they read from this batch or (as a fallback) their own hook.
 */
export function useItemVariantsBatch(
  itemIds: string[],
  showArchived: boolean,
  divisionIds: string[],
) {
  const idsKey = [...itemIds].sort().join(',')
  const divKey = [...divisionIds].sort().join(',')
  return useQuery({
    queryKey: [...queryKeys.inventory.itemVariantsBatch, idsKey, showArchived, divKey],
    enabled: itemIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ItemVariantsBatchData> => {
      const supabase = createClient()

      // 1. All variants for these items — one query per <=200-id chunk. Same
      //    select/order/status filter as useInventoryBrandVariants.
      const variants: BrandVariant[] = []
      for (const ids of chunk(itemIds, CHUNK)) {
        let vq = supabase
          .from('inventory_item_brand_variants')
          .select('*, brands(name), country_codes(name, flag, iso)')
          .in('item_id', ids)
          .order('sort_order', { ascending: true })
          .order('brand', { ascending: true })
          .limit(5000)
        if (!showArchived) vq = vq.neq('status', 'archived')
        const { data, error } = await vq
        if (error) throw error
        variants.push(...((data ?? []) as BrandVariant[]))
      }

      // The global order is (sort_order, brand); grouping preserves each item's
      // relative order, so rows match the per-item query's ordering.
      const variantsByItem = new Map<string, BrandVariant[]>()
      for (const v of variants) {
        const arr = variantsByItem.get(v.item_id) ?? []
        arr.push(v)
        variantsByItem.set(v.item_id, arr)
      }

      // 2. Division-scoped good stock for those variants — only when a division is
      //    selected. Aggregation mirrors useItemVariantDivisionStock.
      let scopedStockByVariant: Map<string, ScopedVariantStock> | null = null
      if (divisionIds.length > 0 && variants.length > 0) {
        const variantIds = variants.map((v) => v.id as string)
        const divSet = new Set(divisionIds)
        const m = new Map<string, ScopedVariantStock>()
        for (const ids of chunk(variantIds, CHUNK)) {
          const { data: rows, error } = await supabase
            .from('warehouse_stock_summary')
            .select('brand_variant_id, qty, allocated_qty, available_qty, total_value, warehouse_sub_containers:sub_container_id(division_id)')
            .in('brand_variant_id', ids)
            .limit(10000)
          if (error) throw error
          for (const r of rows ?? []) {
            const row = r as unknown as {
              brand_variant_id: string
              qty: number | null
              allocated_qty: number | null
              available_qty: number | null
              total_value: number | null
              warehouse_sub_containers: { division_id: string | null } | null
            }
            const div = row.warehouse_sub_containers?.division_id ?? null
            if (!div || !divSet.has(div)) continue
            const cur = m.get(row.brand_variant_id) ?? { qty: 0, reserved: 0, available: 0, value: 0, avg_cost: 0 }
            cur.qty += Number(row.qty ?? 0)
            cur.reserved += Number(row.allocated_qty ?? 0)
            cur.available += Number(row.available_qty ?? 0)
            cur.value += Number(row.total_value ?? 0)
            m.set(row.brand_variant_id, cur)
          }
        }
        for (const s of m.values()) s.avg_cost = s.qty > 0 ? s.value / s.qty : 0
        scopedStockByVariant = m
      }

      return { variantsByItem, scopedStockByVariant }
    },
  })
}
