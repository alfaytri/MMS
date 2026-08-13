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
import { sendNotifications, recipientsForNotification } from '@/lib/notify'

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
  customer_phone?:     string | null
  customer_email?:     string | null
  customer_entity_type?: string | null
  customer_type?:      string | null
  requested_group_name?: string | null
  previous_group_name?:  string | null
  requested_group_limit?: number | null
  cr_url?:             string | null
  establishment_id_url?: string | null
  signed_credit_form_url?: string | null
  rows?:               CreditGroupApprovalRow[]
}

export function usePendingCreditGroupRequests() {
  return useQuery({
    queryKey: queryKeys.creditGroupApprovals.pending,
    queryFn: async (): Promise<CreditGroupRequest[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_credit_group_requests')
        .select(`
          *,
          customer:customers(name, email, entity_type, credit_group_id, customer_phones(phone, is_primary), customer_credit_docs(cr_url, establishment_id_url, signed_credit_form_url)),
          requested_group:credit_groups!customer_credit_group_requests_requested_group_id_fkey(name, credit_limit),
          previous_group:credit_groups!customer_credit_group_requests_previous_group_id_fkey(name),
          rows:customer_credit_group_approvals(*)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []).map((r) => ({
        ...r,
        customer_name:           r.customer?.name ?? null,
        customer_phone:          ((r.customer as unknown as { customer_phones?: { phone: string; is_primary: boolean }[] } | null)?.customer_phones ?? []).find((p) => p.is_primary)?.phone ?? ((r.customer as unknown as { customer_phones?: { phone: string; is_primary: boolean }[] } | null)?.customer_phones ?? [])[0]?.phone ?? null,
        customer_email:          r.customer?.email ?? null,
        customer_entity_type:    r.customer?.entity_type ?? null,
        customer_type:           r.customer?.credit_group_id ? 'credit' : 'cash',
        ...(() => {
          // customer_credit_docs is a 1:1 join — PostgREST returns null or a
          // single row (may still arrive as an array of length 0/1 depending
          // on relationship inference — handle both).
          const raw = (r.customer as unknown as {
            customer_credit_docs?:
              | { cr_url?: string | null; establishment_id_url?: string | null; signed_credit_form_url?: string | null }
              | { cr_url?: string | null; establishment_id_url?: string | null; signed_credit_form_url?: string | null }[]
              | null
          } | null)?.customer_credit_docs
          const row = Array.isArray(raw) ? raw[0] : raw
          return {
            cr_url:                 row?.cr_url                 ?? null,
            establishment_id_url:   row?.establishment_id_url   ?? null,
            signed_credit_form_url: row?.signed_credit_form_url ?? null,
          }
        })(),
        requested_group_name:    r.requested_group?.name ?? null,
        requested_group_limit:   r.requested_group?.credit_limit ?? null,
        previous_group_name:     r.previous_group?.name ?? null,
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
      const { data, error } = await supabase
        .from('customer_credit_group_requests')
        .select(`
          *,
          customer:customers(name, email, entity_type, credit_group_id, customer_phones(phone, is_primary), customer_credit_docs(cr_url, establishment_id_url, signed_credit_form_url)),
          requested_group:credit_groups!customer_credit_group_requests_requested_group_id_fkey(name, credit_limit),
          previous_group:credit_groups!customer_credit_group_requests_previous_group_id_fkey(name),
          rows:customer_credit_group_approvals(*)
        `)
        .in('status', ['approved', 'rejected', 'cancelled'])
        .order('decided_at', { ascending: false, nullsFirst: false })
        .limit(50)
      if (error) throw error
      return (data ?? []).map((r) => ({
        ...r,
        customer_name:           r.customer?.name ?? null,
        customer_phone:          ((r.customer as unknown as { customer_phones?: { phone: string; is_primary: boolean }[] } | null)?.customer_phones ?? []).find((p) => p.is_primary)?.phone ?? ((r.customer as unknown as { customer_phones?: { phone: string; is_primary: boolean }[] } | null)?.customer_phones ?? [])[0]?.phone ?? null,
        customer_email:          r.customer?.email ?? null,
        customer_entity_type:    r.customer?.entity_type ?? null,
        customer_type:           r.customer?.credit_group_id ? 'credit' : 'cash',
        ...(() => {
          // customer_credit_docs is a 1:1 join — PostgREST returns null or a
          // single row (may still arrive as an array of length 0/1 depending
          // on relationship inference — handle both).
          const raw = (r.customer as unknown as {
            customer_credit_docs?:
              | { cr_url?: string | null; establishment_id_url?: string | null; signed_credit_form_url?: string | null }
              | { cr_url?: string | null; establishment_id_url?: string | null; signed_credit_form_url?: string | null }[]
              | null
          } | null)?.customer_credit_docs
          const row = Array.isArray(raw) ? raw[0] : raw
          return {
            cr_url:                 row?.cr_url                 ?? null,
            establishment_id_url:   row?.establishment_id_url   ?? null,
            signed_credit_form_url: row?.signed_credit_form_url ?? null,
          }
        })(),
        requested_group_name:    r.requested_group?.name ?? null,
        requested_group_limit:   r.requested_group?.credit_limit ?? null,
        previous_group_name:     r.previous_group?.name ?? null,
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
      const { data, error } = await supabase
        .from('customer_credit_group_requests')
        .select('*, requested_group:credit_groups!customer_credit_group_requests_requested_group_id_fkey(name)')
        .eq('customer_id', customerId!)
        .eq('status', 'pending')
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return { ...data, requested_group_name: data.requested_group?.name ?? null } as CreditGroupRequest
    },
    staleTime: 30_000,
  })
}

export function useSubmitCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, groupId }: { customerId: string; groupId: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('submit_credit_group_change', {
        p_customer_id:        customerId,
        p_requested_group_id: groupId,
      })
      if (error) throw new Error(error.message)
      return data as { request_id: string; step_count: number; status: 'pending' | 'approved' }
    },
    onSuccess: async (data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.pending })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomer(variables.customerId) })
      qc.invalidateQueries({ queryKey: ['customer-credit-summary'] })
      qc.invalidateQueries({ queryKey: ['customers'] })

      if (data.status === 'pending') {
        const recipients = await recipientsForNotification('credit_group_pending')
        if (recipients.length > 0) {
          await sendNotifications(recipients.map(pid => ({
            profile_id: pid,
            type: 'credit_group_pending',
            title: 'Credit group change requires approval',
            related_id: data.request_id,
            related_type: 'credit_group_request',
          })))
          qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
        }
      }
    },
  })
}

export function useApproveCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ approvalId, requestId, comment }: { approvalId: string; requestId: string; comment: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('approve_credit_group_change', {
        p_approval_id: approvalId,
        p_comment:     comment || undefined,
      })
      if (error) throw new Error(error.message)
      return requestId
    },
    onSuccess: async (requestId) => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.all })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomerAll })
      qc.invalidateQueries({ queryKey: ['customer-credit-summary'] })
      qc.invalidateQueries({ queryKey: ['customers'] })

      const supabase = createClient()
      const { data: req } = await supabase
        .from('customer_credit_group_requests')
        .select('status, requested_by')
        .eq('id', requestId)
        .single()
      if (req?.status === 'approved' && req.requested_by) {
        await sendNotifications([{
          profile_id: req.requested_by,
          type: 'credit_group_approved',
          title: 'Credit group change has been approved',
          related_id: requestId,
          related_type: 'credit_group_request',
        }])
        qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
      }
    },
  })
}

export function useRejectCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ approvalId, requestId, reason }: { approvalId: string; requestId: string; reason: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('reject_credit_group_change', {
        p_approval_id: approvalId,
        p_reason:      reason,
      })
      if (error) throw new Error(error.message)
      return requestId
    },
    onSuccess: async (requestId) => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.all })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomerAll })

      const supabase = createClient()
      const { data: req } = await supabase
        .from('customer_credit_group_requests')
        .select('requested_by')
        .eq('id', requestId)
        .single()
      if (req?.requested_by) {
        await sendNotifications([{
          profile_id: req.requested_by,
          type: 'credit_group_rejected',
          title: 'Credit group change has been rejected',
          related_id: requestId,
          related_type: 'credit_group_request',
        }])
        qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
      }
    },
  })
}

export function useCancelCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason?: string }) => {
      const supabase = createClient()
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        'cancel_credit_group_change',
        { p_request_id: requestId, p_reason: reason?.trim() || null }
      )
      if (error) throw new Error((error as { message?: string }).message ?? 'Failed to cancel request')
      return requestId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.all })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomerAll })
      qc.invalidateQueries({ queryKey: ['customer-credit-summary'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useForceApproveCreditGroupChange() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, comment }: { requestId: string; comment?: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('force_approve_credit_group_change', {
        p_request_id: requestId,
        p_comment:    comment?.trim() ? comment : undefined,
      })
      if (error) throw new Error(error.message)
      return { data, requestId }
    },
    onSuccess: async ({ requestId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.all })
      qc.invalidateQueries({ queryKey: queryKeys.creditGroupApprovals.byCustomerAll })
      qc.invalidateQueries({ queryKey: ['customer-credit-summary'] })
      qc.invalidateQueries({ queryKey: ['customers'] })

      const supabase = createClient()
      const { data: req } = await supabase
        .from('customer_credit_group_requests')
        .select('requested_by')
        .eq('id', requestId)
        .single()
      if (req?.requested_by) {
        await sendNotifications([{
          profile_id: req.requested_by,
          type: 'credit_group_approved',
          title: 'Credit group change has been force-approved',
          related_id: requestId,
          related_type: 'credit_group_request',
        }])
        qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
      }
    },
  })
}
