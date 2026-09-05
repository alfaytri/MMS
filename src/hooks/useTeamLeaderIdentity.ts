// src/hooks/useTeamLeaderIdentity.ts
// Fix 2: team_id is ALWAYS resolved via DB join, never from JWT user_metadata.
// JWT is only used for the is_team_leader flag (UI hint for middleware).
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { TlIdentity, TlTeamOption } from '@/types/team-leader'
import { queryKeys } from '@/lib/queryKeys'

export function useTeamLeaderIdentity() {
  return useQuery<TlIdentity | null>({
    queryKey: queryKeys.teamLeader.identity,
    queryFn: async (): Promise<TlIdentity | null> => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      // Resolve profile
      const { data: profile, error: profileError } = await supabase
        .from('user_data')
        .select('id, user_type, user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(permissions, is_system_admin))')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (profileError || !profile) return null

      // F②: "monitor any team" is teams.team_leader.manage (was conflated with
      // .view, which every field leader holds just to open the app). A plain
      // field leader (only .view) is NOT isAdmin → no team selector, and the
      // get_team_leader_visits guard scopes them to the team they actually lead.
      // A system-admin role implicitly holds every permission — mirror the DB's
      // _user_has_permission(is_system_admin) bypass so an admin still monitors
      // all teams on the client, matching what the guard will allow.
      const roles = (profile.user_custom_roles ?? []) as Array<{
        custom_roles: { permissions: string[] | null; is_system_admin: boolean | null } | null
      }>
      const allPermissions: string[] = roles.flatMap((r) => r.custom_roles?.permissions ?? [])
      const isSystemAdmin = roles.some((r) => r.custom_roles?.is_system_admin === true)
      const isAdmin = isSystemAdmin || allPermissions.includes('teams.team_leader.manage')

      // Resolve teamId = the team this user is the LEADER of. teams.leader_id is
      // the single source of truth for "who leads a team" — it is set when a
      // leader is picked in Teams & Employees (which also makes them the custody
      // responsible person). We look up the caller's employee row, then the team
      // whose leader_id points at it. (Previously this used employees.team_id,
      // which matched any member, not the selected leader.)
      let teamId: string | null = null
      {
        const { data: emp } = await supabase
          .from('employees')
          .select('id')
          .eq('profile_id', profile.id)
          .maybeSingle()
        if (emp?.id) {
          const { data: led } = await supabase
            .from('teams')
            .select('id')
            .eq('leader_id', emp.id)
            .is('deleted_at', null)
            .order('name', { ascending: true })
            .limit(1)
          teamId = led?.[0]?.id ?? null
        }
      }

      // Use RPC to bypass PostgREST schema cache for new column
      const { data: isDmFlag } = await supabase
        .rpc('check_is_division_manager', { p_profile_id: profile.id })
      const isDivisionManager = isDmFlag === true

      // Fetch user's division IDs for multi-team access (only if division manager)
      let divisionIds: string[] = []
      if (isDivisionManager) {
        const { data: userDivs } = await supabase
          .from('user_company_divisions')
          .select('division_id')
          .eq('profile_id', profile.id)
        divisionIds = (userDivs ?? []).map((ud: { division_id: string }) => ud.division_id)
      }

      return { teamId, isAdmin, isDivisionManager, profileId: profile.id, divisionIds }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true, // re-check if roster changes while app is open
  })
}

export function useAllTeamsForSelect(divisionIds?: string[]) {
  return useQuery<TlTeamOption[]>({
    queryKey: queryKeys.teamLeader.allTeamsSelect(divisionIds),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('teams')
        .select('id, name, division_id, divisions:company_divisions(name)')
        .is('deleted_at', null)
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
