// src/hooks/useBrandVariantAncestry.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type BrandVariantAncestry = {
  id: string
  brand: string
  code: string | null
  cost_price: number | null
  inventory_items: {
    id: string
    name_en: string
    name_ar: string | null
    unit: string
    inventory_categories: {
      id: string
      name_en: string
      name_ar: string | null
    }
  }
}

export function useBrandVariantAncestry(variantId: string | null) {
  return useQuery({
    queryKey: ['brand-variant-ancestry', variantId],
    enabled: !!variantId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<BrandVariantAncestry> => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_brand_variants')
        .select(`
          id, brand, code, cost_price,
          inventory_items!inner (
            id, name_en, name_ar, unit,
            inventory_categories!inner (
              id, name_en, name_ar
            )
          )
        `)
        .eq('id', variantId!)
        .single()
      if (error) throw error
      return data as BrandVariantAncestry
    },
  })
}
