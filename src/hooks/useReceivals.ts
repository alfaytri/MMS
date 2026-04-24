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
            }))
          )
        if (iErr) throw iErr

        // Update received_qty on each PO line item (non-free items only)
        for (const it of payload.items) {
          if (!it.po_line_item_id || it.is_free) continue
          const { data: li } = await (supabase as any)
            .from('po_line_items').select('received_qty').eq('id', it.po_line_item_id).single()
          if (li != null) {
            await (supabase as any)
              .from('po_line_items')
              .update({ received_qty: (li.received_qty ?? 0) + it.qty_received })
              .eq('id', it.po_line_item_id)
          }
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
        .select('po_id, receival_number, receival_items(po_line_item_id, qty_received, is_free)')
        .eq('id', id)
        .single()
      const { error } = await (supabase as any)
        .from('receivals').update({ status: action }).eq('id', id)
      if (error) throw error

      const approvalPerformer = await resolveMyName()
      await logPOActivity({
        poId: receival?.po_id,
        action: action === 'approved' ? 'Receival Approved' : 'Receival Rejected',
        details: receival?.receival_number ?? id,
        performerName: approvalPerformer,
        severity: action === 'rejected' ? 'warning' : 'info',
      })

      // Roll back received_qty on po_line_items when rejected
      if (action === 'rejected') {
        const items: { po_line_item_id: string | null; qty_received: number; is_free: boolean | null }[] =
          receival?.receival_items ?? []
        for (const it of items) {
          if (!it.po_line_item_id || it.is_free) continue
          const { data: li } = await (supabase as any)
            .from('po_line_items').select('received_qty').eq('id', it.po_line_item_id).single()
          if (li != null) {
            await (supabase as any)
              .from('po_line_items')
              .update({ received_qty: Math.max(0, (li.received_qty ?? 0) - it.qty_received) })
              .eq('id', it.po_line_item_id)
          }
        }
      }

      return receival?.po_id as string | null
    },
    onSuccess: (poId) => {
      queryClient.invalidateQueries({ queryKey: ['receivals'] })
      if (poId) {
        queryClient.invalidateQueries({ queryKey: ['po-receivals', poId] })
        queryClient.invalidateQueries({ queryKey: ['purchase-order', poId] })
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      }
    },
  })
}
