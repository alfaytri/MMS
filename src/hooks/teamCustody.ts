// Team ↔ custody bridge hooks. A team's "consumption presence" is a custody
// location (warehouse_sub_containers row) linked by team_id. These call the
// SECURITY DEFINER RPCs from 20260902120000_teams_custody_bridge.sql.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

/** A team "holds stock" when it has a linked, active custody location. */
export function deriveHoldsStock(sub: { is_active: boolean } | null | undefined): boolean {
  return !!sub && sub.is_active === true
}

/** The custody location linked to a team (or null). Seeds the "Holds stock" toggle. */
export function useTeamCustody(teamId: string | null) {
  return useQuery({
    queryKey: ['team-custody', teamId],
    enabled: !!teamId,
    staleTime: 30_000,
    queryFn: async (): Promise<{ id: string; is_active: boolean } | null> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .select('id, is_active')
        .eq('team_id' as never, teamId!)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as { id: string; is_active: boolean } | null) ?? null
    },
  })
}

export function useProvisionTeamCustody() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (teamId: string): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'rpc_provision_team_custody' as never,
        { p_team_id: teamId } as never,
      )
      if (error) throw error
      return data as unknown as string
    },
    onSuccess: (_d, teamId) => {
      qc.invalidateQueries({ queryKey: ['team-custody', teamId] })
      qc.invalidateQueries({ queryKey: ['custody-locations'] })
    },
  })
}

export function useDeactivateTeamCustody() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (teamId: string): Promise<void> => {
      const supabase = createClient()
      const { error } = await supabase.rpc(
        'rpc_deactivate_team_custody' as never,
        { p_team_id: teamId } as never,
      )
      if (error) throw error
    },
    onSuccess: (_d, teamId) => {
      qc.invalidateQueries({ queryKey: ['team-custody', teamId] })
      qc.invalidateQueries({ queryKey: ['custody-locations'] })
    },
  })
}
