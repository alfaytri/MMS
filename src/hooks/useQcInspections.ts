// src/hooks/useQcInspections.ts
// QC A2 — pre-booking inspection queues (QA + Ops) and their actions, over the
// qc_inspections table + get_qc_inspections / rpc_qc_* RPCs (migration 20261084).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { QcItem } from '@/types/team-leader'
import { buildQcScorersOrFlat } from '@/lib/qc/scorers'

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

/** Per-item QC scorers for an order (post-completion inspection scoring). */
export function useOrderQcScorers(orderId: string | null) {
  return useQuery<QcItem[]>({
    queryKey: ['order-qc-scorers', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = (await supabase
        .from('order_services')
        .select('id, name, service_id, services:service_id(qc_items)')
        .eq('order_id', orderId as string)) as unknown as {
          data: Array<{ id: string; name: string | null; services: { qc_items: unknown } | null }> | null
        }
      const raw = (data ?? []).map((r) => ({ id: r.id, name: r.name ?? 'Service', qc_items: r.services?.qc_items }))
      return buildQcScorersOrFlat(raw)
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

export function useFlagQcRework() {
  return useQcMutation<{ inspectionId: string; notes?: string }>(
    async (supabase, { inspectionId, notes }) => {
      const { error } = await supabase.rpc(
        'rpc_qc_flag_rework' as never,
        { p_inspection_id: inspectionId, p_notes: notes ?? null } as never,
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
