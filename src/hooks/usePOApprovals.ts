// src/hooks/usePOApprovals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PurchaseOrder } from './usePurchaseOrders'
import { logPOActivity, ROLE_LABELS } from '@/lib/poActivityLogger'

async function getMyIdentity() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await (supabase as any)
    .from('profiles').select('id, division_id, full_name').eq('auth_user_id', user.id).maybeSingle()
  return {
    email: user.email ?? '',
    profileId: profile?.id ?? null,
    divisionId: profile?.division_id ?? null,
    fullName: (profile?.full_name ?? null) as string | null,
  }
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['po-approvals', 'pending'],
    queryFn: async () => {
      const me = await getMyIdentity()
      if (!me?.profileId) return [] as PurchaseOrder[]
      const supabase = createClient()

      // Get current user's approval roles
      const { data: myRoles } = await (supabase as any)
        .from('approval_role_assignments')
        .select('role')
        .eq('profile_id', me.profileId)
        .is('deleted_at', null)
      const roles = (myRoles ?? []).map((r: { role: string }) => r.role) as string[]
      if (roles.length === 0) return [] as PurchaseOrder[]

      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('status', 'pending_approval')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error

      const pos = (data ?? []) as PurchaseOrder[]

      // Filter to POs where current user has an active pending step in their role
      return pos.filter((po) => {
        const steps = po.po_approvals ?? []
        const maxIteration = Math.max(...steps.map((s: any) => s.iteration ?? 1), 1)
        return steps.some(
          (s: any) =>
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
    queryKey: ['po-approvals', 'completed'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_approvals(*)')
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

      // Four-eyes check: has this user already approved a different role in the same tier+iteration?
      const { data: thisStep, error: stepFetchErr } = await (supabase as any)
        .from('po_approvals').select('tier_rank, iteration, role').eq('id', stepId).single()
      if (stepFetchErr || !thisStep) throw new Error('Approval step not found.')
      const { data: sameUserApprovals } = await (supabase as any)
        .from('po_approvals')
        .select('id')
        .eq('po_id', poId)
        .eq('tier_rank', thisStep.tier_rank)
        .eq('iteration', thisStep.iteration)
        .eq('status', 'approved')
        .eq('approved_by', me.email)
        .neq('id', stepId)
      if ((sameUserApprovals ?? []).length > 0) {
        throw new Error('You have already approved another role in this tier. A second approval from the same person violates the four-eyes requirement.')
      }

      // Approve the step
      const { error: stepErr } = await (supabase as any)
        .from('po_approvals').update({
          status: 'approved',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        }).eq('id', stepId)
      if (stepErr) throw stepErr

      const roleName = ROLE_LABELS[thisStep?.role] ?? thisStep?.role ?? 'Approver'
      const performerName = me.fullName ?? me.email
      await logPOActivity({
        poId,
        action: `Approved: ${roleName}`,
        details: comment || null,
        performerName,
      })

      // Ghost notification cleanup
      await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('related_id', poId)
        .eq('type', 'po_approval_requested')
        .is('read_at', null)

      // Advance state machine (Postgres function handles next tier / PO approval)
      const { error: rpcErr } = await (supabase as any).rpc('advance_po_approval_tier', { p_po_id: poId })
      if (rpcErr) throw rpcErr

      // Check if PO is now fully approved — notify creator (created_by stores auth.users.id)
      const { data: poStatus } = await (supabase as any)
        .from('purchase_orders').select('status, created_by, po_number').eq('id', poId).single()
      if (poStatus?.status === 'approved' && poStatus.created_by) {
        const { data: creatorProfile } = await (supabase as any)
          .from('profiles').select('id').eq('auth_user_id', poStatus.created_by).maybeSingle()
        if (creatorProfile) {
          await (supabase as any).from('notifications').insert({
            profile_id: creatorProfile.id,
            type: 'po_approved',
            title: `PO ${poStatus.po_number} has been fully approved`,
            related_id: poId,
            related_type: 'purchase_order',
          })
        }
        await logPOActivity({ poId, action: 'PO Fully Approved', performerName })
      }
    },
    onSuccess: (_data: unknown, variables: { stepId: string; poId: string; comment: string }) => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
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
      if (!me) throw new Error('Not authenticated')

      const { data: forceStep } = await (supabase as any)
        .from('po_approvals').select('role').eq('id', stepId).single()
      const { error } = await (supabase as any)
        .from('po_approvals').update({
          status: 'approved',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          force_approved: true,
          force_comment: forceComment,
        }).eq('id', stepId)
      if (error) throw error

      const forceRoleName = ROLE_LABELS[forceStep?.role] ?? forceStep?.role ?? 'Approver'
      const forcePerformer = me.fullName ?? me.email
      await logPOActivity({
        poId,
        action: `Force Approved: ${forceRoleName}`,
        details: forceComment,
        performerName: forcePerformer,
        severity: 'critical',
      })

      // Ghost cleanup
      await (supabase as any)
        .from('notifications').update({ read_at: new Date().toISOString() })
        .eq('related_id', poId).eq('type', 'po_approval_requested').is('read_at', null)

      // Advance state machine
      const { error: rpcErr } = await (supabase as any).rpc('advance_po_approval_tier', { p_po_id: poId })
      if (rpcErr) throw rpcErr

      const { data: forcedPoStatus } = await (supabase as any)
        .from('purchase_orders').select('status').eq('id', poId).single()
      if (forcedPoStatus?.status === 'approved') {
        await logPOActivity({ poId, action: 'PO Fully Approved (Force)', performerName: forcePerformer, severity: 'critical' })
      }

    },
    onSuccess: (_data: unknown, variables: { stepId: string; poId: string; forceComment: string }) => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
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

      // Get current iteration
      const { data: steps } = await (supabase as any)
        .from('po_approvals').select('id, iteration').eq('po_id', poId).order('iteration', { ascending: false }).limit(1)
      const currentIteration = steps?.[0]?.iteration ?? 1

      // Reject this step
      const { error: stepErr } = await (supabase as any)
        .from('po_approvals').update({
          status: 'rejected',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        }).eq('id', stepId)
      if (stepErr) throw stepErr

      // Cancel all other active pending steps in this iteration (not dormant future-tier steps)
      await (supabase as any)
        .from('po_approvals').update({ status: 'cancelled' })
        .eq('po_id', poId)
        .eq('iteration', currentIteration)
        .eq('status', 'pending')
        .eq('is_active', true)
        .neq('id', stepId)

      // Ghost notification cleanup
      await (supabase as any)
        .from('notifications').update({ read_at: new Date().toISOString() })
        .eq('related_id', poId).eq('type', 'po_approval_requested').is('read_at', null)

      const newStatus = mode === 'full_rejection' ? 'cancelled' : 'draft'
      const { error: poErr } = await (supabase as any)
        .from('purchase_orders').update({ status: newStatus }).eq('id', poId)
      if (poErr) throw poErr

      const { data: rejectedStep } = await (supabase as any)
        .from('po_approvals').select('role').eq('id', stepId).single()
      const rejectRoleName = ROLE_LABELS[rejectedStep?.role] ?? rejectedStep?.role ?? 'Approver'
      await logPOActivity({
        poId,
        action: mode === 'full_rejection'
          ? `Rejected by ${rejectRoleName} — PO Cancelled`
          : `Rejected by ${rejectRoleName} — Sent Back to Draft`,
        details: comment || null,
        performerName: me.fullName ?? me.email,
        severity: 'warning',
      })

      // Notify PO creator
      const { data: po } = await (supabase as any)
        .from('purchase_orders').select('created_by, po_number').eq('id', poId).single()
      if (po?.created_by) {
        const { data: creatorProfile } = await (supabase as any)
          .from('profiles').select('id').eq('auth_user_id', po.created_by).maybeSingle()
        if (creatorProfile) {
          await (supabase as any).from('notifications').insert({
            profile_id: creatorProfile.id,
            type: 'po_rejected',
            title: `PO ${po.po_number} was rejected by ${me.email}`,
            related_id: poId,
            related_type: 'purchase_order',
          })
        }
      }
    },
    onSuccess: (_data: unknown, variables: { poId: string; stepId: string; comment: string; mode: 'full_rejection' | 'send_back_to_draft' }) => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMyApprovalRoles() {
  return useQuery({
    queryKey: ['my-approval-roles'],
    queryFn: async () => {
      const me = await getMyIdentity()
      if (!me?.profileId) return [] as string[]
      const supabase = createClient()
      const { data } = await (supabase as any)
        .from('approval_role_assignments')
        .select('role')
        .eq('profile_id', me.profileId)
        .is('deleted_at', null)
      return (data ?? []).map((r: { role: string }) => r.role) as string[]
    },
    staleTime: 60 * 1000,
  })
}
