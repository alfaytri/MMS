// src/hooks/useOptimumFleet.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import type { TraccarPosition } from '@/lib/traccar'
import type { VehicleMapData } from '@/components/map/VehicleMarkerLayer'
import { queryKeys } from '@/lib/queryKeys'

export interface OptimumFleetSnapshot {
  vehicles: VehicleMapData[]
  positions: TraccarPosition[]
  configured: boolean
}

const EMPTY: OptimumFleetSnapshot = { vehicles: [], positions: [], configured: false }

/**
 * Whole-fleet live positions from Optimum Fleet, already adapted to the map's
 * VehicleMapData / TraccarPosition shapes. Poll at 60s; the proxy caches upstream
 * for 120s so the vendor rate limit is respected regardless of viewer count.
 */
export function useOptimumFleetPositions(enabled: boolean) {
  return useQuery<OptimumFleetSnapshot>({
    queryKey: queryKeys.optimumfleet.positions,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch('/api/optimumfleet/positions')
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to fetch Optimum Fleet positions')
      }
      return (await res.json()) as OptimumFleetSnapshot
    },
    placeholderData: EMPTY,
  })
}
