'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

/** Shortest query that hits the server — one letter would match most of the catalogue. */
export const MIN_SEARCH_LENGTH = 2

/** How many hits the server returns. Deliberately bounded (Supabase budget rule). */
export const SEARCH_LIMIT = 50

/**
 * One row from `rpc_search_services`.
 *
 * A superset of the picker's `PickedService`, so a hit converts to one without
 * a second lookup.
 */
export interface ServiceSearchHit {
  id: string
  name_en: string
  name_ar: string | null
  /** Root → leaf breadcrumb, built server-side. Distinguishes two same-named services. */
  path: string[]
  price: number | null
  emergency_price: number | null
  duration: number | null
  division: string[] | null
  /** `services.catalog_thumb_url`; null when the service has no photo. */
  thumb_url: string | null
  /** Branches come back too — the picker drills into them, it cannot add them. */
  is_leaf: boolean
}

/**
 * Searches the service catalogue server-side.
 *
 * The catalogue is heading for ~500 services and beyond, so this does not ship
 * the tree to the browser; matching runs against trigram indexes on both the
 * English and Arabic names. Idle until the query is long enough to be worth a
 * round trip.
 */
export function useServiceSearch(
  query: string,
  treeType = 'normal',
  divisionSlugs: string[] = [],
) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: queryKeys.services.search(trimmed, treeType, divisionSlugs),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_search_services' as never, {
        p_query: trimmed,
        p_tree_type: treeType,
        p_division_slugs: divisionSlugs,
        p_limit: SEARCH_LIMIT,
      } as never)
      if (error) throw error
      return (data ?? []) as unknown as ServiceSearchHit[]
    },
    enabled: trimmed.length >= MIN_SEARCH_LENGTH,
    staleTime: 60 * 1000,
  })
}
