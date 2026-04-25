import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CogsEntry = {
  id: string
  brand_variant_id: string
  sale_delivery_id: string | null
  sale_order_id: string | null
  qty: number
  unit_cost: number
  total_cost: number
  date: string
  created_at: string
}

export function useCogsEntries(brandVariantId?: string) {
  return useQuery({
    queryKey: ['cogs-entries', brandVariantId],
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('cogs_entries')
        .select('*')
        .eq('brand_variant_id', brandVariantId)
        .order('date', { ascending: false })
      if (error) throw error
      return (data ?? []) as CogsEntry[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useStockMovementsByVariant(brandVariantId?: string) {
  return useQuery({
    queryKey: ['stock_movements', 'by_variant', brandVariantId],
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_stock_movements')
        .select('*')
        .eq('brand_variant_id', brandVariantId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useServiceInventoryLinks(brandVariantId?: string) {
  return useQuery({
    queryKey: ['service-inventory', brandVariantId],
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_inventory')
        .select('*')
        .eq('brand_variant_id', brandVariantId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}
