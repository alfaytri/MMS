import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { BrandVariant } from './useInventory'

export type BulkToolStockBatchData = {
  variantsByItem: Map<string, BrandVariant[]>
  availableByVariant: Map<string, number>
}

// Keep .in() lists under the PostgREST URL-length cap on a large category.
const CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Batches BulkToolItemRow's two per-row reads — `useInventoryBrandVariants` and
 * `useVariantStockByDivision` — into one variants query + one stock query for
 * every bulk-tool item in an expanded category, distributed via
 * BulkToolStockContext. This is the Tools-list N+1 fix.
 *
 * `availableByVariant` reproduces BulkToolItemRow's original math exactly: group
 * qty>0 stock rows by (variant, division), then Σ over each variant's division
 * pools of max(0, poolQty − poolReserved). RLS on warehouse_stock_summary scopes
 * the rows to what the caller can see, matching useVariantStockByDivision.
 */
export function useBulkToolStockBatch(itemIds: string[], showArchived: boolean) {
  const idsKey = [...itemIds].sort().join(',')
  return useQuery({
    queryKey: ['bulk-tool-stock-batch', idsKey, showArchived],
    enabled: itemIds.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<BulkToolStockBatchData> => {
      const supabase = createClient()

      // 1. Variants for all bulk items (same select/order/status as the per-row hook).
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

      const variantsByItem = new Map<string, BrandVariant[]>()
      for (const v of variants) {
        const arr = variantsByItem.get(v.item_id) ?? []
        arr.push(v)
        variantsByItem.set(v.item_id, arr)
      }

      // 2. Available on-hand, grouped by (variant, division) to match the per-row
      //    pool math, then reduced to one number per variant.
      const availableByVariant = new Map<string, number>()
      if (variants.length > 0) {
        const variantIds = variants.map((v) => v.id as string)
        // variant → division-key → { qty, reserved }
        const pools = new Map<string, Map<string, { qty: number; reserved: number }>>()
        for (const ids of chunk(variantIds, CHUNK)) {
          const { data: rows, error } = await supabase
            .from('warehouse_stock_summary')
            .select('brand_variant_id, qty, allocated_qty, warehouse_sub_containers:sub_container_id(division_id)')
            .in('brand_variant_id', ids)
            .gt('qty', 0)
            .limit(10000)
          if (error) throw error
          for (const r of rows ?? []) {
            const row = r as unknown as {
              brand_variant_id: string
              qty: number | null
              allocated_qty: number | null
              warehouse_sub_containers: { division_id: string | null } | null
            }
            const divKey = row.warehouse_sub_containers?.division_id ?? '__no_division__'
            const perDiv = pools.get(row.brand_variant_id) ?? new Map<string, { qty: number; reserved: number }>()
            const cur = perDiv.get(divKey) ?? { qty: 0, reserved: 0 }
            cur.qty += Number(row.qty ?? 0)
            cur.reserved += Number(row.allocated_qty ?? 0)
            perDiv.set(divKey, cur)
            pools.set(row.brand_variant_id, perDiv)
          }
        }
        for (const [variantId, perDiv] of pools) {
          let total = 0
          for (const p of perDiv.values()) total += Math.max(0, p.qty - p.reserved)
          availableByVariant.set(variantId, total)
        }
      }

      return { variantsByItem, availableByVariant }
    },
  })
}
