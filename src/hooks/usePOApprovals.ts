// src/hooks/usePOApprovals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PurchaseOrder } from './usePurchaseOrders'
// Activity logging + notifications are now handled inside the po_approval_action RPC
import { queryKeys } from '@/lib/queryKeys'

async function getMyIdentity() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('id, full_name').eq('auth_user_id', user.id).maybeSingle()
  return {
    email: user.email ?? '',
    profileId: profile?.id ?? null,
    fullName: (profile?.full_name ?? null) as string | null,
  }
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: queryKeys.approvals.poApprovalsPending,
    queryFn: async () => {
      const me = await getMyIdentity()
      if (!me?.profileId) return [] as PurchaseOrder[]
      const supabase = createClient()

      // Get current user's approval roles.
      // Source: user_custom_roles joined to custom_roles (filtered to approval-slot roles).
      // Returned shape is still string[] of role NAMES (custom_roles.name), e.g. ['Owner', 'Accountant'].
      const { data: myRoles } = await supabase
        .from('user_custom_roles')
        .select('custom_roles!inner(name, is_approval_slot, deleted_at)')
        .eq('profile_id', me.profileId)
        .eq('custom_roles.is_approval_slot', true)
        .is('custom_roles.deleted_at', null)
      const roles = (myRoles ?? [])
        .map((r: { custom_roles: { name: string } | null }) => r.custom_roles?.name)
        .filter((n: string | undefined): n is string => !!n)
      if (roles.length === 0) return [] as PurchaseOrder[]

      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('status', 'pending_approval')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error

      const pos = (data ?? []) as PurchaseOrder[]

      // Owners see all pending POs so they can approve any chain.
      // Role names are now human-readable (custom_roles.name), e.g. 'Owner'.
      if (roles.includes('Owner')) return pos

      // Others see only POs where they have an active pending step in their role
      return pos.filter((po) => {
        const steps = po.po_approvals ?? []
        const maxIteration = Math.max(...steps.map((s) => s.iteration ?? 1), 1)
        return steps.some(
          (s) =>
            s.status === 'pending' &&
            s.is_active === true &&
            s.iteration === maxIteration &&
            roles.includes(s.role),
        )
      })
    },
    staleTime: 30 * 1000,
  })
}

export function useCompletedApprovals() {
  return useQuery({
    queryKey: queryKeys.approvals.poApprovalsCompleted,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, po_approvals(*), po_line_items(*)')
        .in('status', ['approved', 'partially_received', 'received', 'cancelled'])
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as PurchaseOrder[]
    },
    staleTime: 60 * 1000,
  })
}

export function useApproveStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stepId,
      poId,
      comment,
    }: {
      stepId: string
      poId: string
      comment: string
    }) => {
      const supabase = createClient()
      const me = await getMyIdentity()
      if (!me) throw new Error('Not authenticated')

      const { data, error } = await supabase.rpc('po_approval_action', {
        p_po_id: poId,
        p_step_id: stepId,
        p_approver_email: me.email,
        p_approver_name: me.fullName ?? me.email,
        p_approver_profile_id: me.profileId!,
        p_action: 'approve',
        p_comment: comment || undefined,
      })
      if (error) throw error
      return data as { ok: boolean; po_status: string; action: string; roles: string[] }
    },
    onSuccess: (_data: unknown, variables: { stepId: string; poId: string; comment: string }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.poApprovals })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.poId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

export function useForceApproveStep() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stepId,
      poId,
      forceComment,
    }: {
      stepId: string
      poId: string
      forceComment: string
    }) => {
      if (!forceComment.trim()) throw new Error('A comment is required for force-approve.')
      const supabase = createClient()
      const me = await getMyIdentity()
      if (!me?.profileId) throw new Error('Not authenticated')

      const { data, error } = await supabase.rpc('po_approval_action', {
        p_po_id: poId,
        p_step_id: stepId,
        p_approver_email: me.email,
        p_approver_name: me.fullName ?? me.email,
        p_approver_profile_id: me.profileId,
        p_action: 'force_approve',
        p_comment: forceComment,
      })
      if (error) throw error
      return data as { ok: boolean; po_status: string; action: string; roles: string[] }
    },
    onSuccess: (_data: unknown, variables: { stepId: string; poId: string; forceComment: string }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.poApprovals })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.poId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

export function useForceApproveAllSteps() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      poId,
      forceComment,
    }: {
      poId: string
      forceComment?: string
    }) => {
      const supabase = createClient()
      const me = await getMyIdentity()
      if (!me?.profileId) throw new Error('Not authenticated')

      const { data, error } = await supabase.rpc('po_approval_action', {
        p_po_id: poId,
        p_step_id: null as unknown as string,
        p_approver_email: me.email,
        p_approver_name: me.fullName ?? me.email,
        p_approver_profile_id: me.profileId,
        p_action: 'force_approve_all',
        p_comment: forceComment?.trim() || undefined,
      })
      if (error) throw error
      const result = data as { ok: boolean; po_status: string; action: string; roles: string[] }
      return { approvedCount: result.roles?.length ?? 0 }
    },
    onSuccess: (_data, variables: { poId: string; forceComment?: string }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.poApprovals })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.poId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

export function useRejectPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      poId,
      stepId,
      comment,
      mode,
    }: {
      poId: string
      stepId: string
      comment: string
      mode: 'full_rejection' | 'send_back_to_draft'
    }) => {
      const supabase = createClient()
      const me = await getMyIdentity()
      if (!me) throw new Error('Not authenticated')

      const { data, error } = await supabase.rpc('po_approval_action', {
        p_po_id: poId,
        p_step_id: stepId,
        p_approver_email: me.email,
        p_approver_name: me.fullName ?? me.email,
        p_approver_profile_id: me.profileId!,
        p_action: mode === 'full_rejection' ? 'reject_cancel' : 'reject_draft',
        p_comment: comment || undefined,
      })
      if (error) throw error
      return data as { ok: boolean; po_status: string; action: string; roles: string[] }
    },
    onSuccess: (_data: unknown, variables: { poId: string; stepId: string; comment: string; mode: 'full_rejection' | 'send_back_to_draft' }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.poApprovals })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.poId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export function useMyApprovalRoles() {
  return useQuery({
    queryKey: queryKeys.approvals.myRoles,
    queryFn: async () => {
      const me = await getMyIdentity()
      if (!me?.profileId) return [] as string[]
      const supabase = createClient()
      // Return role names verbatim ('Owner', 'Purchase Manager') so callers can
      // do `myRoles.includes(step.role)` directly — `po_approvals.role` was
      // converted to the capitalised human-readable form in migration
      // 20260615131936_convert_po_approvals_role_and_drop_legacy.sql.
      const { data } = await supabase
        .from('user_custom_roles')
        .select('custom_roles!inner(name, is_approval_slot, deleted_at)')
        .eq('profile_id', me.profileId)
        .eq('custom_roles.is_approval_slot', true)
        .is('custom_roles.deleted_at', null)
      return (data ?? [])
        .map((r: { custom_roles: { name: string } | null }) => r.custom_roles?.name)
        .filter((n: string | undefined): n is string => !!n)
    },
    staleTime: 60 * 1000,
  })
}
