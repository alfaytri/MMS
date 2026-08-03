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
// Lists every sub-container under the shared `Teams` warehouse, joined
// with its division for display. Sort: division name, then team name.
export function useTeams() {
  return useQuery({
    queryKey: queryKeys.teams.all,
    queryFn: async (): Promise<TeamRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_sub_containers')
        .select(`
          id, name, division_id, team_id, is_active, created_at, updated_at,
          warehouses!inner ( warehouse_kind ),
          company_divisions!inner ( name )
        `)
        .eq('warehouses.warehouse_kind', 'teams')
        .order('name')
      if (error) throw error
      return (data ?? [])
        .filter((r) => r.division_id !== null)
        .map((r): TeamRow => {
          const div = Array.isArray(r.company_divisions) ? r.company_divisions[0] : r.company_divisions
          return {
            id:            r.id,
            name:          r.name,
            division_id:   r.division_id as string,
            division_name: div?.name ?? '—',
            team_id:       r.team_id,
            is_active:     r.is_active,
            created_at:    r.created_at,
            updated_at:    r.updated_at,
          }
        })
    },
    staleTime: 60_000,
  })
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
      if (error) throw error
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
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.teams.all })
    },
  })
}
