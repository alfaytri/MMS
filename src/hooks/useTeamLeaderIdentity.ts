// src/hooks/useTeamLeaderIdentity.ts
// Fix 2: team_id is ALWAYS resolved via DB join, never from JWT user_metadata.
// JWT is only used for the is_team_leader flag (UI hint for middleware).
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { TlIdentity, TlTeamOption } from '@/types/team-leader'

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
          .select('id, team_id')
          .eq('profile_id', profile.id)
          .maybeSingle()

        teamId = emp?.team_id ?? null
      }

      // Fetch user's division IDs for multi-team access
      const { data: userDivs } = await (supabase as any)
        .from('user_divisions')
        .select('division_id')
        .eq('profile_id', profile.id)
      const divisionIds = (userDivs ?? []).map((ud: { division_id: string }) => ud.division_id)

      return { teamId, isAdmin, profileId: profile.id, divisionIds }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true, // re-check if roster changes while app is open
  })
}

export function useAllTeamsForSelect(divisionIds?: string[]) {
  return useQuery<TlTeamOption[]>({
    queryKey: ['tl-all-teams-select', divisionIds ?? 'all'],
    queryFn: async () => {
      const supabase = createClient()
      let query = (supabase as any)
        .from('teams')
        .select('id, name, division_id, divisions(name)')
        .eq('is_deleted', false)
        .order('name', { ascending: true })

      if (divisionIds && divisionIds.length > 0) {
        query = query.in('division_id', divisionIds)
      }

      const { data, error } = await query
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
