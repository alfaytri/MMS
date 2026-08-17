import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface ScopedVariantStock {
  qty: number
  reserved: number
  available: number
  value: number
  avg_cost: number
}

/**
 * Per-variant GOOD stock for one item, rolled up over the selected divisions —
 * powers the Inventory list's division-scoped view. Sums
 * `warehouse_stock_summary` rows (one per sub-container) whose sub-container's
 * division is in `divisionIds`. Returns Map<brand_variant_id, ScopedVariantStock>;
 * a variant with no stock in those divisions is simply absent (the caller reads
 * it as 0). `avg_cost` is the weighted average (Σ value / Σ qty) across the
 * division's pools.
 *
 * Damaged is intentionally NOT here: damaged stock is tracked per WAREHOUSE
 * (`inventory_damaged_stock` has no sub-container/division), so it can't be
 * attributed to a division — the caller keeps the global damaged figure.
 *
 * Disabled (returns an empty map) unless both an item and at least one division
 * are supplied, so the "All divisions" view never fires this query.
 */
export function useItemVariantDivisionStock(itemId?: string | null, divisionIds: string[] = []) {
  const key = [...divisionIds].sort().join(',')
  return useQuery({
    queryKey: ['item-variant-division-stock', itemId ?? null, key],
    enabled: !!itemId && divisionIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map = new Map<string, ScopedVariantStock>()
      if (!itemId || divisionIds.length === 0) return map
      const supabase = createClient()

      const { data: variants, error: vErr } = await supabase
        .from('inventory_item_brand_variants')
        .select('id')
        .eq('item_id', itemId)
        .limit(500)
      if (vErr) throw vErr
      const variantIds = (variants ?? []).map((v) => v.id as string)
      if (variantIds.length === 0) return map

      const { data: rows, error: sErr } = await supabase
        .from('warehouse_stock_summary')
        .select('brand_variant_id, qty, allocated_qty, available_qty, total_value, warehouse_sub_containers:sub_container_id(division_id)')
        .in('brand_variant_id', variantIds)
        .limit(1000)
      if (sErr) throw sErr

      const divSet = new Set(divisionIds)
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
        const cur = map.get(row.brand_variant_id) ?? { qty: 0, reserved: 0, available: 0, value: 0, avg_cost: 0 }
        cur.qty += Number(row.qty ?? 0)
        cur.reserved += Number(row.allocated_qty ?? 0)
        cur.available += Number(row.available_qty ?? 0)
        cur.value += Number(row.total_value ?? 0)
        map.set(row.brand_variant_id, cur)
      }
      for (const v of map.values()) v.avg_cost = v.qty > 0 ? v.value / v.qty : 0
      return map
    },
  })
}
