import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toDbError } from './useToolAssignments'

/**
 * Tool condition checks + repair bucket (Operations → Tools & Assets, Phase 2).
 * record-inspection applies the §6 lifecycle mapping server-side; reads back the
 * repair bucket (status='maintenance') and a team's units with last-checked/due.
 * All go through the SECURITY DEFINER RPCs in migration 20260922000100.
 */

export type InspectionVerdict = 'good' | 'bad' | 'under_repair'

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
}

function useInvalidateTools() {
  const qc = useQueryClient()
  return () => {
    // Inspections + scrap change a team's units/counts AND the repair bucket.
    qc.invalidateQueries({ queryKey: queryKeys.toolAssignments.all })
    qc.invalidateQueries({ queryKey: queryKeys.toolInspections.all })
  }
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

export function useRecordInspection() {
  const invalidate = useInvalidateTools()
  return useMutation<string, Error, { unitId: string; verdict: InspectionVerdict; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_record_tool_inspection', {
        p_unit_id: v.unitId,
        p_verdict: v.verdict,
        ...(v.notes ? { p_notes: v.notes } : {}),
      })
      if (error) throw toDbError(error, 'Record inspection')
      return data as string
    },
    onSuccess: invalidate,
  })
}
