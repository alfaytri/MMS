// src/hooks/useCreditGroupApprovals.ts
//
// Client hooks for the Credit Group assignment approval workflow.
// Backed by:
//   - public.customer_credit_group_requests  (one row per submitted change)
//   - public.customer_credit_group_approvals (chain steps; PM → AM → Owner)
//   - RPCs submit_/approve_/reject_credit_group_change
//
// Mirrors the shape of useSalesApprovals — one slip per (customer, request,
// iteration) with N step rows. UI surfaces the slip and lets a caller approve
// the step they hold the role for.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type CreditGroupApprovalRow = {
  id:              string
  request_id:      string
  step_role:       string
  step_order:      number
  status:          'pending' | 'approved' | 'rejected'
  is_active:       boolean
  iteration:       number
  decided_by:      string | null
  decided_by_name: string | null
  decided_at:      string | null
  comment:         string | null
  reason:          string | null
  force_approved:  boolean
  force_comment:   string | null
  created_at:      string
}

export type CreditGroupRequest = {
  id:                  string
  customer_id:         string
  requested_group_id:  string
  previous_group_id:   string | null
  status:              'pending' | 'approved' | 'rejected' | 'cancelled'
  requested_by:        string | null
  decided_by:          string | null
  decided_at:          string | null
  created_at:          string
  // joined
  customer_name?:      string | null
  requested_group_name?: string | null
  previous_group_name?:  string | null
  requested_group_limit?: number | null
  rows?:               CreditGroupApprovalRow[]
}

export function usePendingCreditGroupRequests() {
  return useQuery({
    queryKey: queryKeys.creditGroupApprovals.pending,
    queryFn: async (): Promise<CreditGroupRequest[]> => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('customer_credit_group_requests')
        .select(`
          *,
          customer:customers(name),
          requested_group:credit_groups!customer_credit_group_requests_requested_group_id_fkey(name, credit_limit),
          previous_group:credit_groups!customer_credit_group_requests_previous_group_id_fkey(name),
          rows:customer_credit_group_approvals(*)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        ...r,
        customer_name:         r.customer?.name ?? null,
        requested_group_name:  r.requested_group?.name ?? null,
        requested_group_limit: r.requested_group?.credit_limit ?? null,
        previous_group_name:   r.previous_group?.name ?? null,
      })) as CreditGroupRequest[]
    },
    staleTime: 30_000,
  })
}

export function useCompletedCreditGroupRequests() {
  return useQuery({
    queryKey: queryKeys.creditGroupApprovals.completed,
    queryFn: async (): Promise<CreditGroupRequest[]> => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('customer_credit_group_requests')
        .select(`
          *,
          customer:customers(name),
          requested_group:credit_groups!customer_credit_group_requests_requested_group_id_fkey(name, credit_limit),
          previous_group:credit_groups!customer_credit_group_requests_previous_group_id_fkey(name),
          rows:customer_credit_group_approvals(*)
        `)
        .in('status', ['approved', 'rejected', 'cancelled'])
        .order('decided_at', { ascending: false, nullsFirst: false })
        .limit(50)
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        ...r,
        customer_name:         r.customer?.name ?? null,
        requested_group_name:  r.requested_group?.name ?? null,
        requested_group_limit: r.requested_group?.credit_limit ?? null,
        previous_group_name:   r.previous_group?.name ?? null,
      })) as CreditGroupRequest[]
    },
    staleTime: 60_000,
  })
}

export function usePendingCreditGroupRequestForCustomer(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.creditGroupApprovals.byCustomer(customerId),
    enabled: !!customerId,
    queryFn: async (): Promise<CreditGroupRequest | null> => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('customer_credit_group_requests')
        .select('*, requested_group:credit_groups!customer_credit_group_requests_requested_group_id_fkey(name)')
        .eq('customer_id', customerId!)
        .eq('status', 'pending')
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { ...data, requested_group_name: (data as any).requested_group?.name ?? null } as CreditGroupRequest
    },
    staleTime: 30_000,
  })
}

export function useSubmitCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, groupId }: { customerId: string; groupId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('submit_credit_group_change', {
        p_customer_id:        customerId,
        p_requested_group_id: groupId,
      })
      if (error) throw new Error(error.message)
      return data as { request_id: string; step_count: number; status: 'pending' | 'approved' }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.pending })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomer(variables.customerId) })
      qc.invalidateQueries({ queryKey: ['customer-credit-summary'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useApproveCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ approvalId, comment }: { approvalId: string; comment: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('approve_credit_group_change', {
        p_approval_id: approvalId,
        p_comment:     comment || null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.all })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomerAll })
      qc.invalidateQueries({ queryKey: ['customer-credit-summary'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useRejectCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ approvalId, reason }: { approvalId: string; reason: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('reject_credit_group_change', {
        p_approval_id: approvalId,
        p_reason:      reason,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.all })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomerAll })
    },
  })
}

export function useForceApproveCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, comment }: { requestId: string; comment?: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('force_approve_credit_group_change', {
        p_request_id: requestId,
        p_comment:    comment?.trim() ? comment : null,
      })
      if (error) throw new Error(error.message)
      return data as number
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.all })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomerAll })
      qc.invalidateQueries({ queryKey: ['customer-credit-summary'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
