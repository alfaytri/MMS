// src/hooks/usePOApprovals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getNotificationRecipients } from '@/lib/approvalChainResolution'
import type { PurchaseOrder } from './usePurchaseOrders'

async function getMyIdentity() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await (supabase as any)
    .from('profiles').select('id, division_id').eq('auth_user_id', user.id).maybeSingle()
  return { email: user.email ?? '', profileId: profile?.id ?? null, divisionId: profile?.division_id ?? null }
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

      // Get max iteration per PO for filtering
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('status', 'pending_approval')
        .is('deleted_at', null)
        .neq('created_by', me.email)          // self-approval guard
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
        .from('po_approvals').select('tier_rank, iteration').eq('id', stepId).single()
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

      // Check if next tier was activated — fire notifications for it
      const { data: newlyActive } = await (supabase as any)
        .from('po_approvals')
        .select('tier_rank')
        .eq('po_id', poId)
        .eq('is_active', true)
        .eq('status', 'pending')
        .order('tier_rank', { ascending: true })
        .limit(1)
      if (newlyActive?.[0] && newlyActive[0].tier_rank !== thisStep?.tier_rank) {
        // New tier activated — fetch tiers + assignments + fire notifications
        const { data: allSteps } = await (supabase as any)
          .from('po_approvals').select('tier_rank, role, is_active').eq('po_id', poId).eq('iteration', thisStep?.iteration ?? 1)
        const { data: assignments } = await (supabase as any)
          .from('approval_role_assignments').select('*').is('deleted_at', null)
        const activeTierRank = newlyActive[0].tier_rank
        const uniqueTiers = [...new Map((allSteps ?? []).map((s: any) => [s.tier_rank, { rank: s.tier_rank, required_roles: [] as string[], id: '', chain_id: '', min_amount: 0, max_amount: null, deleted_at: null }])).values()]
        ;(allSteps ?? []).forEach((s: any) => { const t = uniqueTiers.find((u: any) => u.rank === s.tier_rank); if (t) (t as any).required_roles.push(s.role) })
        const recipientIds = getNotificationRecipients(activeTierRank, uniqueTiers as any, assignments ?? [], me.profileId ?? '')
        if (recipientIds.length > 0) {
          const { data: po } = await (supabase as any).from('purchase_orders').select('po_number, total_qar').eq('id', poId).single()
          const notifs = recipientIds.map((profileId: string) => ({
            profile_id: profileId,
            type: 'po_approval_requested',
            title: `PO ${po?.po_number ?? poId} requires your approval`,
            body: `Total: ${po?.total_qar} QAR`,
            related_id: poId,
            related_type: 'purchase_order',
          }))
          await (supabase as any).from('notifications').insert(notifs)
        }
      }

      // Check if PO is now fully approved — notify creator
      const { data: poStatus } = await (supabase as any)
        .from('purchase_orders').select('status, created_by, po_number').eq('id', poId).single()
      if (poStatus?.status === 'approved' && poStatus.created_by) {
        const { data: creatorProfile } = await (supabase as any)
          .from('profiles').select('id').eq('email', poStatus.created_by).maybeSingle()
        if (creatorProfile) {
          await (supabase as any).from('notifications').insert({
            profile_id: creatorProfile.id,
            type: 'po_approved',
            title: `PO ${poStatus.po_number} has been fully approved`,
            related_id: poId,
            related_type: 'purchase_order',
          })
        }
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

      const { error } = await (supabase as any)
        .from('po_approvals').update({
          status: 'approved',
          approved_by: me.email,
          date: new Date().toISOString().split('T')[0],
          force_approved: true,
          force_comment: forceComment,
        }).eq('id', stepId)
      if (error) throw error

      // Ghost cleanup
      await (supabase as any)
        .from('notifications').update({ read_at: new Date().toISOString() })
        .eq('related_id', poId).eq('type', 'po_approval_requested').is('read_at', null)

      // Advance state machine
      const { error: rpcErr } = await (supabase as any).rpc('advance_po_approval_tier', { p_po_id: poId })
      if (rpcErr) throw rpcErr

      // Check if next tier was activated — fire notifications
      const { data: forcedStep } = await (supabase as any)
        .from('po_approvals').select('tier_rank, iteration').eq('id', stepId).single()
      const { data: newlyActive } = await (supabase as any)
        .from('po_approvals')
        .select('tier_rank')
        .eq('po_id', poId)
        .eq('is_active', true)
        .eq('status', 'pending')
        .order('tier_rank', { ascending: true })
        .limit(1)
      if (newlyActive?.[0] && newlyActive[0].tier_rank !== forcedStep?.tier_rank) {
        const { data: allSteps } = await (supabase as any)
          .from('po_approvals').select('tier_rank, role, is_active').eq('po_id', poId).eq('iteration', forcedStep?.iteration ?? 1)
        const { data: assignments } = await (supabase as any)
          .from('approval_role_assignments').select('*').is('deleted_at', null)
        const activeTierRank = newlyActive[0].tier_rank
        const uniqueTiers = [...new Map((allSteps ?? []).map((s: any) => [s.tier_rank, { rank: s.tier_rank, required_roles: [] as string[], id: '', chain_id: '', min_amount: 0, max_amount: null, deleted_at: null }])).values()]
        ;(allSteps ?? []).forEach((s: any) => { const t = uniqueTiers.find((u: any) => u.rank === s.tier_rank); if (t) (t as any).required_roles.push(s.role) })
        const recipientIds = getNotificationRecipients(activeTierRank, uniqueTiers as any, assignments ?? [], me.profileId ?? '')
        if (recipientIds.length > 0) {
          const { data: po } = await (supabase as any).from('purchase_orders').select('po_number, total_qar').eq('id', poId).single()
          const notifs = recipientIds.map((profileId: string) => ({
            profile_id: profileId,
            type: 'po_approval_requested',
            title: `PO ${po?.po_number ?? poId} requires your approval`,
            body: `Total: ${po?.total_qar} QAR`,
            related_id: poId,
            related_type: 'purchase_order',
          }))
          await (supabase as any).from('notifications').insert(notifs)
        }
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

      // Notify PO creator
      const { data: po } = await (supabase as any)
        .from('purchase_orders').select('created_by, po_number').eq('id', poId).single()
      if (po?.created_by) {
        const { data: creatorProfile } = await (supabase as any)
          .from('profiles').select('id').eq('email', po.created_by).maybeSingle()
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
