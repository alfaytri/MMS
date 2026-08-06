import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { nextNoteId } from '@/hooks/useCreditNotes'
import type { DebitNote } from '@/types/invoice'
import { queryKeys } from '@/lib/queryKeys'

export type POReturnStatus = 'pending' | 'dispatched' | 'supplier_confirmed' | 'closed' | 'cancelled'

export type POReturnItem = {
  item_name: string
  sku: string | null
  qty: number
  brand_variant_id: string | null
  condition: 'defective' | 'damaged' | 'other'
  condition_notes: string | null
  receival_item_id: string | null
}

export type ReceivalItemForReturn = {
  receival_item_id:      string
  receival_id:           string
  receival_number:       string
  received_at:           string
  warehouse_id:          string
  warehouse_name:        string
  sub_container_id:      string | null
  sub_container_name:    string | null
  brand_variant_id:      string
  item_name:             string
  sku:                   string | null
  received_qty:          number
  already_returned_qty:  number
  returnable_qty:        number
}

export function useReceivalItemsForPo(poId: string | null) {
  return useQuery({
    queryKey: ['receival-items-for-po', poId],
    enabled:  !!poId,
    queryFn:  async () => {
      const supabase = createClient()
      const { data: receivals, error: rErr } = await supabase
        .from('receivals')
        .select('id, receival_number, created_at, warehouse_id, warehouses(name), receival_items(id, brand_variant_id, item_name, sku, qty_received, sub_container_id, warehouse_sub_containers(name))')
        .eq('po_id', poId!)
      if (rErr) throw rErr

      type ReceivalItemRow = {
        id:                string
        brand_variant_id:  string
        item_name:         string
        sku:               string | null
        qty_received:      number
        sub_container_id:  string | null
        warehouse_sub_containers?: { name?: string | null } | null
      }
      type ReceivalRow = {
        id:              string
        receival_number: string
        created_at:      string
        warehouse_id:    string
        warehouses?:     { name?: string | null } | null
        receival_items?: ReceivalItemRow[]
      }

      const typed = (receivals ?? []) as unknown as ReceivalRow[]
      const itemIds = typed.flatMap((r) => (r.receival_items ?? []).map((ri) => ri.id))

      const returnedMap = new Map<string, number>()
      if (itemIds.length > 0) {
        // Money-path H3: filter out cancelled + soft-deleted returns so
        // their qty doesn't burn returnable capacity on the receival.
        const { data: prior, error: pErr } = await supabase
          .from('return_lines')
          .select('receival_item_id, qty, so_po_returns!inner(status, deleted_at)')
          .in('receival_item_id', itemIds)
          .neq('so_po_returns.status', 'cancelled')
          .is('so_po_returns.deleted_at', null)
        if (pErr) throw pErr
        for (const row of prior ?? []) {
          if (row.receival_item_id) {
            returnedMap.set(row.receival_item_id, (returnedMap.get(row.receival_item_id) ?? 0) + (row.qty ?? 0))
          }
        }
      }

      const rows: ReceivalItemForReturn[] = []
      for (const r of typed) {
        for (const ri of r.receival_items ?? []) {
          const already = returnedMap.get(ri.id) ?? 0
          rows.push({
            receival_item_id:     ri.id,
            receival_id:          r.id,
            receival_number:      r.receival_number,
            received_at:          r.created_at,
            warehouse_id:         r.warehouse_id,
            warehouse_name:       r.warehouses?.name ?? '—',
            sub_container_id:     ri.sub_container_id,
            sub_container_name:   ri.warehouse_sub_containers?.name ?? null,
            brand_variant_id:     ri.brand_variant_id,
            item_name:            ri.item_name,
            sku:                  ri.sku,
            received_qty:         ri.qty_received,
            already_returned_qty: already,
            returnable_qty:       Math.max(ri.qty_received - already, 0),
          })
        }
      }
      return rows.sort((a, b) => a.received_at.localeCompare(b.received_at))
    },
    staleTime: 30_000,
  })
}

