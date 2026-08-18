import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

/**
 * Team assignment for serialized tool units (Operations → Tools & Assets).
 * Teams are custody locations; a unit is assigned to a team in its own division
 * (a NULL-division unit has its division established from the team on first
 * assign). All writes go through the SECURITY DEFINER RPCs in migration
 * 20260920000100; reads through the RPCs in 20260920000300.
 */

/** PostgrestError is not an Error subclass — wrap it so the real message shows. */
export function toDbError(
  e: { code?: string; message?: string; details?: string; hint?: string } | null,
  ctx: string,
): Error {
  if (!e) return new Error(ctx)
  const detail = [e.message, e.details, e.hint].filter(Boolean).join(' | ')
  return new Error(`${ctx}: [${e.code ?? '?'}] ${detail}`.trim())
}

export type TeamToolCount = {
  team_id: string
  team_name: string
  division_id: string
  division_name: string | null
  responsible_person_name: string | null
  held_count: number
}
export type TeamToolUnit = {
  unit_id: string
  item_name: string | null
  serial_number: string | null
  brand: string | null
  condition: string
  status: string
  assigned_at: string | null
}
export type AssignableToolUnit = {
  unit_id: string
  item_id: string | null
  item_name: string | null
  category_id: string | null
  category_name: string | null
  serial_number: string | null
  brand: string | null
  condition: string
}

export function useTeamsWithToolCounts(divisionIds?: string[]) {
  return useQuery({
    queryKey: queryKeys.toolAssignments.teams(divisionIds),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'get_teams_with_tool_counts',
        divisionIds && divisionIds.length ? { p_division_ids: divisionIds } : {},
      )
      if (error) throw toDbError(error, 'Load teams with tool counts')
      return (data ?? []) as TeamToolCount[]
    },
    staleTime: 60_000,
  })
}

export function useTeamToolUnits(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.toolAssignments.teamUnits(teamId),
    enabled: !!teamId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_team_tool_units', { p_team_id: teamId! })
      if (error) throw toDbError(error, 'Load team tool units')
      return (data ?? []) as TeamToolUnit[]
    },
  })
}

export function useAssignableToolUnits(divisionId: string | null, search?: string) {
  return useQuery({
    queryKey: queryKeys.toolAssignments.assignable(divisionId, search),
    enabled: !!divisionId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_assignable_tool_units', {
        p_division_id: divisionId!,
        ...(search && search.trim() ? { p_search: search.trim() } : {}),
      })
      if (error) throw toDbError(error, 'Load assignable tools')
      return (data ?? []) as AssignableToolUnit[]
    },
  })
}

function useInvalidateAssignments() {
  const qc = useQueryClient()
  return () => {
    // Refresh both namespaces: the team detail now reads via toolInspections
    // (get_team_tool_units_v2) + the repair bucket, so assign/move/return must
    // invalidate it too — otherwise the list is stale until a manual reload.
    qc.invalidateQueries({ queryKey: queryKeys.toolAssignments.all })
    qc.invalidateQueries({ queryKey: queryKeys.toolInspections.all })
  }
}

export function useAssignToolUnit() {
  const invalidate = useInvalidateAssignments()
  return useMutation<string, Error, { unitId: string; teamId: string; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_assign_tool_unit_to_team', {
        p_unit_id: v.unitId,
        p_team_id: v.teamId,
        ...(v.notes ? { p_notes: v.notes } : {}),
      })
      if (error) throw toDbError(error, 'Assign tool to team')
      return data as string
    },
    onSuccess: invalidate,
  })
}

export function useMoveToolUnit() {
  const invalidate = useInvalidateAssignments()
  return useMutation<string, Error, { unitId: string; toTeamId: string; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_move_tool_unit_to_team', {
        p_unit_id: v.unitId,
        p_to_team_id: v.toTeamId,
        ...(v.notes ? { p_notes: v.notes } : {}),
      })
      if (error) throw toDbError(error, 'Move tool to team')
      return data as string
    },
    onSuccess: invalidate,
  })
}

export function useReturnToolUnit() {
  const invalidate = useInvalidateAssignments()
  return useMutation<void, Error, { unitId: string; toLocationId?: string | null; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_return_tool_unit', {
        p_unit_id: v.unitId,
        ...(v.notes ? { p_notes: v.notes } : {}),
        ...(v.toLocationId ? { p_to_warehouse_id: v.toLocationId } : {}),
      })
      if (error) throw toDbError(error, 'Return tool')
    },
    onSuccess: invalidate,
  })
}
