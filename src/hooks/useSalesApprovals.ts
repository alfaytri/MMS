'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

export type SalesApprovalRow = {
  id:              string
  source_id:       string          // sale_order id
  approval_type:   'margin' | 'credit'
  status:          'pending' | 'approved' | 'rejected'
  step_role:       string | null
  step_order:      number
  is_active:       boolean
  iteration:       number
  requested_by:    string | null
  decided_by:      string | null
  decided_by_name: string | null
  reason:          string | null    // JSON payload (parsed by callers)
  comment:         string | null
  created_at:      string
  decided_at:      string | null
}

export type SalesApprovalSlip = {
  source_id:     string
  approval_type: 'margin' | 'credit'
  iteration:     number
  rows:          SalesApprovalRow[]
  so:           {
    id:            string
    so_number:     string
    total:         number
    customer_name: string
    customer_id:   string
    status:        string
  }
}

/** My caller's profile id + role names (used for queue filtering) */
async function getMyApprovalContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!profile) return null

  const { data: roleRows } = await supabase
    .from('user_custom_roles')
    .select('approval_scopes, custom_roles!inner(name, is_approval_slot, deleted_at)')
    .eq('profile_id', profile.id)
    .eq('custom_roles.is_approval_slot', true)
    .is('custom_roles.deleted_at', null)
    .limit(100)

  type Row = {
    approval_scopes: string[] | null
    custom_roles: { name: string } | null
  }
  const rows = (roleRows ?? []) as unknown as Row[]
  return {
    profileId: profile.id,
    roleNames: rows.map((r) => r.custom_roles?.name).filter((n): n is string => !!n),
    scopes:    Array.from(new Set(rows.flatMap((r) => r.approval_scopes ?? []))),
  }
}

export function usePendingSalesApprovals() {
  return useQuery({
    queryKey: queryKeys.approvals.salesPending,
    queryFn: async () => {
      const me = await getMyApprovalContext()
      if (!me) return [] as SalesApprovalSlip[]
      // No relevant scope? empty queue.
      const hasMargin = me.scopes.includes('sales_margin')
      const hasCredit = me.scopes.includes('sales_credit')
      if (!hasMargin && !hasCredit) return [] as SalesApprovalSlip[]

      const supabase = createClient()
      const { data, error } = await supabase
        .from('approval_requests')
        .select('*, sale_orders:source_id(id, so_number, total, customer_id, status, customers(name))')
        .eq('source_type', 'sale_order')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      // Group rows into slips keyed by (so_id, type, iteration)
      const slipMap = new Map<string, SalesApprovalSlip>()
      for (const row of data ?? []) {
        const r = row as unknown as SalesApprovalRow & {
          sale_orders?: {
            id: string
            so_number: string
            total: number
            customer_id: string
            status: string
            customers?: { name: string } | null
          } | null
        }
        const so = r.sale_orders
        if (!so) continue
        const allowedType =
          (r.approval_type === 'margin' && hasMargin) ||
          (r.approval_type === 'credit' && hasCredit)
        if (!allowedType) continue
        // Group rows by (so_id, type, iteration)
        const key = `${r.source_id}|${r.approval_type}|${r.iteration}`
        if (!slipMap.has(key)) {
          slipMap.set(key, {
            source_id: r.source_id,
            approval_type: r.approval_type,
            iteration: r.iteration,
            rows: [],
            so: {
              id: so.id, so_number: so.so_number, total: so.total,
              customer_name: so.customers?.name ?? '—',
              customer_id: so.customer_id, status: so.status,
            },
          })
        }
        slipMap.get(key)!.rows.push(r)
      }

      // Only return slips where the current step is for a role this caller actually holds
      const myRoles = new Set(me.roleNames)
      return Array.from(slipMap.values()).filter((slip) =>
        slip.rows.some(
          (row) =>
            row.is_active && row.status === 'pending' && row.step_role && myRoles.has(row.step_role),
        ),
      )
    },
    staleTime: 30 * 1000,
  })
}

export type SoApprovalRow = {
  id:              string
  approval_type:   'margin' | 'credit'
  status:          string
  step_role:       string | null
  step_order:      number
  is_active:       boolean
  iteration:       number
  decided_by_name: string | null
  created_at:      string
}

export function useSoApprovalRows(soId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.approvals.salesBySo(soId ?? null),
    enabled: !!soId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('approval_requests')
        .select('id, approval_type, status, step_role, step_order, is_active, iteration, decided_by_name, created_at')
        .eq('source_type', 'sale_order')
        .eq('source_id', soId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as unknown as SoApprovalRow[]
    },
    staleTime: 30 * 1000,
  })
}

export function useApproveSalesRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('approve_sales_request', {
        p_request_id: id, p_comment: comment,
      })
      if (error) throw error

      const { data: req } = await supabase
        .from('approval_requests')
        .select('source_id, approval_type, step_role')
        .eq('id', id)
        .maybeSingle()
      if (req) {
        void logActivity({
          action:      'Sales Approval Approved',
          module:      'sales',
          entity_id:   req.source_id,
          entity_type: 'sale_order',
          details:     JSON.stringify({ type: req.approval_type, step_role: req.step_role, comment }),
        })
        const { data: so } = await supabase
          .from('sale_orders')
          .select('id, so_number, status, created_by')
          .eq('id', req.source_id)
          .maybeSingle()
        if (so?.status === 'confirmed' && so.created_by) {
          await supabase.from('notifications').insert({
            profile_id:   so.created_by,
            type:         'so_approved',
            title:        `SO ${so.so_number} fully approved`,
            related_id:   so.id,
            related_type: 'sale_order',
          })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.approvals.sales })
      qc.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
    },
  })
}

export function useRejectSalesRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('reject_sales_request', {
        p_request_id: id, p_reason: reason,
      })
      if (error) throw error

      const { data: req } = await supabase
        .from('approval_requests')
        .select('source_id, approval_type, step_role')
        .eq('id', id)
        .maybeSingle()
      if (req) {
        void logActivity({
          action:      'Sales Approval Rejected',
          module:      'sales',
          entity_id:   req.source_id,
          entity_type: 'sale_order',
          details:     JSON.stringify({ type: req.approval_type, step_role: req.step_role, reason }),
          severity:    'warning',
        })
        const { data: so } = await supabase
          .from('sale_orders')
          .select('id, so_number, created_by')
          .eq('id', req.source_id)
          .maybeSingle()
        if (so?.created_by) {
          await supabase.from('notifications').insert({
            profile_id:   so.created_by,
            type:         'so_rejected',
            title:        `SO ${so.so_number} approval rejected — please review`,
            related_id:   so.id,
            related_type: 'sale_order',
          })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.approvals.sales })
      qc.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
    },
  })
}
