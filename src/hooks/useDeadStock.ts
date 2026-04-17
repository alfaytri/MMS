import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeadStockStatus = 'active' | 'slow_moving' | 'at_risk' | 'dead'

export type DeadStockItem = {
  brand_variant_id: string
  item_name: string
  brand: string | null
  sku: string | null
  stock_level: number
  average_cost: number
  total_value: number
  last_movement_date: string | null
  days_idle: number
  status: DeadStockStatus
}

export function classifyDeadStock(days: number): DeadStockStatus {
  if (days <= 30) return 'active'
  if (days <= 90) return 'slow_moving'
  if (days <= 180) return 'at_risk'
  return 'dead'
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDeadStockReport({
  search = '',
  status,
}: {
  search?: string
  status?: DeadStockStatus
} = {}) {
  return useQuery({
    queryKey: ['dead_stock', { search, status }],
    queryFn: async () => {
      const supabase = createClient()

      // 1. Fetch all brand variants with stock > 0
      const { data: variants, error: varErr } = await (supabase as any)
        .from('inventory_brand_variants')
        .select('id, item_name, brand, sku, stock_level, average_cost')
        .gt('stock_level', 0)
      if (varErr) throw varErr

      if (!variants || variants.length === 0) return []

      // 2. Fetch latest movement per variant
      const variantIds = (variants as any[]).map((v) => v.id)
      const { data: movements, error: movErr } = await (supabase as any)
        .from('inventory_stock_movements')
        .select('brand_variant_id, created_at')
        .in('brand_variant_id', variantIds)
        .order('created_at', { ascending: false })
      if (movErr) throw movErr

      // Build a map: brand_variant_id -> latest movement date
      const latestMap = new Map<string, string>()
      for (const m of (movements ?? []) as any[]) {
        if (!latestMap.has(m.brand_variant_id)) {
          latestMap.set(m.brand_variant_id, m.created_at)
        }
      }

      const now = Date.now()
      let items: DeadStockItem[] = (variants as any[]).map((v) => {
        const lastDate = latestMap.get(v.id) ?? null
        const days = lastDate
          ? Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
          : 999
        return {
          brand_variant_id: v.id,
          item_name: v.item_name,
          brand: v.brand,
          sku: v.sku,
          stock_level: v.stock_level,
          average_cost: v.average_cost,
          total_value: v.stock_level * v.average_cost,
          last_movement_date: lastDate,
          days_idle: days,
          status: classifyDeadStock(days),
        }
      })

      // Apply filters
      if (search) {
        const q = search.toLowerCase()
        items = items.filter(
          (i) =>
            i.item_name.toLowerCase().includes(q) ||
            (i.sku ?? '').toLowerCase().includes(q) ||
            (i.brand ?? '').toLowerCase().includes(q)
        )
      }
      if (status) {
        items = items.filter((i) => i.status === status)
      }

      // Sort by days_idle desc
      items.sort((a, b) => b.days_idle - a.days_idle)

      return items
    },
    staleTime: 10 * 60 * 1000,
  })
}
