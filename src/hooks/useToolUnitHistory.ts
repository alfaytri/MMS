import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toDbError } from '@/hooks/useToolAssignments'

/**
 * Custody history for serialized tool units: a unit's full timeline (which team
 * held it, when, and for how long) and a serial/name search. Backed by the
 * read RPCs in migration 20260920000300.
 */

export type ToolUnitTimelineRow = {
  assignment_id: string
  team_id: string | null
  team_name: string | null
  assigned_at: string
  released_at: string | null
  days: number
  is_current: boolean
}
export type ToolUnitSearchRow = {
  unit_id: string
  item_name: string | null
  serial_number: string | null
  current_team_id: string | null
  current_team_name: string | null
  status: string
  /** Good/Fair health axis. Returned by list_assigned_tool_units (custody card +
   *  assigned-list default view); absent from search_tool_units, hence optional. */
  condition?: string | null
}

export function useToolUnitTimeline(unitId: string | null) {
  return useQuery({
    queryKey: queryKeys.toolAssignments.timeline(unitId),
    enabled: !!unitId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_tool_unit_timeline', { p_unit_id: unitId! })
      if (error) throw toDbError(error, 'Load tool unit timeline')
      return (data ?? []) as ToolUnitTimelineRow[]
    },
  })
}

export function useSearchToolUnits(query: string) {
  const q = query.trim()
  return useQuery({
    queryKey: queryKeys.toolAssignments.search(q),
    enabled: q.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('search_tool_units', { p_query: q })
      if (error) throw toDbError(error, 'Search tool units')
      return (data ?? []) as ToolUnitSearchRow[]
    },
  })
}

/**
 * Currently-assigned tool units for the History & Usage default view, scoped to
 * the top-bar division view (empty set = all divisions). Capped at 200 server-side.
 */
export function useAssignedToolUnits(divisionIds?: string[]) {
  const ids = divisionIds && divisionIds.length ? divisionIds : undefined
  return useQuery({
    queryKey: queryKeys.toolAssignments.assigned(ids),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('list_assigned_tool_units', { p_division_ids: ids })
      if (error) throw toDbError(error, 'List assigned tools')
      return (data ?? []) as ToolUnitSearchRow[]
    },
  })
}
