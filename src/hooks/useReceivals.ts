// src/hooks/useReceivals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logPOActivity, resolveMyName } from '@/lib/poActivityLogger'

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

export type CreateReceivalPayload = {
  po_id: string
  warehouse_id: string
  date: string
  notes: string
  items: {
    po_line_item_id: string | null
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
          *,
          receival_items(*),
          purchase_orders!receivals_po_id_fkey(po_number, supplier_name)
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
          *,
          receival_items(*),
          purchase_orders!receivals_po_id_fkey(po_number, supplier_name, po_line_items(*))
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

      // Resolve current user's name for audit trail
      const { data: { user } } = await supabase.auth.getUser()
      let receivedByName: string | null = null
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles').select('full_name').eq('auth_user_id', user.id).maybeSingle()
        receivedByName = profile?.full_name ?? user.email ?? null
      }

      const { count } = await (supabase as any)
        .from('receivals')
        .select('*', { count: 'exact', head: true })
      const receival_number = `RCV-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data: receival, error } = await (supabase as any)
        .from('receivals')
        .insert({
          receival_number,
          po_id: payload.po_id,
          warehouse_id: payload.warehouse_id,
          date: payload.date,
          notes: payload.notes || null,
          status: 'pending_approval',
          received_by_name: receivedByName,
        })
        .select()
        .single()
      if (error) throw error

      if (payload.items.length > 0) {
        // Batch-fetch brand_variant_id for all po_line_item_ids in one round-trip
        const poLineIds = payload.items
          .map(it => it.po_line_item_id)
          .filter((id): id is string => !!id)

        let bvMap: Record<string, string | null> = {}
        if (poLineIds.length > 0) {
          const { data: poLines } = await (supabase as any)
            .from('po_line_items')
            .select('id, brand_variant_id')
            .in('id', poLineIds)
          for (const pl of poLines ?? []) {
            bvMap[pl.id] = pl.brand_variant_id ?? null
          }
        }

        const { error: iErr } = await (supabase as any)
          .from('receival_items')
          .insert(
            payload.items.map((it) => ({
              receival_id: receival.id,
              po_line_item_id: it.po_line_item_id,
              item_name: it.item_name,
              sku: it.sku,
              qty_received: it.qty_received,
              unit_cost: it.unit_cost,
              is_free: it.is_free ?? false,
              brand_variant_id: it.po_line_item_id ? (bvMap[it.po_line_item_id] ?? null) : null,
            }))
          )
        if (iErr) throw iErr

        // Batch update received_qty — one RPC call instead of N×2 round trips
        const updates = payload.items
          .filter(it => it.po_line_item_id && !it.is_free)
          .map(it => ({ id: it.po_line_item_id!, delta: it.qty_received }))

        if (updates.length > 0) {
          const { error: batchErr } = await (supabase as any)
            .rpc('batch_increment_received_qty', { p_updates: updates })
          if (batchErr) throw batchErr
        }
      }

      const regularCount = payload.items.filter((i) => !i.is_free).length
      const freeCount = payload.items.filter((i) => i.is_free).length
      const details = [
        `${receival.receival_number}`,
        regularCount > 0 ? `${regularCount} item(s) received` : null,
        freeCount > 0 ? `${freeCount} free item(s)` : null,
        payload.notes ? `Note: ${payload.notes}` : null,
      ].filter(Boolean).join(' · ')
      await logPOActivity({
        poId: payload.po_id,
        action: 'Receival Recorded',
        details,
        performerName: receivedByName,
      })

      return receival as Receival
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receivals'] })
      queryClient.invalidateQueries({ queryKey: ['po-receivals', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', variables.po_id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
    },
  })
}

export function useApproveReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'approved' | 'rejected' }) => {
      const supabase = createClient()

      const { data: receival } = await (supabase as any)
        .from('receivals')
        .select('po_id, receival_number')
        .eq('id', id)
        .single()

      const { error } = await (supabase as any)
        .rpc('approve_receival_inventory', { p_receival_id: id, p_action: action })
      if (error) throw error

      const approvalPerformer = await resolveMyName()
      await logPOActivity({
        poId: receival?.po_id,
        action: action === 'approved' ? 'Receival Approved' : 'Receival Rejected',
        details: receival?.receival_number ?? id,
        performerName: approvalPerformer,
        severity: action === 'rejected' ? 'warning' : 'info',
      })

      return receival?.po_id as string | null
    },
    onSuccess: (poId) => {
      queryClient.invalidateQueries({ queryKey: ['receivals'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers'] })
      queryClient.invalidateQueries({ queryKey: ['stock_movements'] })
      if (poId) {
        queryClient.invalidateQueries({ queryKey: ['po-receivals', poId] })
        queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] })
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      }
    },
  })
}
