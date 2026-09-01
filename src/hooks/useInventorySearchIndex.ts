'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { InventoryItem } from '@/hooks/useInventory'

/**
 * A single searchable variant of an item — the fields a user searches by:
 * brand (denormalized text + joined brands.name), the auto-generated code, and
 * the country of origin (joined country_codes.name).
 */
export type SearchIndexVariant = {
  brand: string | null
  brand_name: string | null
  code: string | null
  origin: string | null
}

/** A catalog item plus its variants, flattened for client-side search. */
export type SearchIndexItem = InventoryItem & {
  variants: SearchIndexVariant[]
}

/**
 * Loads every active item of a catalog type together with its brand variants,
 * so the Inventory search bar can match by item name, brand, origin, and code —
 * not just category name (the old `filterTree` behaviour). One nested query;
 * only runs while a search is active (`enabled`), and is cached briefly.
 */
export function useInventorySearchIndex(categoryType: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.inventory.itemsByType(categoryType), 'search-index'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .select(
          '*, inventory_categories!inner(type), inventory_item_brand_variants(brand, code, brands(name), country_codes(name))',
        )
        .eq('inventory_categories.type', categoryType as 'products' | 'spare-parts' | 'consumables' | 'tools')
        .eq('status', 'active')
        .limit(10000) // safety cap (Supabase budget rule) — ~950 active items today
      if (error) throw error

      type Row = Record<string, unknown> & {
        inventory_item_brand_variants?: Array<{
          brand: string | null
          code: string | null
          brands: { name: string | null } | null
          country_codes: { name: string | null } | null
        }> | null
      }
      return (data ?? []).map((raw) => {
        const row = raw as Row
        const { inventory_categories: _cat, inventory_item_brand_variants: rawVariants, ...item } = row
        const variants: SearchIndexVariant[] = (rawVariants ?? []).map((v) => ({
          brand: v.brand ?? null,
          brand_name: v.brands?.name ?? null,
          code: v.code ?? null,
          origin: v.country_codes?.name ?? null,
        }))
        return { ...(item as unknown as InventoryItem), variants }
      }) as SearchIndexItem[]
    },
  })
}
