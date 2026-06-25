import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logPOActivity } from '@/lib/poActivityLogger'

export type EditRequestStatus = 'pending' | 'approved' | 'declined' | 'used'

export interface EditRequest {
  id:             string
  po_id:          string
  requested_by:   string
  reason:         string
  status:         EditRequestStatus
  reviewed_by:    string | null
  reviewed_at:    string | null
  review_comment: string | null
  used_at:        string | null
  created_at:     string
  profiles: { id: string; full_name: string | null } | null
}

async function getMyProfileId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

async function getMyFullName(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles').select('full_name').eq('auth_user_id', user.id).maybeSingle()
  return data?.full_name ?? null
}

/**
 * Returns the single OPEN (pending or approved-unused) request for a PO,
 * or null if none exists.
 */
export function usePoEditRequest(poId: string | null) {
  return useQuery({
    queryKey: queryKeys.poEditRequests.byPo(poId),
    queryFn: async (): Promise<EditRequest | null> => {
      if (!poId) return null
      const supabase = createClient()
      const { data, error } = await supabase
        .from('po_edit_requests')
        .select('*, profiles!requested_by(id, full_name)')
        .eq('po_id', poId)
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as unknown as EditRequest | null
    },
    enabled: !!poId,
    staleTime: 15_000,
  })
}

export function useCreateEditRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ poId, reason }: { poId: string; reason: string }) => {
      if (!reason.trim() || reason.trim().length < 10) {
        throw new Error('Reason must be at least 10 characters.')
      }
      const supabase = createClient()
      const myProfileId = await getMyProfileId(supabase)
      if (!myProfileId) throw new Error('Not authenticated')

      const { data: req, error: reqErr } = await supabase
        .from('po_edit_requests')
        .insert({ po_id: poId, requested_by: myProfileId, reason: reason.trim() })
        .select('id')
        .single()
      if (reqErr) throw reqErr

      // Fan out a notification to every user holding an approval-slot role
      const { data: approvers } = await supabase
        .from('user_custom_roles')
        .select('profile_id, custom_roles!inner(is_approval_slot, deleted_at)')
        .eq('custom_roles.is_approval_slot', true)
        .is('custom_roles.deleted_at', null)
      const approverIds = Array.from(new Set(
        (approvers ?? []).map((r: { profile_id: string }) => r.profile_id),
      ))

      const { data: po } = await supabase
        .from('purchase_orders').select('po_number').eq('id', poId).maybeSingle()
      const poLabel = po?.po_number ?? poId

      if (approverIds.length > 0) {
        await supabase.from('notifications').insert(
          approverIds.map((profileId) => ({
            profile_id: profileId,
            type: 'po_edit_request_pending',
            title: `Edit request for PO ${poLabel}`,
            body: reason.trim().slice(0, 200),
            related_id: poId,
            related_type: 'purchase_order',
          })),
        )
      }

      const performerName = await getMyFullName(supabase)
      await logPOActivity({
        poId,
        action: `Edit Requested${performerName ? ` by ${performerName}` : ''}`,
        details: reason.trim(),
        performerName,
        severity: 'info',
      })

      return req.id as string
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.poEditRequests.byPo(vars.poId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export function useReviewEditRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      requestId,
      decision,
      comment,
    }: {
      requestId: string
      decision: 'approved' | 'declined'
      comment?: string
    }) => {
      const supabase = createClient()
      const myProfileId = await getMyProfileId(supabase)
      if (!myProfileId) throw new Error('Not authenticated')

      const { data: req, error: fetchErr } = await supabase
        .from('po_edit_requests')
        .select('id, po_id, requested_by')
        .eq('id', requestId)
        .single()
      if (fetchErr) throw fetchErr

      // Supersede: if approving, decline any other approved-unused request
      // on the same PO first so the unique index doesn't fire.
      if (decision === 'approved') {
        await supabase
          .from('po_edit_requests')
          .update({
            status: 'declined',
            reviewed_by: myProfileId,
            reviewed_at: new Date().toISOString(),
            review_comment: 'Superseded by a newer approved request',
          })
          .eq('po_id', req.po_id)
          .eq('status', 'approved')
      }

      const { error: updErr } = await supabase
        .from('po_edit_requests')
        .update({
          status: decision,
          reviewed_by: myProfileId,
          reviewed_at: new Date().toISOString(),
          review_comment: comment?.trim() || null,
        })
        .eq('id', requestId)
      if (updErr) throw updErr

      const { data: po } = await supabase
        .from('purchase_orders').select('po_number').eq('id', req.po_id).maybeSingle()
      const poLabel = po?.po_number ?? req.po_id

      await supabase.from('notifications').insert({
        profile_id: req.requested_by,
        type: decision === 'approved' ? 'po_edit_request_approved' : 'po_edit_request_declined',
        title: `Your edit request for PO ${poLabel} was ${decision}`,
        body: comment?.trim() || null,
        related_id: req.po_id,
        related_type: 'purchase_order',
      })

      const reviewerName = await getMyFullName(supabase)
      await logPOActivity({
        poId: req.po_id,
        action: `Edit Request ${decision === 'approved' ? 'Approved' : 'Declined'}${reviewerName ? ` by ${reviewerName}` : ''}`,
        details: comment?.trim() || undefined,
        performerName: reviewerName,
        severity: decision === 'approved' ? 'info' : 'warning',
      })

      return { poId: req.po_id }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.poEditRequests.byPo(data.poId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

/**
 * Best-effort: flip the open approved-unused request for `poId` to 'used'.
 * Failure is non-blocking — the amend itself has already succeeded.
 */
export function useMarkEditRequestUsed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ poId }: { poId: string }) => {
      const supabase = createClient()
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('po_edit_requests')
        .update({ status: 'used', used_at: now })
        .eq('po_id', poId)
        .eq('status', 'approved')
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.poEditRequests.byPo(vars.poId) })
    },
  })
}
