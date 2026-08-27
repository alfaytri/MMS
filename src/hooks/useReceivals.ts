// src/hooks/useReceivals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logPOActivity } from '@/lib/poActivityLogger'
import { queryKeys } from '@/lib/queryKeys'
import { recipientsForNotification, notifyOwnerAndKey } from '@/lib/notify'

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
  sub_container_id: string | null
  // UI-computed: ordered qty comes from po_line_items join
  ordered_qty?: number
}

export type Receival = {
  id: string
  receival_number: string
  po_id: string | null
  warehouse_id: string
  date: string
  status: ReceivalStatus | null
  notes: string | null
  received_by_name: string | null
  created_at: string | null
  receival_items?: ReceivalItem[]
  is_replacement?: boolean
  source_debit_note_id?: string | null
  source_type?: 'purchase' | 'inventory'
  carved_from_layer_id?: string | null
  // joined
  po_number?: string | null
  supplier_name?: string | null
  warehouse_name?: string
  // Currency that receival_items.unit_cost is denominated in — PO currency for
  // purchase receivals, QAR for inventory receivals (see migration
  // 20260729214710). Populated by the list/detail fetch hooks below.
  currency?: string
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
  sub_container_id?: string | null
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

export function useReceivals(filters?: {
  status?: ReceivalStatus | ''
  source_type?: 'purchase' | 'inventory' | 'all'
}) {
  return useQuery({
    queryKey: queryKeys.receivals.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('receivals')
        .select(`
          id,receival_number,po_id,warehouse_id,date,status,notes,received_by_name,created_at,is_replacement,source_debit_note_id,source_type,carved_from_layer_id,
          receival_items(id,receival_id,po_line_item_id,item_name,sku,qty_received,unit_cost,is_free,brand_variant_id,sub_container_id),
          purchase_orders!receivals_po_id_fkey(po_number,supplier_name,currency),
          warehouses!receivals_warehouse_id_fkey(name)
        `)
        .order('created_at', { ascending: false })
        .limit(200)
      if (filters?.status) q = q.eq('status', filters.status)
      if (filters?.source_type && filters.source_type !== 'all') {
        // source_type column not yet in generated types (added in migration 20260709192726)
        q = (q as unknown as { eq: (col: string, val: string) => typeof q })
          .eq('source_type', filters.source_type)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((r) => ({
        ...r,
        po_number: r.purchase_orders?.po_number ?? null,
        supplier_name: r.purchase_orders?.supplier_name ?? null,
        warehouse_name: r.warehouses?.name ?? null,
        currency: (r.purchase_orders?.currency as string | null) ?? 'QAR',
      })) as Receival[]
    },
    staleTime: 30 * 1000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

export function useReceival(id: string | null) {
  return useQuery({
    queryKey: queryKeys.receivals.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('receivals')
        .select(`
          id,receival_number,po_id,warehouse_id,date,status,notes,received_by_name,created_at,is_replacement,source_debit_note_id,source_type,carved_from_layer_id,
          receival_items(id,receival_id,po_line_item_id,item_name,sku,qty_received,unit_cost,is_free,brand_variant_id,sub_container_id),
          purchase_orders!receivals_po_id_fkey(po_number,supplier_name,currency,po_line_items(id,qty))
        `)
        .eq('id', id!)
        .single()
      if (error) throw error
      // Attach ordered_qty from PO line items
      const poLines = data.purchase_orders?.po_line_items ?? []
      const items = (data.receival_items ?? []).map((ri) => {
        const matched = poLines.find((pl) => pl.id === ri.po_line_item_id)
        return { ...ri, ordered_qty: matched?.qty ?? null }
      })
      return {
        ...data,
        receival_items: items,
        currency: (data.purchase_orders?.currency as string | null) ?? 'QAR',
      } as Receival
    },
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateReceivalPayload) => {
      const supabase = createClient()

      // Resolve user display name
      const { data: { user } } = await supabase.auth.getUser()
      let receivedByName: string | null = null
      if (user) {
        const { data: profile } = await supabase
          .from('user_data').select('full_name').eq('auth_user_id', user.id).maybeSingle()
        receivedByName = profile?.full_name ?? user.email ?? null
      }

      // Single atomic RPC — number generation + insert + FIFO + stock_level all in one transaction
      const { data, error } = await supabase.rpc('create_and_approve_receival', {
        p_po_id:            payload.po_id,
        p_warehouse_id:     payload.warehouse_id,
        p_sub_container_id: payload.sub_container_id ?? undefined,
        p_date:             payload.date,
        p_received_by_name: receivedByName ?? '',
        p_receival_number:  '',
        p_notes:            payload.notes || '',
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
      const result = data as { receival_id: string; receival_number: string }

      const regularCount = payload.items.filter(i => !i.is_free).length
      const freeCount    = payload.items.filter(i => i.is_free).length
      await logPOActivity({
        poId: payload.po_id,
        action: 'Receival Recorded',
        details: [
          result.receival_number,
          regularCount > 0 ? `${regularCount} item(s) received` : null,
          freeCount > 0 ? `${freeCount} free item(s)` : null,
          payload.notes ? `Note: ${payload.notes}` : null,
        ].filter(Boolean).join(' · '),
        performerName: receivedByName,
      })

      return result
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receivals.all })
      // Notify the PO's owner (the purchaser) that goods arrived (best-effort).
      void (async () => {
        const supabase = createClient()
        const { data: po } = await supabase
          .from('purchase_orders')
          .select('created_by, po_number, status')
          .eq('id', variables.po_id)
          .maybeSingle()
        await notifyOwnerAndKey(
          po?.created_by ?? null,
          'notify.purchase.goods_received',
          'po_goods_received',
          `Goods received on PO ${po?.po_number ?? ''}`.trim(),
          { relatedId: variables.po_id, relatedType: 'purchase_order', body: `Receival ${data.receival_number}` },
        )
        // If this receival completed the PO, tell the owner it's fully received.
        if (po?.status === 'received' || po?.status === 'completed') {
          await notifyOwnerAndKey(
            po?.created_by ?? null,
            'notify.purchase.goods_received',
            'po_fully_received',
            `PO ${po?.po_number ?? ''} fully received`.trim(),
            { relatedId: variables.po_id, relatedType: 'purchase_order' },
          )
        }
      })()
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.receivals(variables.po_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.po_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      // Received stock must appear without a manual browser refresh. The Custody
      // page reads warehouse_stock; the Inventory list reads the batched
      // per-variant stock + category aggregates + the per-warehouse tooltip +
      // the division-scoped fallbacks. brand-variants-v2 above only covers the
      // (disabled-on-list) per-row fallback, so these were the real gap.
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      queryClient.invalidateQueries({ queryKey: ['item-variants-batch'] })
      queryClient.invalidateQueries({ queryKey: ['category-stock-aggregates'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.variantWarehouseStock })
      queryClient.invalidateQueries({ queryKey: ['item-variant-division-stock'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers-for-variant'] })
      queryClient.invalidateQueries({ queryKey: ['variant-stock-by-division'] })
    },
  })
}

// ─── Edit Request Hooks ───────────────────────────────────────────────────────

export function useReceivalEditRequests(receival_id: string | null) {
  return useQuery({
    queryKey: queryKeys.receivals.editRequestsByReceival(receival_id),
    enabled: !!receival_id,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('receival_edit_requests')
        .select('*')
        .eq('receival_id', receival_id!)
        .order('created_at', { ascending: false })
        .limit(50)
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
      const { data: profile } = await supabase
        .from('user_data').select('id').eq('auth_user_id', user?.id ?? '').maybeSingle()
      if (!profile?.id) throw new Error('Profile not found')

      const { data, error } = await supabase
        .from('receival_edit_requests')
        .insert({ receival_id, requested_by: profile.id, reason, status: 'pending' })
        .select().single()
      if (error) throw error

      // Notify receivals-managers + anyone granted the receival-edit notification override.
      const recipientIds = await recipientsForNotification('receival_edit_request')
      const notifications = recipientIds.map((profileId) => ({
        profile_id: profileId,
        title: 'Receival Edit Requested',
        body: `A receival edit was requested: ${reason}`,
        type: 'receival_edit_request',
        related_id: data.id,
        related_type: 'receival_edit_request',
      }))
      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications)
      }

      return data as ReceivalEditRequest
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.receivals.editRequestsByReceival(variables.receival_id) })
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
      const { data: profile } = await supabase
        .from('user_data').select('id').eq('auth_user_id', user?.id ?? '').maybeSingle()

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

      const { data, error } = await supabase
        .from('receival_edit_requests')
        .update(patch as import('@/types/database.types').DBUpdate<'receival_edit_requests'>)
        .eq('id', request_id)
        .select('*, receival_id, requested_by').single()
      if (error) throw error

      // Notify the requestor (requested_by comes from the update select above)
      if (data?.requested_by) {
        await supabase.from('notifications').insert({
          profile_id: data.requested_by,
          title: action === 'approved' ? 'Edit Request Approved' : 'Edit Request Rejected',
          body: action === 'approved'
            ? 'Your receival edit was approved. You have 48 hours to save your changes.'
            : `Your receival edit was rejected. ${rejection_note ?? ''}`,
          type: 'receival_edit_response',
          related_id: request_id,
          related_type: 'receival_edit_request',
        })
      }

      return data as ReceivalEditRequest
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.receivals.editRequestsByReceival(data.receival_id) })
      qc.invalidateQueries({ queryKey: queryKeys.receivals.all })
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
      const { data, error } = await supabase
        .rpc('apply_receival_edit', { p_edit_request_id: edit_request_id, p_items: items })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.receivals.all })
      qc.invalidateQueries({ queryKey: queryKeys.receivals.editRequests })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
    },
  })
}

