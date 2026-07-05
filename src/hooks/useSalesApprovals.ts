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

/**
 * `sale_order_approvals.source_id` has no FK to `sale_orders.id` (the column is
 * polymorphic — it can also point at other source types in the future), so
 * PostgREST embed syntax (`sale_orders:source_id(...)`) breaks with a 400.
 * Instead, fetch the requests and the SOs in two queries and stitch in JS.
 */
type SoLookup = {
  id: string
  so_number: string
  total: number
  customer_id: string
  status: string
  customer_name: string
}

async function fetchSoLookup(soIds: string[]): Promise<Map<string, SoLookup>> {
  const map = new Map<string, SoLookup>()
  if (soIds.length === 0) return map
  const supabase = createClient()
  const { data, error } = await supabase
    .from('sale_orders')
    .select('id, so_number, total, customer_id, status, customers(name)')
    .in('id', soIds)
  if (error) throw error
  for (const row of data ?? []) {
    const r = row as unknown as {
      id: string
      so_number: string
      total: number
      customer_id: string
      status: string
      customers?: { name: string } | null
    }
    map.set(r.id, {
      id:            r.id,
      so_number:     r.so_number,
      total:         r.total,
      customer_id:   r.customer_id,
      status:        r.status,
      customer_name: r.customers?.name ?? '—',
    })
  }
  return map
}

function slipsFromRows(
  rows: SalesApprovalRow[],
  soLookup: Map<string, SoLookup>,
): SalesApprovalSlip[] {
  const slipMap = new Map<string, SalesApprovalSlip>()
  for (const r of rows) {
    const so = soLookup.get(r.source_id)
    if (!so) continue
    const key = `${r.source_id}|${r.approval_type}|${r.iteration}`
    if (!slipMap.has(key)) {
      slipMap.set(key, {
        source_id: r.source_id,
        approval_type: r.approval_type,
        iteration: r.iteration,
        rows: [],
        so: {
          id: so.id, so_number: so.so_number, total: so.total,
          customer_name: so.customer_name,
          customer_id: so.customer_id, status: so.status,
        },
      })
    }
    slipMap.get(key)!.rows.push(r)
  }
  return Array.from(slipMap.values())
}

export function usePendingSalesApprovals() {
  return useQuery({
    queryKey: queryKeys.approvals.salesPending,
    queryFn: async () => {
      const me = await getMyApprovalContext()
      if (!me) return [] as SalesApprovalSlip[]

      const isOwner   = me.roleNames.includes('Owner')
      const hasMargin = me.scopes.includes('sales_margin')
      const hasCredit = me.scopes.includes('sales_credit')

      // Non-owner with no relevant scope → empty queue.
      // Owners see every pending slip (so they can force-approve any chain),
      // mirroring usePendingApprovals for purchase orders.
      if (!isOwner && !hasMargin && !hasCredit) return [] as SalesApprovalSlip[]

      const supabase = createClient()
      const { data, error } = await supabase
        .from('sale_order_approvals')
        .select('*')
        .eq('source_type', 'sale_order')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      const rows = (data ?? []) as unknown as SalesApprovalRow[]
      // Owners see every chain. Others see only chains matching their scopes.
      const allowed = isOwner
        ? rows
        : rows.filter(
            (r) =>
              (r.approval_type === 'margin' && hasMargin) ||
              (r.approval_type === 'credit' && hasCredit),
          )
      const soIds = Array.from(new Set(allowed.map((r) => r.source_id)))
      const soLookup = await fetchSoLookup(soIds)

      const slips = slipsFromRows(allowed, soLookup)
      if (isOwner) return slips

      // Non-owners only see slips where one of their roles is still pending
      const myRoles = new Set(me.roleNames)
      return slips.filter((slip) =>
        slip.rows.some(
          (row) =>
            row.status === 'pending' && row.step_role && myRoles.has(row.step_role),
        ),
      )
    },
    staleTime: 30 * 1000,
  })
}

/**
 * Recently-completed sales approval slips (latest iteration, all rows either
 * approved or rejected — no longer pending). Used for the "Completed Approvals"
 * table on the Sales Approvals page; mirrors the PO equivalent.
 */
