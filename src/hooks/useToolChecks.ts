import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toDbError } from './useToolAssignments'

/**
 * Tool monthly check sessions (Operations → Tools & Assets, Phase 2 rework).
 * Initiate a dated per-division run, record each team's tools Good/Bad linked to
 * the session, finalize, then export the report. RPCs in migration 20260923000400.
 */

export type OpenCheckSession = { id: string; initiated_at: string; initiated_by_name: string | null }
export type CheckProgress = { checked: number; total: number }
export type CheckVerdict = 'good' | 'bad'
export type CheckReportRow = {
  item_name: string | null
  serial_number: string | null
  lifecycle_type: string
  condition: string
  inspected_at: string
  division_name: string | null
  session_initiated_at: string
}

function useInvalidateChecks() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.toolChecks.all })
    qc.invalidateQueries({ queryKey: queryKeys.toolInspections.all })
    qc.invalidateQueries({ queryKey: queryKeys.toolAssignments.all })
  }
}

export function useOpenCheckSession(divisionId: string | null) {
  return useQuery({
    queryKey: queryKeys.toolChecks.openSession(divisionId),
    enabled: !!divisionId,
    queryFn: async (): Promise<OpenCheckSession | null> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_open_tool_check_session', { p_division_id: divisionId! })
      if (error) throw toDbError(error, 'Load check session')
      return ((data ?? []) as OpenCheckSession[])[0] ?? null
    },
  })
}

export function useCheckProgress(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.toolChecks.progress(sessionId),
    enabled: !!sessionId,
    queryFn: async (): Promise<CheckProgress> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_tool_check_session_progress', { p_session_id: sessionId! })
      if (error) throw toDbError(error, 'Load check progress')
      return ((data ?? []) as CheckProgress[])[0] ?? { checked: 0, total: 0 }
    },
  })
}

export function useCheckReport(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.toolChecks.report(sessionId),
    enabled: !!sessionId,
    queryFn: async (): Promise<CheckReportRow[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_tool_check_session_report', { p_session_id: sessionId! })
      if (error) throw toDbError(error, 'Load check report')
      return (data ?? []) as CheckReportRow[]
    },
  })
}

export function useInitiateCheckSession() {
  const invalidate = useInvalidateChecks()
  return useMutation<string, Error, { divisionId: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_initiate_tool_check_session', { p_division_id: v.divisionId })
      if (error) throw toDbError(error, 'Start check')
      return data as string
    },
    onSuccess: invalidate,
  })
}

export function useRecordCheck() {
  const invalidate = useInvalidateChecks()
  return useMutation<string, Error, { unitId: string; verdict: CheckVerdict; sessionId: string; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_record_tool_inspection', {
        p_unit_id: v.unitId,
        p_verdict: v.verdict,
        p_session_id: v.sessionId,
        ...(v.notes ? { p_notes: v.notes } : {}),
      })
      if (error) throw toDbError(error, 'Record check')
      return data as string
    },
    onSuccess: invalidate,
  })
}

export function useFinalizeCheckSession() {
  const invalidate = useInvalidateChecks()
  return useMutation<void, Error, { sessionId: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_finalize_tool_check_session', { p_session_id: v.sessionId })
      if (error) throw toDbError(error, 'Finalize check')
    },
    onSuccess: invalidate,
  })
}
