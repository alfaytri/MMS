import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { nextNoteId } from '@/hooks/useCreditNotes'

export type POReturnStatus = 'pending' | 'dispatched' | 'supplier_confirmed' | 'closed' | 'cancelled'

export type POReturnItem = {
  item_name: string
  sku: string | null
  qty: number
  brand_variant_id: string | null
  condition: 'defective' | 'damaged' | 'other'
  condition_notes: string | null
}

export type POReturn = {
  id: string
  return_number: string
  source_type: 'purchase_order'
  source_id: string
  date: string
  reason: string
  items: POReturnItem[]
  restock_warehouse_id: string | null
  notes: string | null
  status: POReturnStatus
  dispatched_at: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export function usePurchaseReturnsByPO(poId: string | null) {
  return useQuery({
    queryKey: ['po-returns-by-po', poId],
    enabled: !!poId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'purchase_order')
        .eq('source_id', poId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as POReturn[]
    },
    staleTime: 30 * 1000,
  })
}

export function usePurchaseReturns(filters: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['po-returns', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'purchase_order')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.ilike('return_number', `%${safe}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return data as POReturn[]
    },
    staleTime: 30 * 1000,
  })
}

export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_id: string
      date: string
      reason: string
      items: POReturnItem[]
      restock_warehouse_id: string | null
      notes: string | null
    }) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('returns')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'purchase_order')
      const return_number = `PR-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('returns')
        .insert({
          return_number,
          source_type: 'purchase_order',
          source_id: payload.source_id,
          date: payload.date,
          reason: payload.reason,
          items: payload.items,
          restock_warehouse_id: payload.restock_warehouse_id,
          notes: payload.notes,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error
      return data as POReturn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['po-returns'] })
      queryClient.invalidateQueries({ queryKey: ['po-returns-by-po'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      const totalQty = data.items.reduce((s, i) => s + i.qty, 0)
      logActivity({
        action:    'PO Return Created',
        module:    'purchase_orders',
        entity_id: data.source_id,
        details:   `${data.return_number} · ${totalQty} item(s) · ${data.reason}`,
        severity:  'info',
      })
    },
  })
}

async function createDebitNoteForReturn(
  supabase: any,
  returnId: string,
  ret: { source_id: string; return_number: string; items: POReturnItem[]; reason: string }
) {
  // 1. Fetch PO details with line items
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('supplier_name, total_qar, po_number, po_line_items(*)')
    .eq('id', ret.source_id)
    .single()
  const poLineArr: any[] = po?.po_line_items ?? []

  // 2. Build returned lines — resolve unit price from PO line items
  const returnedLines = ret.items.map((item: POReturnItem) => {
    const poLine = poLineArr.find(
      (l: any) =>
        (item.brand_variant_id && l.brand_variant_id === item.brand_variant_id) ||
        (item.sku && l.sku === item.sku) ||
        l.item_name === item.item_name
    )
    const unitPrice = poLine?.unit_price ?? 0
    return {
      item_name:       item.item_name,
      sku:             item.sku,
      qty:             item.qty,
      unit_price:      unitPrice,
      total:           item.qty * unitPrice,
      condition:       item.condition,
      condition_notes: item.condition_notes,
    }
  })

  // 3. Build original lines from PO line items
  const originalLines = poLineArr.map((l: any) => ({
    item_name:  l.item_name,
    sku:        l.sku ?? null,
    qty:        l.qty,
    unit_price: l.unit_price,
    total:      l.total_price ?? l.qty * l.unit_price,
  }))

  const dnTotal = returnedLines.reduce((s: number, l: any) => s + l.total, 0)
  const originalTotal = po?.total_qar ?? 0
  const newTotal = originalTotal - dnTotal

  const credit_note_id = await nextNoteId('debit')
  const pdfData = { original_lines: originalLines, returned_lines: returnedLines }

  const { data: dn, error: dnErr } = await supabase
    .from('credit_notes')
    .insert({
      credit_note_id,
      note_type:        'debit',
      invoice_id:       null,
      customer_name:    null,
      supplier_name:    po?.supplier_name ?? null,
      source_return_id: returnId,
      reason:           ret.reason,
      type:             'auto',
      status:           'issued',
      total_amount:     dnTotal,
      original_total:   originalTotal,
      new_total:        newTotal,
      line_items:       pdfData,
    })
    .select('id')
    .single()
  if (dnErr) throw dnErr

  // 4. Link return → debit note
  await supabase
    .from('returns')
    .update({ credit_note_id: dn.id })
    .eq('id', returnId)
}

export function useUpdatePOReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      sourceId,
    }: {
      id: string
      status: POReturnStatus
      sourceId: string
    }) => {
      const supabase = createClient()

      const { data: ret, error: fetchErr } = await (supabase as any)
        .from('returns')
        .select('return_number, dispatched_at, source_id, items, reason')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      if (status === 'dispatched') {
        // Update status first (RPC validates status = 'dispatched')
        const { error } = await (supabase as any)
          .from('returns').update({ status }).eq('id', id)
        if (error) throw error
        // Call RPC — revert status if it fails. The RPC runs atomically in PG
        // so dispatched_at is either NULL (failure) or set (success); we only
        // need to revert status.
        const { error: rpcErr } = await (supabase as any)
          .rpc('rpc_process_po_return_dispatch', { p_return_id: id })
        if (rpcErr) {
          await (supabase as any)
            .from('returns').update({ status: 'pending' }).eq('id', id)
          throw rpcErr
        }
        // Auto-create debit note
        await createDebitNoteForReturn(supabase as any, id, {
          source_id:     ret.source_id,
          return_number: ret.return_number,
          items:         ret.items as POReturnItem[],
          reason:        ret.reason,
        })
      } else if (status === 'cancelled' && ret.dispatched_at) {
        // dispatched_at present means inventory was deducted — reverse it first.
        // Assumes dispatched_at IS NOT NULL whenever status='dispatched'; any
        // record missing dispatched_at with status='dispatched' would skip the
        // RPC and leave inventory unreversed (data-corruption scenario).
        const { error: rpcErr } = await (supabase as any)
          .rpc('rpc_cancel_po_return_dispatch', { p_return_id: id })
        if (rpcErr) throw rpcErr
        const { error } = await (supabase as any)
          .from('returns').update({ status }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('returns').update({ status }).eq('id', id)
        if (error) throw error
      }

      return { return_number: ret.return_number as string }
    },
    onSuccess: (ret, variables) => {
      queryClient.invalidateQueries({ queryKey: ['po-returns'] })
      queryClient.invalidateQueries({ queryKey: ['po-returns-by-po'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      if (variables.status === 'dispatched' || variables.status === 'cancelled') {
        queryClient.invalidateQueries({ queryKey: ['brand-variants-v2'] })
      }
      if (variables.status === 'dispatched') {
        queryClient.invalidateQueries({ queryKey: ['debit-notes'] })
      }
      const ACTION_MAP: Record<POReturnStatus, { action: string; severity: 'info' | 'warning' }> = {
        pending:            { action: 'PO Return Marked Pending',     severity: 'info' },
        dispatched:         { action: 'PO Return Dispatched',         severity: 'info' },
        supplier_confirmed: { action: 'PO Return Supplier Confirmed', severity: 'info' },
        closed:             { action: 'PO Return Closed',             severity: 'info' },
        cancelled:          { action: 'PO Return Cancelled',          severity: 'warning' },
      }
      const { action, severity } = ACTION_MAP[variables.status]
      logActivity({
        action,
        module:    'purchase_orders',
        entity_id: variables.sourceId,
        details:   ret.return_number,
        severity,
      })
    },
  })
}
