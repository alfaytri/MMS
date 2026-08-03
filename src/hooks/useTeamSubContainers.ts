/**
 * Teams + Places module — hook family for Team sub-containers.
 *
 * Teams live as sub-containers under the single shared virtual warehouse
 * with `warehouse_kind='teams'` (D.6.b Repair-vendor pattern). Each team
 * row is one `warehouse_sub_containers` row scoped to a division.
 *
 * Later, when the real Teams module ships, `team_id` on
 * warehouse_sub_containers will point at that module's rows. For now the
 * name + division combination IS the team.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type TeamRow = {
  id:                              string
  name:                            string
  division_id:                     string
  division_name:                   string
  team_id:                         string | null
  is_active:                       boolean
  responsible_person_profile_id:   string | null
  responsible_person_name:         string | null
  responsible_person_phone:        string | null
  created_at:                      string | null
  updated_at:                      string | null
}

// ─── 1. Read ────────────────────────────────────────────────────────────
// Calls the SECURITY DEFINER RPC get_teams_master_list so operators see
// every team regardless of their active-division RLS. Master-data pages
// need cross-division visibility for admin config.
export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams.all,
    queryFn: async (): Promise<TeamRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_teams_master_list')
      if (error) throw error
      return (data ?? []).map((r): TeamRow => ({
        id:                              r.id,
        name:                            r.name,
        division_id:                     r.division_id,
        division_name:                   r.division_name,
        team_id:                         r.team_id,
        is_active:                       r.is_active,
        responsible_person_profile_id:   r.responsible_person_profile_id,
        responsible_person_name:         r.responsible_person_name,
        responsible_person_phone:        r.responsible_person_phone,
        created_at:                      r.created_at,
        updated_at:                      r.updated_at,
      }))
    },
    staleTime: 60_000,
  })
}

// Postgres error codes we translate to friendlier messages in the create/update
// hooks. 23505 is unique-constraint-violation; the only unique on
// warehouse_sub_containers is (warehouse_id, name).
function mapDbError(err: { code?: string; message?: string } | null | undefined, entity: 'team' | 'place'): Error {
  if (!err) return new Error('Unknown error')
  if (err.code === '23505') {
    return new Error(`A ${entity} with that name already exists in this division.`)
  }
  return new Error(err.message ?? 'Unknown error')
}

// ─── 2. Create ──────────────────────────────────────────────────────────
// Goes through rpc_upsert_team_or_place — SECURITY DEFINER, bypasses the
// sub_container_scope_insert_r RLS so admin can create teams in any division.
export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name: string
      division_id: string
      responsible_person_profile_id?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_upsert_team_or_place', {
        p_kind:        'teams',
        p_name:        payload.name.trim(),
        p_division_id: payload.division_id,
        p_is_active:   true,
        p_responsible_person_profile_id: payload.responsible_person_profile_id ?? undefined,
      })
      if (error) throw mapDbError(error, 'team')
      return data as unknown as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all })
    },
  })
}

// ─── 3. Update ──────────────────────────────────────────────────────────
export function useUpdateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id: string
      name?: string
      division_id?: string
      is_active?: boolean
      responsible_person_profile_id?: string | null   // pass undefined to leave alone, null to clear
    }) => {
      const supabase = createClient()
      const { data: rows, error: listErr } = await supabase.rpc('get_teams_master_list')
      if (listErr) throw listErr
      const current = (rows ?? []).find((r) => r.id === payload.id)
      if (!current) throw new Error('Team not found')

      const { data, error } = await supabase.rpc('rpc_upsert_team_or_place', {
        p_kind:        'teams',
        p_id:          payload.id,
        p_name:        (payload.name        ?? current.name).trim(),
        p_division_id:  payload.division_id ?? current.division_id,
        p_is_active:    payload.is_active   ?? current.is_active,
        p_responsible_person_profile_id:
          (payload.responsible_person_profile_id === undefined
            ? current.responsible_person_profile_id
            : payload.responsible_person_profile_id) ?? undefined,
      })
      if (error) throw mapDbError(error, 'team')
      return data as unknown as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all })
    },
  })
}
