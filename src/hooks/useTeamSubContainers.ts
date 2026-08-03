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
import type { DBUpdate } from '@/types/database.types'

export type TeamRow = {
  id:            string
  name:          string
  division_id:   string
  division_name: string
  team_id:       string | null
  is_active:     boolean
  created_at:    string | null
  updated_at:    string | null
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
        id:            r.id,
        name:          r.name,
        division_id:   r.division_id,
        division_name: r.division_name,
        team_id:       r.team_id,
        is_active:     r.is_active,
        created_at:    r.created_at,
        updated_at:    r.updated_at,
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
export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name: string; division_id: string }) => {
      const supabase = createClient()
      // Resolve the shared Teams warehouse id once.
      const { data: wh, error: whErr } = await supabase
        .from('warehouses')
        .select('id')
        .eq('warehouse_kind', 'teams')
        .maybeSingle()
      if (whErr) throw whErr
      if (!wh)   throw new Error('Teams warehouse not found — migration missing?')

      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .insert({
          warehouse_id: wh.id,
          division_id:  payload.division_id,
          name:         payload.name.trim(),
          is_active:    true,
        })
        .select()
        .single()
      if (error) throw mapDbError(error, 'team')
      return data
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
    mutationFn: async (payload: { id: string; name?: string; division_id?: string; is_active?: boolean }) => {
      const supabase = createClient()
      const patch: DBUpdate<'warehouse_sub_containers'> = {}
      if (payload.name        !== undefined) patch.name        = payload.name.trim()
      if (payload.division_id !== undefined) patch.division_id = payload.division_id
      if (payload.is_active   !== undefined) patch.is_active   = payload.is_active
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .update(patch)
        .eq('id', payload.id)
        .select()
        .single()
      if (error) throw mapDbError(error, 'team')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all })
    },
  })
}
