// src/hooks/useReceivals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logPOActivity } from '@/lib/poActivityLogger'

export type ReceivalStatus = 'pending_approval' | 'approved' | 'rejected'

export type ReceivalItem = {
  id: string
  receival_id: string
  po_line_item_id: string | null
  item_name: string
  sku: string | null
  qty_received: number
  unit_cost: number
  is_free: boolean | null
  brand_variant_id: string | null
  // UI-computed: ordered qty comes from po_line_items join
  ordered_qty?: number
}

export type Receival = {
  id: string
  receival_number: string
  po_id: string
  warehouse_id: string
  date: string
  status: ReceivalStatus | null
  notes: string | null
  received_by_name: string | null
  created_at: string | null
  receival_items?: ReceivalItem[]
  // joined
  po_number?: string
  supplier_name?: string
}

export type ReceivalEditRequest = {
  id: string
  receival_id: string
  requested_by: string
  reason: string
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'expired'
  approved_by: string | null
  rejection_note: string | null
  expires_at: string | null
  created_at: string
  approved_at: string | null
}

export type CreateReceivalPayload = {
  po_id: string
  warehouse_id: string
  date: string
  notes: string
  items: {
    po_line_item_id: string | null
    brand_variant_id: string | null
    item_name: string
    sku: string | null
    qty_received: number
    unit_cost: number
    is_free?: boolean
  }[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useReceivals(filters?: { status?: ReceivalStatus | '' }) {
  return useQuery({
    queryKey: ['receivals', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('receivals')
        .select(`
          id,receival_number,po_id,warehouse_id,date,status,notes,received_by_name,created_at,
          receival_items(id,receival_id,po_line_item_id,item_name,sku,qty_received,unit_cost,is_free,brand_variant_id),
          purchase_orders!receivals_po_id_fkey(po_number,supplier_name)
        `)
        .order('created_at', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        ...r,
        po_number: r.purchase_orders?.po_number ?? null,
        supplier_name: r.purchase_orders?.supplier_name ?? null,
      })) as Receival[]
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  })
}

export function useReceival(id: string | null) {
  return useQuery({
    queryKey: ['receival', id],
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select(`
          id,receival_number,po_id,warehouse_id,date,status,notes,received_by_name,created_at,
          receival_items(id,receival_id,po_line_item_id,item_name,sku,qty_received,unit_cost,is_free,brand_variant_id),
          purchase_orders!receivals_po_id_fkey(po_number,supplier_name,po_line_items(id,qty))
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      // Attach ordered_qty from PO line items
      const poLines: any[] = data.purchase_orders?.po_line_items ?? []
      const items = (data.receival_items ?? []).map((ri: any) => {
        const matched = poLines.find((pl: any) => pl.id === ri.po_line_item_id)
        return { ...ri, ordered_qty: matched?.qty ?? null }
      })
      return { ...data, receival_items: items } as Receival
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateReceivalPayload) => {
      const supabase = createClient()

      // Resolve user display name and count in parallel (count has no user dependency)
      const [{ data: { user } }, { count }] = await Promise.all([
        supabase.auth.getUser(),
        (supabase as any).from('receivals').select('*', { count: 'exact', head: true }),
      ])
      let receivedByName: string | null = null
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles').select('full_name').eq('auth_user_id', user.id).maybeSingle()
        receivedByName = profile?.full_name ?? user.email ?? null
      }
      const receival_number = `RCV-${String((count ?? 0) + 1).padStart(5, '0')}`

      // Single atomic RPC — insert + FIFO + stock_level all in one transaction
      const { data, error } = await (supabase as any).rpc('create_and_approve_receival', {
        p_po_id:            payload.po_id,
        p_warehouse_id:     payload.warehouse_id,
        p_date:             payload.date,
        p_received_by_name: receivedByName,
        p_receival_number:  receival_number,
        p_notes:            payload.notes || null,
        p_items:            payload.items.map(it => ({
          po_line_item_id:  it.po_line_item_id,
          brand_variant_id: it.brand_variant_id,
          item_name:        it.item_name,
          sku:              it.sku,
          qty_received:     it.qty_received,
          unit_cost:        it.unit_cost,
          is_free:          it.is_free ?? false,
        })),
      })
      if (error) throw error

      const regularCount = payload.items.filter(i => !i.is_free).length
      const freeCount    = payload.items.filter(i => i.is_free).length
      await logPOActivity({
        poId: payload.po_id,
        action: 'Receival Recorded',
        details: [
          receival_number,
          regularCount > 0 ? `${regularCount} item(s) received` : null,
          freeCount > 0 ? `${freeCount} free item(s)` : null,
          payload.notes ? `Note: ${payload.notes}` : null,
        ].filter(Boolean).join(' · '),
        performerName: receivedByName,
      })

      return data as { receival_id: string; receival_number: string }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receivals'] })
      queryClient.invalidateQueries({ queryKey: ['po-receivals', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['brand-variants-v2'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers'] })
    },
  })
}

// ─── Edit Request Hooks ───────────────────────────────────────────────────────

export function useReceivalEditRequests(receival_id: string | null) {
  return useQuery({
    queryKey: ['receival_edit_requests', receival_id],
    enabled: !!receival_id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receival_edit_requests')
        .select('*')
        .eq('receival_id', receival_id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ReceivalEditRequest[]
    },
  })
}

export function useRequestReceivalEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ receival_id, reason }: { receival_id: string; reason: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user?.id).maybeSingle()
      if (!profile?.id) throw new Error('Profile not found')

      const { data, error } = await (supabase as any)
        .from('receival_edit_requests')
        .insert({ receival_id, requested_by: profile.id, reason, status: 'pending' })
        .select().single()
      if (error) throw error

      // Notify all admin profiles
      const { data: admins } = await (supabase as any)
        .from('profiles').select('id').eq('role', 'admin')
      const notifications = (admins ?? []).map((a: any) => ({
        user_id: a.id,
        title: 'Receival Edit Requested',
        body: `A receival edit was requested: ${reason}`,
        type: 'receival_edit_request',
        reference_id: data.id,
      }))
      if (notifications.length > 0) {
        await (supabase as any).from('notifications').insert(notifications)
      }

      return data as ReceivalEditRequest
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['receival_edit_requests', variables.receival_id] })
    },
  })
}

export function useApproveReceivalEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      request_id, action, rejection_note,
    }: { request_id: string; action: 'approved' | 'rejected'; rejection_note?: string }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user?.id).maybeSingle()

      const patch: Record<string, unknown> = {
        status: action,
        approved_by: profile?.id ?? null,
      }
      if (action === 'approved') {
        patch.approved_at = new Date().toISOString()
        // 48-hour edit window
        patch.expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      }
      if (action === 'rejected' && rejection_note) {
        patch.rejection_note = rejection_note
      }

      const { data, error } = await (supabase as any)
        .from('receival_edit_requests')
        .update(patch)
        .eq('id', request_id)
        .select('*, receival_id, requested_by').single()
      if (error) throw error

      // Notify the requestor (requested_by comes from the update select above)
      if (data?.requested_by) {
        await (supabase as any).from('notifications').insert({
          user_id: data.requested_by,
          title: action === 'approved' ? 'Edit Request Approved' : 'Edit Request Rejected',
          body: action === 'approved'
            ? 'Your receival edit was approved. You have 48 hours to save your changes.'
            : `Your receival edit was rejected. ${rejection_note ?? ''}`,
          type: 'receival_edit_response',
          reference_id: request_id,
        })
      }

      return data as ReceivalEditRequest
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['receival_edit_requests', data.receival_id] })
      qc.invalidateQueries({ queryKey: ['receivals'] })
    },
  })
}

export function useSaveReceivalEdit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      edit_request_id,
      items,
    }: {
      edit_request_id: string
      items: { receival_item_id: string; new_qty: number; new_unit_cost: number }[]
    }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .rpc('apply_receival_edit', { p_edit_request_id: edit_request_id, p_items: items })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['receivals'] })
      qc.invalidateQueries({ queryKey: ['receival_edit_requests'] })
      qc.invalidateQueries({ queryKey: ['brand-variants-v2'] })
      qc.invalidateQueries({ queryKey: ['fifo-layers'] })
      qc.invalidateQueries({ queryKey: ['stock_movements'] })
    },
  })
}

// ─── LC Selector hooks ────────────────────────────────────────────────────────

export type ReceivalForLcSelector = {
  id: string
  receival_number: string
  po_id: string
  date: string
  status: string
  po_number: string | null
  supplier_name: string | null
}

export function useReceivalsForLcSelector({ search = '' }: { search?: string } = {}) {
  return useQuery({
    queryKey: ['receivals-lc-selector', { search }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('receivals')
        .select('id, receival_number, po_id, date, status, purchase_orders!receivals_po_id_fkey(po_number, supplier_name)')
        .order('date', { ascending: false })
      const safeSearch = search.replace(/%/g, '\\%').replace(/,/g, '\\,').replace(/\./g, '\\.')
      if (safeSearch) {
        q = q.or(`receival_number.ilike.%${safeSearch}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        id: r.id as string,
        receival_number: r.receival_number as string,
        po_id: r.po_id as string,
        date: r.date as string,
        status: r.status as string,
        po_number: r.purchase_orders?.po_number ?? null,
        supplier_name: r.purchase_orders?.supplier_name ?? null,
      })) as ReceivalForLcSelector[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export type ReceivalItemWithFifo = {
  id: string
  item_name: string
  sku: string | null
  qty_received: number
  unit_cost: number
  brand_variant_id: string | null
  remaining_qty: number
}

export function useReceivalItemsWithFifo(receivalId: string | null) {
  return useQuery({
    queryKey: ['receival-items-fifo', receivalId],
    enabled: !!receivalId,
    queryFn: async () => {
      const supabase = createClient()
      const [{ data: items, error: iErr }, { data: layers, error: lErr }] = await Promise.all([
        (supabase as any)
          .from('receival_items')
          .select('id, item_name, sku, qty_received, unit_cost, brand_variant_id')
          .eq('receival_id', receivalId!)
          .eq('is_free', false),
        (supabase as any)
          .from('fifo_cost_layers')
          .select('brand_variant_id, remaining_qty')
          .eq('receival_id', receivalId!)
          .gt('remaining_qty', 0),
      ])
      if (iErr || lErr) throw iErr ?? lErr
      // Sum remaining_qty across all layers for each brand_variant
      const remainingMap = new Map<string, number>()
      for (const l of layers ?? []) {
        if (!l.brand_variant_id) continue
        remainingMap.set(l.brand_variant_id, (remainingMap.get(l.brand_variant_id) ?? 0) + l.remaining_qty)
      }
      return (items ?? []).map((item: any) => ({
        ...item,
        remaining_qty: remainingMap.get(item.brand_variant_id) ?? 0,
      })) as ReceivalItemWithFifo[]
    },
    staleTime: 2 * 60 * 1000,
  })
}
