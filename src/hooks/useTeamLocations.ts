// src/hooks/useTeamLocations.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

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
 * Uses two parallel queries (teams + locations) and joins client-side,
 * matching the proven pattern from useTeams. Polls every 30 seconds.
 */
export function useTeamLocations() {
  return useQuery({
    queryKey: queryKeys.teams.locations,
    queryFn: async (): Promise<TeamLocation[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient()

      // Parallel fetch: teams (with leader + vehicles) and live locations
      const [teamsRes, locsRes] = await Promise.all([
        supabase
          .from('teams')
          .select('id, name_en, name, leader_id, employees!teams_leader_id_fkey(name), vehicles(plate)')
          .is('deleted_at', null)
          .order('name_en', { nullsFirst: false }),
        supabase
          .from('team_live_locations')
          .select('team_id, lat, lng, speed, heading, updated_at'),
      ])

      if (teamsRes.error) throw teamsRes.error

      // Build location lookup by team_id
      type LocRow = { team_id: string; lat: number | null; lng: number | null; speed: number | null; heading: number | null; updated_at: string | null }
      const locMap = new Map<string, LocRow>()
      for (const loc of (locsRes.data ?? []) as LocRow[]) {
        locMap.set(loc.team_id, loc)
      }

      type TeamRow = (typeof teamsRes.data extends (infer R)[] | null ? R : never) & {
        employees: { name?: string } | null
        vehicles: { plate?: string }[] | null
      }
      return ((teamsRes.data ?? []) as TeamRow[]).map((t) => {
        const loc = locMap.get(t.id) ?? null
        // leader is a single object (many-to-one via FK)
        const leaderName = t.employees?.name ?? 'No leader'
        return {
          id: t.id,
          teamName: t.name_en ?? t.name ?? '',
          driverName: leaderName,
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