export type POReturn = {
  id: string
  return_number: string
  source_type: 'purchase_order'
  source_id: string
  date: string
  reason: string
  return_lines?: POReturnItem[]
  notes: string | null
  status: POReturnStatus
  dispatched_at: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  credit_note_id: string | null   // legacy — sale returns only (FK → credit_notes.id)
  debit_note_id:  string | null   // FK → debit_notes.id, populated on dispatch for PO returns
  debit_note?: DebitNote | null   // joined
  source_receival_numbers?: string[]   // distinct RCV-XXXXXs the return_lines came from
}

export function usePurchaseReturnsByPO(poId: string | null) {
  return useQuery({
    queryKey: queryKeys.purchaseReturns.byPoId(poId),
    enabled: !!poId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('so_po_returns')
        .select('*, return_lines(*)')
        .eq('source_type', 'purchase_order')
        .eq('source_id', poId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Fetch linked debit notes via so_po_returns.debit_note_id (FK to
      // debit_notes.id). credit_note_id is only for sale returns.
      const rows = data ?? []
      const noteIds = rows
        .map((r) => (r as Record<string, unknown>).debit_note_id as string | null)
        .filter(Boolean) as string[]
      const noteMap: Record<string, Record<string, unknown>> = {}
      if (noteIds.length > 0) {
        const { data: notes } = await supabase
          .from('debit_notes')
          .select('*')
          .in('id', noteIds)
        for (const n of (notes ?? [])) noteMap[(n as { id: string }).id] = n as Record<string, unknown>
      }
      // Map each return_line.receival_item_id → receival_number so the UI can
      // show "from RCV-XXXXX" per return.
      const receivalItemIds = rows.flatMap((r) => {
        const lines = ((r as Record<string, unknown>).return_lines ?? []) as Array<{ receival_item_id?: string | null }>
        return lines.map((l) => l.receival_item_id).filter(Boolean) as string[]
      })
      const receivalNumberByItemId: Record<string, string> = {}
      if (receivalItemIds.length > 0) {
        const { data: ris } = await supabase
          .from('receival_items')
          .select('id, receivals!inner(receival_number)')
          .in('id', Array.from(new Set(receivalItemIds)))
        for (const ri of (ris ?? []) as Array<{ id: string; receivals: { receival_number: string } | null }>) {
          if (ri.receivals?.receival_number) receivalNumberByItemId[ri.id] = ri.receivals.receival_number
        }
      }
      return rows.map((r) => {
        const row = r as Record<string, unknown>
        const lines = (row.return_lines ?? []) as Array<{ receival_item_id?: string | null }>
        const nums = Array.from(new Set(
          lines.map((l) => l.receival_item_id ? receivalNumberByItemId[l.receival_item_id] : null).filter(Boolean) as string[]
        )).sort()
        return {
          ...r,
          debit_note: row.debit_note_id ? (noteMap[row.debit_note_id as string] ?? null) : null,
          source_receival_numbers: nums,
        }
      }) as unknown as POReturn[]
    },
    staleTime: 30 * 1000,
  })
}

export function usePurchaseReturns(filters: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.purchaseReturns.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('so_po_returns')
        .select('*, return_lines(*)')
        .eq('source_type', 'purchase_order')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (filters.status) q = q.eq('status', filters.status as 'pending' | 'dispatched' | 'supplier_confirmed' | 'closed' | 'cancelled' | 'received' | 'restocked')
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.ilike('return_number', `%${safe}%`)
      }
      const { data, error } = await q.limit(500)
      if (error) throw error
      return (data ?? []) as unknown as POReturn[]
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
      notes: string | null
    }) => {
      const supabase = createClient()

      const missingLink = payload.items.find((it) => !it.receival_item_id)
      if (missingLink) {
        throw new Error(`Every return line must reference a receival. Missing on: ${missingLink.item_name}`)
      }

      const { count } = await supabase
        .from('so_po_returns')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'purchase_order')
      const return_number = `PR-${String((count ?? 0) + 1).padStart(5, '0')}`

      // Post-D.4.a: `so_po_returns.restock_warehouse_id` is intentionally left
      // NULL. Provenance lives per-line on `return_lines.receival_item_id`
      // (which points back to the exact receival + sub-container). The column
      // remains for legacy pre-D.4.a rows only.
      const { data, error } = await supabase
        .from('so_po_returns')
        .insert({
          return_number,
          source_type: 'purchase_order',
          source_id: payload.source_id,
          date: payload.date,
          reason: payload.reason,
          notes: payload.notes,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.items.length > 0) {
        const { error: linesErr } = await supabase
          .from('return_lines')
          .insert(payload.items.map((item) => ({
            return_id: data.id,
            item_name: item.item_name,
            sku: item.sku,
            qty: item.qty,
            condition: item.condition,
            brand_variant_id: item.brand_variant_id,
            condition_notes: item.condition_notes ?? null,
            receival_item_id: item.receival_item_id,
          })))
        if (linesErr) throw linesErr
      }

      return { ...data, return_lines: payload.items } as unknown as POReturn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseReturns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseReturns.byPo })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      const totalQty = (data.return_lines ?? []).reduce((s, i) => s + i.qty, 0)
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
  supabase: ReturnType<typeof createClient>,
  returnId: string,
  ret: { source_id: string; return_number: string; return_lines: POReturnItem[]; reason: string }
) {
  // Idempotency guard: if a DN already exists for this return (double-click,
  // retry after network flake, cross-tab race), reuse it instead of creating
  // a duplicate. The DB also enforces this via a partial unique index on
  // debit_notes(source_return_id) — see 20260725120000.
  const { data: existingDn } = await supabase
    .from('debit_notes')
    .select('id')
    .eq('source_return_id', returnId)
    .maybeSingle()
  if (existingDn) return

  // 1. Fetch PO details with line items
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('supplier_id, supplier_name, total_qar, po_number, po_line_items(*)')
    .eq('id', ret.source_id)
    .single()
  type PoLineRow = { item_name: string; sku: string | null; brand_variant_id: string | null; unit_price: number; qty: number; total_price?: number }
  const poLineArr = (po?.po_line_items ?? []) as PoLineRow[]

  // 2. Build returned lines — resolve unit price from PO line items.
  // Money-path H5: never silently fall back to 0. If a line has no matching
  // PO line (variant renamed, SKU edited, translated item name), RAISE so
  // the operator sees the mismatch instead of shipping a DN total of 0.
  const returnedLines = ret.return_lines.map((item: POReturnItem) => {
    const poLine = poLineArr.find(
      (l) =>
        (item.brand_variant_id && l.brand_variant_id === item.brand_variant_id) ||
        (item.sku && l.sku === item.sku) ||
        l.item_name === item.item_name
    )
    if (!poLine || !(poLine.unit_price > 0)) {
      throw new Error(
        `Cannot create debit note: no matching PO line for "${item.item_name}" ` +
        `(sku=${item.sku ?? '—'}, bv=${item.brand_variant_id ?? '—'}). ` +
        'The PO line may have been renamed or its variant changed since the return was created. ' +
        'Fix the PO line reference before issuing the debit note.'
      )
    }
    const unitPrice = poLine.unit_price
    return {
      item_name:        item.item_name,
      sku:              item.sku,
      qty:              item.qty,
      unit_price:       unitPrice,
      total:            item.qty * unitPrice,
      brand_variant_id: item.brand_variant_id ?? poLine.brand_variant_id ?? null,
      condition:        item.condition,
      condition_notes:  item.condition_notes,
    }
  })

  // 3. Build original lines from PO line items
  const originalLines = poLineArr.map((l) => ({
    item_name:  l.item_name,
    sku:        l.sku ?? null,
    qty:        l.qty,
    unit_price: l.unit_price,
    total:      l.total_price ?? l.qty * l.unit_price,
  }))

  const dnTotal = returnedLines.reduce((s, l) => s + l.total, 0)
  const originalTotal = po?.total_qar ?? 0
  const newTotal = originalTotal - dnTotal

  const debit_note_id = await nextNoteId('debit')

  const { data: dn, error: dnErr } = await supabase
    .from('debit_notes')
    .insert({
      debit_note_id,
      bill_id:           null,
      supplier_id:       (po as { supplier_id?: string | null } | null)?.supplier_id ?? null,
      supplier_name:     po?.supplier_name ?? null,
      purchase_order_id: ret.source_id,
      source_return_id:  returnId,
      reason:            ret.reason,
      status:            'open',
      total_amount:      dnTotal,
      original_total:    originalTotal,
      new_total:         newTotal,
    })
    .select('id')
    .single()
  if (dnErr) throw dnErr

  const lineRows = [
    ...originalLines.map((l) => ({
      debit_note_id: dn.id,
      description:   l.item_name,
      sku:           l.sku ?? null,
      qty:           l.qty,
      unit_price:    l.unit_price,
      line_type:     'original' as const,
    })),
    ...returnedLines.map((l) => ({
      debit_note_id:  dn.id,
      description:    l.item_name,
      sku:            l.sku ?? null,
      qty:            l.qty,
      unit_price:     l.unit_price,
      line_type:      'returned' as const,
      condition:      l.condition ?? null,
      condition_notes: l.condition_notes ?? null,
    })),
  ]
  if (lineRows.length > 0) {
    const { error: linesErr } = await supabase
      .from('debit_note_lines')
      .insert(lineRows)
    if (linesErr) throw linesErr
  }

  // 4. Link return → debit note. Writes debit_note_id (FK → debit_notes.id).
  // credit_note_id is only for sale returns.
  const { error: linkErr } = await supabase
    .from('so_po_returns')
    .update({ debit_note_id: dn.id })
    .eq('id', returnId)
  if (linkErr) throw linkErr
}

