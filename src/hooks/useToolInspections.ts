import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toDbError } from './useToolAssignments'

/**
 * Tool reads shared by the team view + repair bucket (Operations → Tools & Assets).
 * get_repair_bucket = awaiting-vendor units (maintenance, no open repair transfer);
 * get_team_tool_units_v2 = a team's units with last-checked/due + lifecycle_type.
 * Condition checks now flow through the monthly check page (useToolChecks);
 * repair actions through useToolRepair.
 */

export type RepairUnit = {
  unit_id: string
  item_name: string | null
  serial_number: string | null
  brand: string | null
  condition: string
  division_id: string | null
  division_name: string | null
  current_team_id: string | null
  current_team_name: string | null
  last_inspected_at: string | null
  lifecycle_type: string
  pending_scrap: boolean
}

export type TeamToolUnitV2 = {
  unit_id: string
  item_name: string | null
  serial_number: string | null
  brand: string | null
  condition: string
  status: string
  assigned_at: string | null
  last_inspected_at: string | null
  inspection_due: boolean
  lifecycle_type: string
}

export function useRepairBucket(divisionIds?: string[]) {
  return useQuery({
    queryKey: queryKeys.toolInspections.repairBucket(divisionIds),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'get_repair_bucket',
        divisionIds && divisionIds.length ? { p_division_ids: divisionIds } : {},
      )
      if (error) throw toDbError(error, 'Load repair bucket')
      return (data ?? []) as RepairUnit[]
    },
    staleTime: 60_000,
  })
}

export function useTeamToolUnitsV2(teamId: string | null) {
  return useQuery({
    queryKey: queryKeys.toolInspections.teamUnitsV2(teamId),
    enabled: !!teamId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_team_tool_units_v2', { p_team_id: teamId! })
      if (error) throw toDbError(error, 'Load team tool units')
      return (data ?? []) as TeamToolUnitV2[]
    },
  })
}