// ─── Replacement Receival ─────────────────────────────────────────────────────

export type ReplacementReceivalItem = {
  brand_variant_id: string | null
  item_name: string
  sku: string | null
  qty_received: number
  unit_cost: number
}

export function useCreateReplacementReceival() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      po_id: string
      warehouse_id: string
      sub_container_id?: string | null
      debit_note_id: string
      items: ReplacementReceivalItem[]
    }) => {
      const supabase = createClient()

      const { data: { user } } = await supabase.auth.getUser()
      let receivedByName: string | null = null
      if (user) {
        const { data: profile } = await supabase
          .from('user_data').select('full_name').eq('auth_user_id', user.id).maybeSingle()
        receivedByName = profile?.full_name ?? user.email ?? null
      }
      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await supabase.rpc('create_and_approve_receival', {
        p_po_id:            payload.po_id,
        p_warehouse_id:     payload.warehouse_id,
        p_sub_container_id: payload.sub_container_id ?? undefined,
        p_date:             today,
        p_received_by_name: receivedByName ?? '',
        p_receival_number:  '',
        p_notes:            'Replacement receival',
        p_items:            payload.items.map(it => ({
          po_line_item_id:  null,
          brand_variant_id: it.brand_variant_id,
          item_name:        it.item_name,
          sku:              it.sku,
          qty_received:     it.qty_received,
          unit_cost:        it.unit_cost,
          is_free:          false,
        })),
      })
      if (error) throw error

      // Mark receival as replacement
      const result = data as { receival_id: string; receival_number: string }
      const { error: flagErr } = await supabase
        .from('receivals')
        .update({ is_replacement: true, source_debit_note_id: payload.debit_note_id })
        .eq('id', result.receival_id)
      if (flagErr) throw flagErr

      return { receival_id: result.receival_id, receival_number: result.receival_number }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.receivals.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.receivals(variables.po_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(variables.po_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.debitNotes })
      // Same stock-visibility invalidations as useCreateReceival (custody +
      // inventory list read these; without them received stock needs a refresh).
      queryClient.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseStockAll })
      queryClient.invalidateQueries({ queryKey: ['item-variants-batch'] })
      queryClient.invalidateQueries({ queryKey: ['category-stock-aggregates'] })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.variantWarehouseStock })
      queryClient.invalidateQueries({ queryKey: ['item-variant-division-stock'] })
      queryClient.invalidateQueries({ queryKey: ['fifo-layers-for-variant'] })
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
  source_type: string
  warehouse_id: string | null
  warehouse_name: string | null
  po_number: string | null
  supplier_name: string | null
  // Currency that receival_items.unit_cost is denominated in. For purchase
  // receivals this is the PO currency (unit_cost is stored as-entered in PO
  // currency — see migration 20260729214710); inventory receivals have no PO
  // and their costs are entered directly in QAR.
  currency: string
}

