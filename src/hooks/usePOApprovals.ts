import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PurchaseOrder } from './usePurchaseOrders'

export function usePendingApprovals() {
  return useQuery({
    queryKey: ['po-approvals', 'pending'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('purchase_orders')
        .select('*, po_line_items(*), po_approvals(*)')
        .eq('status', 'pending_approval')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as PurchaseOrder[]
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
        .select('*, po_line_items(*), po_approvals(*)')
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
      allStepsWillBeApproved,
    }: {
      stepId: string
      poId: string
      comment: string
      allStepsWillBeApproved: boolean
    }) => {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      const actorName = user?.email ?? user?.id ?? 'Unknown'

      // Approve this step
      const { error: stepErr } = await (supabase as any)
        .from('po_approvals')
        .update({
          status: 'approved',
          approved_by: actorName,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        })
        .eq('id', stepId)
      if (stepErr) throw stepErr

      // If all steps are approved, update PO to approved
      if (allStepsWillBeApproved) {
        const { error: poErr } = await (supabase as any)
          .from('purchase_orders')
          .update({ status: 'approved' })
          .eq('id', poId)
        if (poErr) throw poErr
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
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
      mode: 'full_rejection' | 'send_back_to_rfq'
    }) => {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      const actorName = user?.email ?? user?.id ?? 'Unknown'

      // Reject this step
      const { error: stepErr } = await (supabase as any)
        .from('po_approvals')
        .update({
          status: 'rejected',
          approved_by: actorName,
          date: new Date().toISOString().split('T')[0],
          comment: comment || null,
        })
        .eq('id', stepId)
      if (stepErr) throw stepErr

      const newStatus = mode === 'full_rejection' ? 'cancelled' : 'draft'

      const { error: poErr } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: newStatus })
        .eq('id', poId)
      if (poErr) throw poErr

      // If send back to RFQ, delete all approval steps so they can be recreated
      if (mode === 'send_back_to_rfq') {
        const { error: delErr } = await (supabase as any)
          .from('po_approvals')
          .delete()
          .eq('po_id', poId)
        if (delErr) throw delErr
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-approvals'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.poId] })
    },
  })
}
