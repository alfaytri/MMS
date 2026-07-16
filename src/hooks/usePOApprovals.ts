// src/hooks/usePOApprovals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PurchaseOrder } from './usePurchaseOrders'
import { logPOActivity, ROLE_LABELS } from '@/lib/poActivityLogger'
import { queryKeys } from '@/lib/queryKeys'

async function getMyIdentity() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
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

      // Four-eyes check: has this user already approved a different role in the same tier+iteration?
      const { data: thisStep, error: stepFetchErr } = await supabase
        .from('po_approvals').select('tier_rank, iteration, role').eq('id', stepId).single()
      if (stepFetchErr || !thisStep) throw new Error('Approval step not found.')
      const { data: sameUserApprovals } = await supabase
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
      const { error: stepErr } = await supabase
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
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('related_id', poId)
        .eq('type', 'po_approval_requested')
        .is('read_at', null)

      // Advance state machine (Postgres function handles next tier / PO approval)
      const { error: rpcErr } = await supabase.rpc('advance_po_approval_tier', { p_po_id: poId })
      if (rpcErr) throw rpcErr

      // Check if PO is now fully approved — notify creator (created_by stores profiles.id)
      const { data: poStatus } = await supabase
        .from('purchase_orders').select('status, created_by, po_number').eq('id', poId).single()
      if (poStatus?.status === 'approved' && poStatus.created_by) {
        await supabase.from('notifications').insert({
          profile_id: poStatus.created_by,
          type: 'po_approved',
          title: `PO ${poStatus.po_number} has been fully approved`,
          related_id: poId,
          related_type: 'purchase_order',
        })
        await logPOActivity({ poId, action: 'PO Fully Approved', performerName })
      }
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

      // Source: user_custom_roles joined to custom_roles where name = 'Owner' and is_approval_slot = true.
      const { data: roleRows } = await supabase
        .from('user_custom_roles')
        .select('custom_roles!inner(name, is_approval_slot, deleted_at)')
        .eq('profile_id', me.profileId)
        .eq('custom_roles.name', 'Owner')
        .eq('custom_roles.is_approval_slot', true)
        .is('custom_roles.deleted_at', null)
        .limit(1)
      if (!roleRows?.length) throw new Error('Only users with the Owner role can force-approve.')

      const { data: forceStep } = await supabase
        .from('po_approvals').select('role').eq('id', stepId).single()
      const { error } = await supabase
        .from('po_approvals').update({
          status: 'approved',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          force_approved: true,
          force_comment: forceComment,
        }).eq('id', stepId)
      if (error) throw error

      const forceRoleName = ROLE_LABELS[forceStep?.role ?? ''] ?? forceStep?.role ?? 'Approver'
      const forcePerformer = me.fullName ?? me.email
      await logPOActivity({
        poId,
        action: `Force Approved: ${forceRoleName}`,
        details: forceComment,
        performerName: forcePerformer,
        severity: 'critical',
      })

      // Ghost cleanup
      await supabase
        .from('notifications').update({ read_at: new Date().toISOString() })
        .eq('related_id', poId).eq('type', 'po_approval_requested').is('read_at', null)

      // Advance state machine
      const { error: rpcErr } = await supabase.rpc('advance_po_approval_tier', { p_po_id: poId })
      if (rpcErr) throw rpcErr

      const { data: forcedPoStatus } = await supabase
        .from('purchase_orders').select('status').eq('id', poId).single()
      if (forcedPoStatus?.status === 'approved') {
        await logPOActivity({ poId, action: 'PO Fully Approved (Force)', performerName: forcePerformer, severity: 'critical' })
      }

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

