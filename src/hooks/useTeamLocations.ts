// src/hooks/useTeamLocations.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type TeamLocationStatus = 'moving' | 'idle' | 'stopped' | 'offline'

export interface TeamLocation {
  id: string
  teamName: string
  driverName: string
  vehiclePlate: string
  lat: number | null
  lng: number | null
  speed: number | null
  heading: number | null
  lastUpdate: string | null
  status: TeamLocationStatus
  currentTask: string | null
}

/**
 * Derive operational status from speed + data freshness.
 * Uses `effectiveSpeed` to prevent a "black hole" where stale moving data
 * (speed > 0, updatedAt > 2 min) would match no status bucket.
 */
export function deriveStatus(
  speed: number | null,
  updatedAt: string | null
): TeamLocationStatus {
  if (!updatedAt) return 'offline'

  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const effectiveSpeed = ageMs > 2 * 60_000 ? 0 : (speed ?? 0)

  if (effectiveSpeed > 0) return 'moving'
  if (ageMs < 5 * 60_000) return 'idle'
  if (ageMs < 30 * 60_000) return 'stopped'
  return 'offline'
}

/**
 * Fetches all teams joined with their live GPS locations.
 * Polls every 30 seconds to stay in sync with the GPS tracking interval.
 */
export function useTeamLocations() {
  return useQuery({
    queryKey: ['team-locations'],
    queryFn: async (): Promise<TeamLocation[]> => {
      const supabase = createClient()

      // Fetch teams with leader name, first vehicle plate, and live location
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('teams')
        .select(`
          id, name_en, name,
          leader:employees!teams_leader_id_fkey(name),
          vehicles(plate),
          team_live_locations(lat, lng, speed, heading, updated_at)
        `)
        .is('deleted_at', null)
        .order('name_en', { nullsFirst: false })

      if (error) throw error

      return ((data ?? []) as any[]).map((t) => {
        const loc = t.team_live_locations?.[0] ?? null
        return {
          id: t.id,
          teamName: t.name_en ?? t.name ?? '',
          driverName: t.leader?.name ?? 'No leader',
          vehiclePlate: t.vehicles?.[0]?.plate ?? '—',
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
          speed: loc?.speed ?? null,
          heading: loc?.heading ?? null,
          lastUpdate: loc?.updated_at ?? null,
          status: deriveStatus(loc?.speed ?? null, loc?.updated_at ?? null),
          currentTask: null, // placeholder for future integration
        }
      })
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}
