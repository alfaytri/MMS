// src/hooks/useQcInspections.ts
// QC A2 — pre-booking inspection queues (QA + Ops) and their actions, over the
// qc_inspections table + get_qc_inspections / rpc_qc_* RPCs (migration 20261084).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type QcScope = 'mine' | 'review' | 'open'

export interface QcBreakdownItem {
  scenario: string
  label: string
  points: number
  timing: string
}

export interface QcInspection {
  id: string
  order_id: string
  stage: 'pre_booking' | 'post_completion'
  points: number
  breakdown: QcBreakdownItem[]
  timing: 'before' | 'along' | 'after'
  status: 'pending_analyst' | 'pending_manager' | 'approved' | 'rejected' | 'cancelled'
  inspection_date: string | null
  analyst_id: string | null
  findings: string | null
  reject_reason: string | null
  created_at: string
  decided_at: string | null
  order_number: string | null
  division: string | null
  scheduled_date: string | null
  customer_name: string | null
  analyst_name: string | null
}

export function useQcInspections(scope: QcScope) {
  return useQuery<QcInspection[]>({
    queryKey: ['qc-inspections', scope],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_qc_inspections' as never, { p_scope: scope } as never)
      if (error) throw error
      return (data ?? []) as unknown as QcInspection[]
    },
  })
}

function useQcMutation<TVars>(
  fn: (supabase: ReturnType<typeof createClient>, vars: TVars) => Promise<void>,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: TVars) => {
      const supabase = createClient()
      await fn(supabase, vars)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['qc-inspections'] })
      qc.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useSubmitQcInspection() {
  return useQcMutation<{ inspectionId: string; findings?: string; scores?: unknown }>(
    async (supabase, { inspectionId, findings, scores }) => {
      const { error } = await supabase.rpc(
        'rpc_qc_submit_inspection' as never,
        { p_inspection_id: inspectionId, p_findings: findings ?? null, p_scores: scores ?? null } as never,
      )
      if (error) throw error
    },
  )
}

export function useBookQcInspection() {
  return useQcMutation<{ inspectionId: string; comment?: string }>(
    async (supabase, { inspectionId, comment }) => {
      const { error } = await supabase.rpc(
        'rpc_qc_book_inspection' as never,
        { p_inspection_id: inspectionId, p_comment: comment ?? null } as never,
      )
      if (error) throw error
    },
  )
}

export function useRejectQcInspection() {
  return useQcMutation<{ inspectionId: string; reason: string }>(
    async (supabase, { inspectionId, reason }) => {
      const { error } = await supabase.rpc(
        'rpc_qc_reject_inspection' as never,
        { p_inspection_id: inspectionId, p_reason: reason } as never,
      )
      if (error) throw error
    },
  )
}

export function useReassignQcInspection() {
  return useQcMutation<{ inspectionId: string; analystId: string }>(
    async (supabase, { inspectionId, analystId }) => {
      const { error } = await supabase.rpc(
        'rpc_qc_reassign_inspection' as never,
        { p_inspection_id: inspectionId, p_analyst_id: analystId } as never,
      )
      if (error) throw error
    },
  )
}
