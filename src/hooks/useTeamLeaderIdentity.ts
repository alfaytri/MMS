// src/hooks/useTeamLeaderIdentity.ts
// Fix 2: team_id is ALWAYS resolved via DB join, never from JWT user_metadata.
// JWT is only used for the is_team_leader flag (UI hint for middleware).
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { TlIdentity } from '@/types/team-leader'

export function useTeamLeaderIdentity() {
  return useQuery<TlIdentity | null>({
    queryKey: ['tl-identity'],
    queryFn: async (): Promise<TlIdentity | null> => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      // Resolve profile
      const { data: profile, error: profileError } = await (supabase as any)
        .from('profiles')
        .select('id, user_type, user_custom_roles(custom_roles(permissions))')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (profileError || !profile) return null

      // Check admin permission
      const allPermissions: string[] = (profile.user_custom_roles ?? [])
        .flatMap((r: { custom_roles: { permissions: string[] } | null }) =>
          r.custom_roles?.permissions ?? []
        )
      const isAdmin = allPermissions.includes('teams.team_leader.view')

      // Resolve teamId via DB join — never use user_metadata.team_id
      let teamId: string | null = null
      if (profile.user_type === 'team-leader') {
        const { data: emp } = await (supabase as any)
          .from('employees')
          .select('id, teams!teams_leader_id_fkey(id)')
          .eq('profile_id', profile.id)
          .maybeSingle()

        const teams = emp?.teams
        if (Array.isArray(teams) && teams.length > 0) {
          teamId = teams[0].id
        } else if (teams && typeof teams === 'object' && 'id' in teams) {
          teamId = (teams as { id: string }).id
        }
      }

      return { teamId, isAdmin, profileId: profile.id }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true, // re-check if roster changes while app is open
  })
}

export function useAllTeamsForSelect() {
  return useQuery({
    queryKey: ['tl-all-teams-select'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('teams')
        .select('id, name, divisions(name)')
        .eq('is_deleted', false)
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []).map((t: { id: string; name: string; divisions?: { name: string } | null }) => ({
        id: t.id,
        name: t.name,
        division_name: t.divisions?.name ?? null,
      }))
    },
    staleTime: 5 * 60_000,
  })
}
