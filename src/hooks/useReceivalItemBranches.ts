import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { fetchVariantBranches } from '@/lib/purchase/item-branches'

/**
 * Branch (division) names for a set of received lines, keyed by brand_variant_id.
 * Powers the "Branch" column on the Receival Detail dialog; the receival Receipt
 * PDF resolves the same data server-side via fetchVariantBranches directly.
 */
export function useReceivalItemBranches(brandVariantIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(brandVariantIds.filter((v): v is string => !!v))).sort()
  return useQuery({
    queryKey: ['receival-item-branches', ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchVariantBranches(createClient(), ids),
  })
}