/**
 * Force-approve EVERY remaining active+pending step on a PO in the current
 * iteration in a single click. Owner-only. Records one combined audit entry
 * listing every role that was force-approved.
 *
 * This is the "approve all" version of useForceApproveStep — instead of going
 * PM, then AC, then OW one-by-one, the owner can clear the whole chain at once.
 */
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

      // Owner role check — read from user_custom_roles + custom_roles (name = 'Owner').
      const { data: roleRows } = await supabase
        .from('user_custom_roles')
        .select('custom_roles!inner(name, is_approval_slot, deleted_at)')
        .eq('profile_id', me.profileId)
        .eq('custom_roles.name', 'Owner')
        .eq('custom_roles.is_approval_slot', true)
        .is('custom_roles.deleted_at', null)
        .limit(1)
      if (!roleRows?.length) throw new Error('Only users with the Owner role can force-approve.')

      // Find the current iteration and every still-pending active step in it
      const { data: allSteps, error: stepsErr } = await supabase
        .from('po_approvals')
        .select('id, role, iteration, is_active, status')
        .eq('po_id', poId)
      if (stepsErr) throw stepsErr
      if (!allSteps || allSteps.length === 0) throw new Error('No approval steps found for this PO.')

      const maxIteration = Math.max(
        ...allSteps.map((s: { iteration: number | null }) => s.iteration ?? 1),
        1,
      )
      const pendingSteps = (allSteps as Array<{ id: string; role: string; iteration: number | null; is_active: boolean; status: string }>)
        .filter((s) => s.status === 'pending' && s.is_active === true && (s.iteration ?? 1) === maxIteration)
      if (pendingSteps.length === 0) throw new Error('No pending steps to force-approve.')

      const today = new Date().toISOString().split('T')[0]
      const ids = pendingSteps.map((s) => s.id)

      // Bulk-approve every pending step at once
      const { error: updateErr } = await supabase
        .from('po_approvals')
        .update({
          status: 'approved',
          approved_by: me.email,
          date: today,
          force_approved: true,
          force_comment: forceComment?.trim() ? forceComment : null,
        })
        .in('id', ids)
      if (updateErr) throw updateErr

      // One activity entry per role so a reader can tell at a glance which
      // roles were bypassed. The `Force Approved:` prefix distinguishes these
      // from normal `Approved:` entries written by useApproveStep.
      const performerName = me.fullName ?? me.email
      for (const step of pendingSteps) {
        const roleLabel = ROLE_LABELS[step.role] ?? step.role
        await logPOActivity({
          poId,
          action: `Force Approved: ${roleLabel}`,
          details: forceComment?.trim() || undefined,
          performerName,
          severity: 'critical',
        })
      }

      // Ghost cleanup
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('related_id', poId)
        .eq('type', 'po_approval_requested')
        .is('read_at', null)

      // Advance the state machine — Postgres function will see that every step
      // in the current tier(s) is now approved and promote PO to "approved".
      const { error: rpcErr } = await supabase.rpc('advance_po_approval_tier', { p_po_id: poId })
      if (rpcErr) throw rpcErr

      const { data: poStatus } = await supabase
        .from('purchase_orders').select('status').eq('id', poId).single()
      if (poStatus?.status === 'approved') {
        await logPOActivity({
          poId,
          action: 'PO Fully Approved (Force)',
          performerName,
          severity: 'critical',
        })
      }

      return { approvedCount: pendingSteps.length }
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

      // Get current iteration
      const { data: steps } = await supabase
        .from('po_approvals').select('id, iteration').eq('po_id', poId).order('iteration', { ascending: false }).limit(1)
      const currentIteration = steps?.[0]?.iteration ?? 1

      // Reject this step
      const { error: stepErr } = await supabase
        .from('po_approvals').update({
          status: 'rejected',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        }).eq('id', stepId)
      if (stepErr) throw stepErr

      // Cancel all other active pending steps in this iteration (not dormant future-tier steps)
      await supabase
        .from('po_approvals').update({ status: 'cancelled' as unknown as 'pending' | 'approved' | 'rejected' })
        .eq('po_id', poId)
        .eq('iteration', currentIteration)
        .eq('status', 'pending')
        .eq('is_active', true)
        .neq('id', stepId)

      // Ghost notification cleanup
      await supabase
        .from('notifications').update({ read_at: new Date().toISOString() })
        .eq('related_id', poId).eq('type', 'po_approval_requested').is('read_at', null)

      const newStatus = mode === 'full_rejection' ? 'cancelled' : 'draft'
      const { error: poErr } = await supabase
        .from('purchase_orders').update({ status: newStatus }).eq('id', poId)
      if (poErr) throw poErr

      const { data: rejectedStep } = await supabase
        .from('po_approvals').select('role').eq('id', stepId).single()
      const rejectRoleName = ROLE_LABELS[rejectedStep?.role ?? ''] ?? rejectedStep?.role ?? 'Approver'
      await logPOActivity({
        poId,
        action: mode === 'full_rejection'
          ? `Rejected by ${rejectRoleName} — PO Cancelled`
          : `Rejected by ${rejectRoleName} — Sent Back to Draft`,
        details: comment || null,
        performerName: me.fullName ?? me.email,
        severity: 'warning',
      })

      // Notify PO creator (created_by stores profiles.id)
      const { data: po } = await supabase
        .from('purchase_orders').select('created_by, po_number').eq('id', poId).single()
      if (po?.created_by) {
        await supabase.from('notifications').insert({
          profile_id: po.created_by,
          type: 'po_rejected',
          title: `PO ${po.po_number} was rejected by ${me.email}`,
          related_id: poId,
          related_type: 'purchase_order',
        })
      }
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
