import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchVariantBranches } from '@/lib/purchase/item-branches'

/**
 * Branch (company division) names an item is stocked in, keyed by
 * brand_variant_id. Shared by the receival Receipt/Detail and the consumption
 * dialogs; the receival Receipt PDF resolves the same data server-side via
 * fetchVariantBranches directly.
 */
export function useItemBranchesByVariant(brandVariantIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(brandVariantIds.filter((v): v is string => !!v))).sort()
  return useQuery({
    queryKey: ['item-branches-by-variant', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchVariantBranches(createClient(), ids),
  })
}