export function useReceivalsForLcSelector({ search = '' }: { search?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.receivals.lcSelector(search),
    queryFn: async () => {
      const supabase = createClient()
      const q = supabase
        .from('receivals')
        .select('id, receival_number, po_id, date, status, source_type, warehouse_id, warehouses(name), purchase_orders!receivals_po_id_fkey(po_number, supplier_name, currency)')
        .order('date', { ascending: false })
        .limit(500)
      const { data, error } = await q
      if (error) throw error
      // Match on receival_number, po_number, or supplier_name. We filter
      // client-side because PostgREST .or() can't span a joined table without
      // a view/RPC, and this list is small (recent receivals only).
      const rows = (data ?? []).map((r) => {
        const isInventory = r.source_type === 'inventory'
        return {
          id: r.id as string,
          receival_number: r.receival_number as string,
          po_id: r.po_id as string,
          date: r.date as string,
          status: r.status as string,
          source_type: (r.source_type as string) ?? 'purchase',
          warehouse_id: (r.warehouse_id as string | null) ?? null,
          warehouse_name: r.warehouses?.name ?? null,
          po_number: r.purchase_orders?.po_number ?? null,
          supplier_name: r.purchase_orders?.supplier_name ?? (isInventory ? 'Inventory Receival' : null),
          currency: (r.purchase_orders?.currency as string | null) ?? 'QAR',
        }
      }) as ReceivalForLcSelector[]
      const needle = search.trim().toLowerCase()
      if (!needle) return rows
      return rows.filter((r) =>
        r.receival_number.toLowerCase().includes(needle) ||
        (r.po_number ?? '').toLowerCase().includes(needle) ||
        (r.supplier_name ?? '').toLowerCase().includes(needle),
      )
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

/**
 * Batch variant: fetch billable receival items across MANY receivals in one
 * query. Used by the Apply-LC preview to compute proposed per-item LC value
 * before the user commits.
 */
export function useReceivalItemsBatch(receivalIds: string[] | null) {
  const sortedKey = (receivalIds ?? []).slice().sort().join(',')
  return useQuery({
    queryKey: ['receivals', 'itemsBatch', sortedKey],
    enabled: (receivalIds ?? []).length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const ids = receivalIds!
      const [{ data: items, error: iErr }, { data: layers, error: lErr }, { data: rcvs, error: rErr }] = await Promise.all([
        supabase
          .from('receival_items')
          .select('id, receival_id, item_name, sku, qty_received, unit_cost, brand_variant_id')
          .in('receival_id', ids)
          .eq('is_free', false)
          .limit(1000),
        supabase
          .from('fifo_cost_layers')
          .select('brand_variant_id, receival_id, remaining_qty')
          .in('receival_id', ids)
          .gt('remaining_qty', 0),
        // PO booked rate per receival — receival_items.unit_cost is in PO
        // currency; multiply by initial_exchange_rate to get QAR (inventory
        // receivals have no PO → rate 1). Keeps the client value-share preview
        // consistent with the allocate_landed_cost RPC (migration 20260816100000).
        supabase
          .from('receivals')
          .select('id, purchase_orders!receivals_po_id_fkey(initial_exchange_rate)')
          .in('id', ids)
          .limit(1000),
      ])
      if (iErr || lErr || rErr) throw iErr ?? lErr ?? rErr
      // Key by `${receival_id}|${brand_variant_id}` so two receivals of the
      // same variant don't share a remaining count.
      const remainingMap = new Map<string, number>()
      for (const l of layers ?? []) {
        if (!l.brand_variant_id) continue
        const k = `${l.receival_id}|${l.brand_variant_id}`
        remainingMap.set(k, (remainingMap.get(k) ?? 0) + l.remaining_qty)
      }
      const rateByReceival = new Map<string, number>()
      for (const r of rcvs ?? []) {
        const po = r.purchase_orders as { initial_exchange_rate: number | null } | null
        const rate = Number(po?.initial_exchange_rate ?? 1)
        rateByReceival.set(r.id as string, rate > 0 ? rate : 1)
      }
      return (items ?? []).map((item) => {
        const rate = rateByReceival.get(item.receival_id as string) ?? 1
        const unitCost = Number(item.unit_cost)
        return {
          id: item.id as string,
          receival_id: item.receival_id as string,
          item_name: item.item_name as string,
          sku: item.sku as string | null,
          qty_received: Number(item.qty_received),
          unit_cost: unitCost,
          // QAR-converted unit cost for value-share math (display still uses
          // unit_cost in the PO currency).
          unit_cost_qar: unitCost * rate,
          brand_variant_id: item.brand_variant_id as string | null,
          remaining_qty: remainingMap.get(`${item.receival_id}|${item.brand_variant_id}`) ?? 0,
        }
      })
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useReceivalItemsWithFifo(receivalId: string | null) {
  return useQuery({
    queryKey: queryKeys.receivals.itemsFifo(receivalId),
    enabled: !!receivalId,
    queryFn: async () => {
      const supabase = createClient()
      const [{ data: items, error: iErr }, { data: layers, error: lErr }] = await Promise.all([
        supabase
          .from('receival_items')
          .select('id, item_name, sku, qty_received, unit_cost, brand_variant_id')
          .eq('receival_id', receivalId!)
          .eq('is_free', false),
        supabase
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
      return (items ?? []).map((item) => ({
        ...item,
        remaining_qty: (item.brand_variant_id ? remainingMap.get(item.brand_variant_id) : 0) ?? 0,
      })) as ReceivalItemWithFifo[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useLcLockedReceivalIds() {
  return useQuery({
    queryKey: ['receivals', 'lcLocked'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('landed_costs')
        .select('attached_receival_ids')
        .not('applied_at', 'is', null)
        .is('voided_at', null)
        .limit(500)
      if (error) throw error
      const ids = new Set<string>()
      for (const lc of data ?? []) {
        for (const rid of (lc.attached_receival_ids as string[]) ?? []) {
          ids.add(rid)
        }
      }
      return ids
    },
    staleTime: 60 * 1000,
  })
}