export function useUpdatePOReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      sourceId: _sourceId,
    }: {
      id: string
      status: POReturnStatus
      sourceId: string
    }) => {
      const supabase = createClient()

      const { data: ret, error: fetchErr } = await supabase
        .from('so_po_returns')
        .select('return_number, dispatched_at, source_id, reason, return_lines(*)')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      if (status === 'dispatched') {
        // Update status first (RPC validates status = 'dispatched')
        const { error } = await supabase
          .from('so_po_returns').update({ status }).eq('id', id)
        if (error) throw error
        // Call RPC — revert status if it fails. The RPC runs atomically in PG
        // so dispatched_at is either NULL (failure) or set (success); we only
        // need to revert status.
        const { error: rpcErr } = await supabase
          .rpc('rpc_process_po_return_dispatch', { p_return_id: id })
        if (rpcErr) {
          await supabase
            .from('so_po_returns').update({ status: 'pending' }).eq('id', id)
          throw rpcErr
        }
        // Auto-create debit note
        await createDebitNoteForReturn(supabase, id, {
          source_id:     ret.source_id,
          return_number: ret.return_number,
          return_lines:  (ret.return_lines ?? []) as POReturnItem[],
          reason:        ret.reason,
        })
      } else if (status === 'cancelled' && ret.dispatched_at) {
        // dispatched_at present means inventory was deducted — reverse it first.
        // Assumes dispatched_at IS NOT NULL whenever status='dispatched'; any
        // record missing dispatched_at with status='dispatched' would skip the
        // RPC and leave inventory unreversed (data-corruption scenario).
        const { error: rpcErr } = await supabase
          .rpc('rpc_cancel_po_return_dispatch', { p_return_id: id })
        if (rpcErr) throw rpcErr
        const { error } = await supabase
          .from('so_po_returns').update({ status }).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('so_po_returns').update({ status }).eq('id', id)
        if (error) throw error
      }

      return { return_number: ret.return_number as string }
    },
    onSuccess: (ret, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseReturns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseReturns.byPo })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      if (variables.status === 'dispatched' || variables.status === 'cancelled') {
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      }
      if (variables.status === 'dispatched') {
        queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.debitNotes })
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

/** Manually generate a debit note for a return that missed auto-creation. */
export function useCreateDebitNoteForReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ret: POReturn) => {
      const supabase = createClient()
      await createDebitNoteForReturn(supabase, ret.id, {
        source_id:     ret.source_id,
        return_number: ret.return_number,
        return_lines:  ret.return_lines ?? [],
        reason:        ret.reason,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.purchaseReturns.byPo })
      queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.debitNotes })
    },
  })
}