export function useCompletedSalesApprovals() {
  return useQuery({
    queryKey: queryKeys.approvals.salesCompleted,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('sale_order_approvals')
        .select('*')
        .eq('source_type', 'sale_order')
        .neq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error

      const rows = (data ?? []) as unknown as SalesApprovalRow[]
      const soIds = Array.from(new Set(rows.map((r) => r.source_id)))
      const soLookup = await fetchSoLookup(soIds)

      const slips = slipsFromRows(rows, soLookup)
        .filter((slip) => slip.rows.every((row) => row.status !== 'pending'))

      // Dedupe to keep only the latest iteration per (SO, type)
      const latestPerPair = new Map<string, SalesApprovalSlip>()
      for (const slip of slips) {
        const pair = `${slip.source_id}|${slip.approval_type}`
        const existing = latestPerPair.get(pair)
        if (!existing || slip.iteration > existing.iteration) {
          latestPerPair.set(pair, slip)
        }
      }
      return Array.from(latestPerPair.values()).sort((a, b) => {
        const da = Math.max(...a.rows.map((r) => Date.parse(r.decided_at ?? r.created_at) || 0))
        const db = Math.max(...b.rows.map((r) => Date.parse(r.decided_at ?? r.created_at) || 0))
        return db - da
      })
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
        .from('sale_order_approvals')
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
        .from('sale_order_approvals')
        .select('source_id, approval_type, step_role')
        .eq('id', id)
        .maybeSingle()
      if (req) {
        void logActivity({
          action:      'Sales Approval Approved',
          module:      'sale_orders',
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
        .from('sale_order_approvals')
        .select('source_id, approval_type, step_role')
        .eq('id', id)
        .maybeSingle()
      if (req) {
        void logActivity({
          action:      'Sales Approval Rejected',
          module:      'sale_orders',
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

/**
 * Owner-only bulk approval: clears every pending step on the latest iteration
 * of a (SO, chain) slip in one call. Backed by the
 * `force_approve_sales_request` RPC which enforces the Owner gate inside the
 * database, marks each row as `force_approved=true`, and advances the chain.
 * Mirrors PO's `useForceApproveAllSteps`.
 */
export function useForceApproveSalesRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      soId,
      approvalType,
      comment,
    }: {
      soId:         string
      approvalType: 'margin' | 'credit'
      comment?:     string
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('force_approve_sales_request', {
        p_so_id:         soId,
        p_approval_type: approvalType,
        p_comment:       comment?.trim() || undefined,
      })
      if (error) throw error

      const { data: so } = await supabase
        .from('sale_orders')
        .select('id, so_number, status, created_by')
        .eq('id', soId)
        .maybeSingle()
      void logActivity({
        action:      `Sales Approval Force-Approved (${approvalType})`,
        module:      'sales',
        entity_id:   soId,
        entity_type: 'sale_order',
        details:     JSON.stringify({ type: approvalType, count: data, comment: comment ?? null }),
        severity:    'critical',
      })
      if (so?.status === 'confirmed' && so.created_by) {
        await supabase.from('notifications').insert({
          profile_id:   so.created_by,
          type:         'so_approved',
          title:        `SO ${so.so_number} force-approved`,
          related_id:   so.id,
          related_type: 'sale_order',
        })
      }
      return Number(data ?? 0)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.approvals.sales })
      qc.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
    },
  })
}

/** True when the current user holds the Owner approval slot. */
export function useIsOwner() {
  return useQuery({
    queryKey: ['is-owner-approval-slot'],
    queryFn: async () => {
      const me = await getMyApprovalContext()
      if (!me) return false
      return me.roleNames.includes('Owner')
    },
    staleTime: 60 * 1000,
  })
}

/**
 * Returns the array of approval-slot role names the current user holds
 * (e.g. ['Purchase Manager', 'Owner']). Used by the slip detail dialog to
 * pick the row matching the caller in a parallel chain.
 */
export function useMyApprovalRoleNames() {
  return useQuery({
    queryKey: ['my-approval-role-names'],
    queryFn: async () => {
      const me = await getMyApprovalContext()
      return me?.roleNames ?? []
    },
    staleTime: 60 * 1000,
  })
}
