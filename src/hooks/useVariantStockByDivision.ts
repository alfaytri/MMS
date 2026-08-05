import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface VariantDivisionPool {
  division_id: string | null
  division_name: string | null
  qty: number
  reserved: number
}

/**
 * Phase D.12 Task 4 helper — per-variant per-division stock breakdown for
 * a single item, so the cascade picker can expand each brand variant into
 * one row per division holding stock.
 *
 * Returns a Map keyed by brand_variant_id → array of pools sorted by qty
 * desc. Pools whose sub-container has a null `division_id` (legacy virtual
 * repair warehouses etc.) surface as `division_id: null / division_name:
 * null` — the caller decides how to render.
 *
 * Results reflect the caller's RLS scope on `warehouse_stock_summary` and
 * `warehouse_sub_containers`. A user without visibility into another
 * division's sub-containers won't see those pools even if the item is
 * shared to them — matching the HANDOVER Task 3 spec that filtered by
 * "stock somewhere the caller can see".
 */
export function useVariantStockByDivision(itemId?: string | null) {
  return useQuery({
    queryKey: ['variant-stock-by-division', itemId ?? null],
    enabled: !!itemId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!itemId) return new Map<string, VariantDivisionPool[]>()
      const supabase = createClient()

      // Variants for this item — need the id list to scope the stock query.
      const { data: variants, error: vErr } = await supabase
        .from('inventory_item_brand_variants')
        .select('id')
        .eq('item_id', itemId)
      if (vErr) throw vErr
      const variantIds = (variants ?? []).map((v) => v.id as string)
      if (variantIds.length === 0) return new Map<string, VariantDivisionPool[]>()

      // Stock rows joined to sub-container → division → division name.
      const { data: rows, error: sErr } = await supabase
        .from('warehouse_stock_summary')
        .select(
          'brand_variant_id, qty, allocated_qty, warehouse_sub_containers:sub_container_id(division_id, divisions:division_id(name))',
        )
        .in('brand_variant_id', variantIds)
        .gt('qty', 0)
      if (sErr) throw sErr

      const byVariant = new Map<string, Map<string, VariantDivisionPool>>()
      for (const r of rows ?? []) {
        const row = r as unknown as {
          brand_variant_id: string
          qty: number | null
          allocated_qty: number | null
          warehouse_sub_containers: {
            division_id: string | null
            divisions: { name: string | null } | null
          } | null
        }
        const divisionId = row.warehouse_sub_containers?.division_id ?? null
        const divisionName = row.warehouse_sub_containers?.divisions?.name ?? null
        const poolsForVariant =
          byVariant.get(row.brand_variant_id) ?? new Map<string, VariantDivisionPool>()
        const key = divisionId ?? '__no_division__'
        const existing = poolsForVariant.get(key)
        if (existing) {
          existing.qty += Number(row.qty ?? 0)
          existing.reserved += Number(row.allocated_qty ?? 0)
        } else {
          poolsForVariant.set(key, {
            division_id: divisionId,
            division_name: divisionName,
            qty: Number(row.qty ?? 0),
            reserved: Number(row.allocated_qty ?? 0),
          })
        }
        byVariant.set(row.brand_variant_id, poolsForVariant)
      }

      // Flatten each variant's inner map to a sorted array (qty desc).
      const out = new Map<string, VariantDivisionPool[]>()
      for (const [variantId, pools] of byVariant) {
        const arr = Array.from(pools.values()).sort((a, b) => b.qty - a.qty)
        out.set(variantId, arr)
      }
      return out
    },
  })
}
