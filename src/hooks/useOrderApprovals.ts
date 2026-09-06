// src/hooks/useOrderApprovals.ts
// The Service Order Approval queue: pending order approvals (risk-gated orders)
// + approve/reject actions, over the shared sale_order_approvals table.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export interface OrderApproval {
  approval_id: string
  order_uuid: string
  order_id: string
  customer_name: string | null
  total_amount: number
  scheduled_date: string
  division: string | null
  is_emergency: boolean
  step_role: string | null
  step_order: number
  reason: string | null
  created_at: string
}

const KEY = ['order-approvals', 'pending'] as const

export function useOrderApprovals() {
  return useQuery<OrderApproval[]>({
    queryKey: KEY,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_pending_order_approvals' as never)
      if (error) throw error
      return (data ?? []) as unknown as OrderApproval[]
    },
  })
}

export function useApproveOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ approvalId, comment }: { approvalId: string; comment?: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc(
        'approve_order_request' as never,
        { p_request_id: approvalId, p_comment: comment ?? null } as never,
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-approvals'] })
      qc.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useRejectOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ approvalId, reason }: { approvalId: string; reason: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc(
        'reject_order_request' as never,
        { p_request_id: approvalId, p_reason: reason } as never,
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-approvals'] })
      qc.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}
