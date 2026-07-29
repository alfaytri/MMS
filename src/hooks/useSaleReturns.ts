import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { nextNoteId } from '@/hooks/useCreditNotes'
import { queryKeys } from '@/lib/queryKeys'

export type ReturnLineCondition = 'good' | 'damaged' | 'inspection'
export type SaleReturnStatus =
  | 'pending'
  | 'pending_inspection'
  | 'received'
  | 'restocked'
  | 'closed'
  | 'cancelled'

export type SaleReturn = {
  id: string
  return_number: string
  source_type: 'sale_order'
  source_id: string
  date: string
  reason: string
  return_lines?: {
    id: string
    return_id: string
    brand_variant_id: string | null
    item_name: string
    sku: string | null
    qty: number
    condition: ReturnLineCondition
    condition_notes: string | null
    created_at: string
  }[]
  restock_warehouse_id: string | null
  notes: string | null
  status: SaleReturnStatus
  credit_note_id: string | null
  credit_note?: import('@/hooks/useCreditNotes').CreditNote | null  // full object for inline detail view
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export function useSaleReturns(filters: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.saleReturns.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('so_po_returns')
        .select('*, return_lines(*)')
        .eq('source_type', 'sale_order')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) q = q.eq('status', filters.status as SaleReturn['status'])
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.ilike('return_number', `%${safe}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as unknown as SaleReturn[]
    },
    staleTime: 30 * 1000,
  })
}

export function useCreateSaleReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      source_id: string
      date: string
      reason: string
      items: {
        item_name: string
        sku: string | null
        qty: number
        condition: ReturnLineCondition
        brand_variant_id: string | null
        condition_notes?: string | null
      }[]
      restock_warehouse_id: string | null
      notes: string | null
      // If ANY item is condition='inspection', the return is created in
      // status='pending_inspection' — restock is blocked until the
      // inspection is completed via rpc_complete_return_inspection.
    }) => {
      const supabase = createClient()

      const hasInspection = payload.items.some((i) => i.condition === 'inspection')
      const initialStatus: SaleReturnStatus = hasInspection ? 'pending_inspection' : 'pending'

      // Generate return number
      const { count } = await supabase
        .from('so_po_returns')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'sale_order')
      const return_number = `SR-${String((count ?? 0) + 1).padStart(5, '0')}`

      // Resolve user_data.id from auth.uid() — the FK on so_po_returns.created_by
      // points to user_data(id), NOT the auth user's id. Same rule for
      // created_by_name lookup (user_data links via auth_user_id, not id).
      const { data: { user } } = await supabase.auth.getUser()
      let createdById: string | null = null
      let createdByName: string | null = null
      if (user) {
        const { data: profile } = await supabase
          .from('user_data')
          .select('id, full_name')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        createdById = profile?.id ?? null
        createdByName = profile?.full_name ?? null
      }

      const { data, error } = await supabase
        .from('so_po_returns')
        .insert({
          return_number,
          source_type: 'sale_order',
          source_id: payload.source_id,
          date: payload.date,
          reason: payload.reason,
          restock_warehouse_id: payload.restock_warehouse_id,
          notes: payload.notes,
          status: initialStatus,
          created_by: createdById,
          created_by_name: createdByName,
        })
        .select()
        .single()
      if (error) throw error

      // Insert return lines into the separate table
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
          })))
        if (linesErr) throw linesErr
      }

      return { ...data, return_lines: payload.items } as unknown as SaleReturn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.bySo })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      const lines = data.return_lines ?? []
      const damagedCount = lines.filter((i) => i.condition === 'damaged').reduce((s, i) => s + i.qty, 0)
      const goodCount    = lines.filter((i) => i.condition === 'good').reduce((s, i) => s + i.qty, 0)
      const parts = []
      if (goodCount > 0)    parts.push(`${goodCount} good`)
      if (damagedCount > 0) parts.push(`${damagedCount} damaged`)
      logActivity({
        action:    'Return Created',
        module:    'sale_orders',
        entity_id: data.source_id,
        details:   `${data.return_number} · ${parts.join(', ')} item(s) · ${data.reason}`,
        severity:  damagedCount > 0 ? 'warning' : 'info',
      })
    },
  })
}

async function createCreditNoteForReturn(
  supabase: ReturnType<typeof createClient>,
  returnId: string,
  ret: { source_id: string; return_number: string; return_lines: NonNullable<SaleReturn['return_lines']>; reason: string }
) {
  // 1. Fetch SO lines for unit price + ordered qty lookup
  const { data: soLines } = await supabase
    .from('sale_order_lines')
    .select('item_name, sku, brand_variant_id, unit_price, qty')
    .eq('sale_order_id', ret.source_id)
  const soLineArr = (soLines ?? []) as Array<{ item_name: string; sku: string | null; brand_variant_id: string | null; unit_price: number; qty: number }>

  // 2. Fetch linked invoice
  const { data: inv } = await supabase
    .from('so_invoices')
    .select('id, invoice_id, total_amount')
    .eq('sale_order_id', ret.source_id)
    .maybeSingle()

  // 3. Fetch customer id + name from SO
  const { data: soData } = await supabase
    .from('sale_orders')
    .select('customer_id, customers(name)')
    .eq('id', ret.source_id)
    .single()
  const customerId: string | null = (soData as { customer_id?: string | null } | null)?.customer_id ?? null
  const customerName: string = (soData?.customers as { name?: string } | null)?.name ?? 'Unknown'

  // 4. Build returned lines — resolve unit price from SO lines
  const returnedLines = ret.return_lines.map((item) => {
    const soLine = soLineArr.find(
      (l) =>
        (item.brand_variant_id && l.brand_variant_id === item.brand_variant_id) ||
        (item.sku && l.sku === item.sku) ||
        l.item_name === item.item_name
    )
    const unitPrice = soLine?.unit_price ?? 0
    return {
      item_name:  item.item_name,
      sku:        item.sku ?? null,
      qty:        item.qty,
      unit_price: unitPrice,
      total:      item.qty * unitPrice,
    }
  })

  // 5. Build original lines from SO — one row per ordered SO line at the
  // invoiced qty × unit_price so the CN's "Original Items" section reflects
  // what the customer was billed for before the return.
  const originalLines = soLineArr.map((l) => ({
    item_name:  l.item_name,
    sku:        l.sku ?? null,
    qty:        l.qty,
    unit_price: l.unit_price,
    total:      l.qty * l.unit_price,
  }))

  const cnTotal = returnedLines.reduce((s, l) => s + l.total, 0)
  // Prefer the invoice's total when available; fall back to the sum of the
  // SO lines so return-only flows (no invoice) still populate the header.
  const originalTotal = inv?.total_amount ?? originalLines.reduce((s, l) => s + l.total, 0)
  const newTotal = originalTotal - cnTotal

  const credit_note_id = await nextNoteId('credit')

  const { data: cn, error: cnErr } = await supabase
    .from('credit_notes')
    .insert({
      credit_note_id,
      invoice_id:       inv?.id ?? null,
      customer_id:      customerId,
      customer_name:    customerName,
      source_return_id: returnId,
      reason:           ret.reason,
      status:           'open',
      total_amount:     cnTotal,
      original_total:   originalTotal,
      new_total:        newTotal,
    })
    .select('id')
    .single()
  if (cnErr) throw cnErr

  const lineRows = [
    ...originalLines.map((l) => ({
      credit_note_id: cn.id,
      description:    l.item_name,
      sku:            l.sku ?? null,
      qty:            l.qty,
      unit_price:     l.unit_price,
      line_type:      'original' as const,
    })),
    ...returnedLines.map((l) => ({
      credit_note_id: cn.id,
      description:    l.item_name,
      sku:            l.sku ?? null,
      qty:            l.qty,
      unit_price:     l.unit_price,
      line_type:      'returned' as const,
    })),
  ]
  if (lineRows.length > 0) {
    const { error: linesErr } = await supabase
      .from('credit_note_lines')
      .insert(lineRows)
    if (linesErr) throw linesErr
  }

  // 6. Link return → credit note
  await supabase
    .from('so_po_returns')
    .update({ credit_note_id: cn.id })
    .eq('id', returnId)
}

export function useUpdateReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SaleReturn['status'] }) => {
      const supabase = createClient()

      const { data: ret, error: fetchErr } = await supabase
        .from('so_po_returns')
        .select('source_id, return_number, reason, return_lines(*)')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      const { error } = await supabase
        .from('so_po_returns')
        .update({ status })
        .eq('id', id)
      if (error) throw error

      if (status === 'restocked') {
        const { error: rpcError } = await supabase
          .rpc('rpc_process_return_restock', { p_return_id: id })
        if (rpcError) throw rpcError

        // Auto-create credit note
        await createCreditNoteForReturn(supabase, id, { ...ret, return_lines: (ret.return_lines ?? []) as NonNullable<SaleReturn['return_lines']> })
      }

      return ret as { source_id: string; return_number: string; return_lines: NonNullable<SaleReturn['return_lines']>; reason: string }
    },
    onSuccess: (ret, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.bySo })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      if (variables.status === 'restocked') {
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
        queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
      }
      const label: Record<SaleReturn['status'], string> = {
        pending:            'Return Marked Pending',
        pending_inspection: 'Return Pending Inspection',
        received:           'Return Received',
        restocked:          'Return Restocked',
        closed:             'Return Closed',
        cancelled:          'Return Cancelled',
      }
      logActivity({
        action:    label[variables.status],
        module:    'sale_orders',
        entity_id: ret.source_id,
        details:   ret.return_number,
        severity:  variables.status === 'restocked' ? 'info' : 'info',
      })
    },
  })
}

export function useReturnsBySO(soId: string | null) {
  return useQuery({
    queryKey: queryKeys.saleReturns.bySoId(soId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('so_po_returns')
        .select('*, return_lines(*)')
        .eq('source_type', 'sale_order')
        .eq('source_id', soId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data ?? []
      // Batch-fetch full credit note objects so the dialog can open inline
      const noteIds = rows.map((r) => (r as Record<string, unknown>).credit_note_id as string | null).filter(Boolean) as string[]
      const noteMap: Record<string, Record<string, unknown>> = {}
      if (noteIds.length > 0) {
        const { data: notes } = await supabase
          .from('credit_notes')
          .select('*')
          .in('id', noteIds)
        for (const n of (notes ?? [])) noteMap[n.id] = n
      }
      return rows.map((r) => {
        const row = r as Record<string, unknown>
        return {
          ...r,
          credit_note: row.credit_note_id ? (noteMap[row.credit_note_id as string] ?? null) : null,
        }
      }) as unknown as SaleReturn[]
    },
    enabled: !!soId,
    staleTime: 30 * 1000,
  })
}

export function useCreateCreditNoteForReturn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ret: SaleReturn) => {
      const supabase = createClient()
      await createCreditNoteForReturn(supabase, ret.id, {
        source_id:     ret.source_id,
        return_number: ret.return_number,
        return_lines:  ret.return_lines ?? [],
        reason:        ret.reason,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.bySo })
      queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
    },
  })
}

// Per-variant × per-warehouse delivered totals for a sale order.
// Used by CreateReturnDialog to show "you shipped 5 from Birkat + 3 from
// Industrial" so the operator knows the constraint on what can be returned.
export type DeliveryBreakdownRow = {
  brand_variant_id: string
  warehouse_id: string
  warehouse_name: string
  qty_delivered: number
}

export function useDeliveryBreakdownBySO(soId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.saleReturns.all, 'delivery-breakdown', soId] as const,
    enabled: !!soId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<DeliveryBreakdownRow[]> => {
      const supabase = createClient()
      // Join sale_delivery_lines → sale_deliveries → warehouses.
      // Only 'delivered' deliveries contribute (partials still-in-progress
      // shouldn't count against what can be returned).
      const { data, error } = await supabase
        .from('sale_delivery_lines')
        .select('brand_variant_id, qty_delivered, sale_deliveries!inner(warehouse_id, status, sale_order_id, warehouses(name))')
        .eq('sale_deliveries.sale_order_id', soId!)
        .eq('sale_deliveries.status', 'delivered')
      if (error) throw error

      const rows = (data ?? []) as unknown as Array<{
        brand_variant_id: string | null
        qty_delivered: number | null
        sale_deliveries: { warehouse_id: string; warehouses: { name: string } | null } | null
      }>

      // Aggregate by (variant, warehouse)
      const bucket = new Map<string, DeliveryBreakdownRow>()
      for (const r of rows) {
        if (!r.brand_variant_id || !r.sale_deliveries) continue
        const key = `${r.brand_variant_id}:${r.sale_deliveries.warehouse_id}`
        const prev = bucket.get(key)
        if (prev) {
          prev.qty_delivered += Number(r.qty_delivered ?? 0)
        } else {
          bucket.set(key, {
            brand_variant_id: r.brand_variant_id,
            warehouse_id: r.sale_deliveries.warehouse_id,
            warehouse_name: r.sale_deliveries.warehouses?.name ?? '—',
            qty_delivered: Number(r.qty_delivered ?? 0),
          })
        }
      }
      return Array.from(bucket.values())
    },
  })
}

// Completes an inspection return: replaces each inspection line with the
// physical good/damaged split, assigns restock warehouse, moves status
// pending_inspection → received. From there the normal restock flow runs.
export type InspectionSplit = {
  return_line_id: string
  good_qty: number
  damaged_qty: number
  condition_notes?: string | null
}

export function useCompleteReturnInspection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      returnId, splits, restockWarehouseId,
    }: {
      returnId: string
      splits: InspectionSplit[]
      restockWarehouseId: string
    }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_complete_return_inspection', {
        p_return_id: returnId,
        p_splits: splits as unknown as import('@/types/database.types').Json,
        p_restock_warehouse_id: restockWarehouseId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.bySo })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
    },
  })
}

export function useAssignWarehouseAndRestock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, warehouseId }: { id: string; warehouseId: string }) => {
      const supabase = createClient()

      const { error: whErr } = await supabase
        .from('so_po_returns')
        .update({ restock_warehouse_id: warehouseId })
        .eq('id', id)
      if (whErr) throw whErr

      const { data: ret, error: fetchErr } = await supabase
        .from('so_po_returns')
        .select('source_id, return_number, reason, return_lines(*)')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      const { error: statusErr } = await supabase
        .from('so_po_returns')
        .update({ status: 'restocked' })
        .eq('id', id)
      if (statusErr) throw statusErr

      const { error: rpcError } = await supabase
        .rpc('rpc_process_return_restock', { p_return_id: id })
      if (rpcError) throw rpcError

      await createCreditNoteForReturn(supabase, id, { ...ret, return_lines: (ret.return_lines ?? []) as NonNullable<SaleReturn['return_lines']> })

      return ret as { source_id: string; return_number: string; return_lines: NonNullable<SaleReturn['return_lines']>; reason: string }
    },
    onSuccess: (ret) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleReturns.bySo })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
      logActivity({
        action:    'Return Restocked',
        module:    'sale_orders',
        entity_id: ret.source_id,
        details:   ret.return_number,
        severity:  'info',
      })
    },
  })
}

export function useUnresolvedReturns(soId: string | null) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.saleReturns.unresolved(soId),
    enabled: !!soId,
    queryFn: async () => {
      // A return is "unresolved" when it has been restocked but not yet
      // closed via rpc_close_return. Once resolved, status flips to one
      // of resolved_credit / resolved_replacement / resolved_partial.
      const { data, error } = await supabase
        .from('so_po_returns')
        .select('*, return_lines(*)')
        .eq('source_type', 'sale_order')
        .eq('source_id', soId!)
        .eq('status', 'restocked')
        .is('deleted_at', null)

      if (error) throw error
      return (data ?? []) as unknown as SaleReturn[]
    },
    staleTime: 30_000,
  })
}

// ─── Phase 6 + Phase 7 progress views ─────────────────────────────────────
//
// Phase 7 rebuilt these views on top of two independent ledgers (customer +
// inventory). Phase 6 field names are preserved as backward-compat aliases
// pointing at the customer dimension; new dual-dimension fields are
// appended so callers can render both when the two ledgers diverge (e.g.
// damaged units under seller-fault reasons that still owe the customer a
// resolution but have already been dispositioned inventory-side).
//
// Drop the legacy aliases in Phase 8 once every reader has migrated.

export type ResolutionMix = Record<string, number> | null

export type ReturnLineProgress = {
  return_line_id:      string
  return_id:           string
  brand_variant_id:    string | null
  item_name:           string
  sku:                 string | null
  returned_qty:        number
  condition:           string
  customer_resolved_qty:          number
  customer_remaining_qty:         number
  /** null for non-damaged lines — inventory dimension only applies to damaged units. */
  inventory_resolved_qty:         number | null
  inventory_remaining_qty:        number
  customer_resolutions_by_type:   ResolutionMix
  inventory_dispositions_by_type: ResolutionMix
}

export type ReturnCoverageStatus = 'in_progress' | 'fully_resolved'
export type ReturnInventoryStatus = ReturnCoverageStatus | 'not_applicable'

export type ReturnProgress = {
  return_id:           string
  return_number:       string
  status:              string
  total_returned:      number
  customer_resolved:              number
  customer_remaining:             number
  total_damaged:                  number
  inventory_resolved:             number
  inventory_remaining:            number
  customer_resolutions_by_type:   ResolutionMix
  inventory_dispositions_by_type: ResolutionMix
  customer_status:                ReturnCoverageStatus
  inventory_status:               ReturnInventoryStatus
  overall_coverage_status:        ReturnCoverageStatus
  /** True when damaged units are fully dispositioned inventory-side but
   *  the customer received no matching compensation — bookkeeping flag
   *  for the "Compensation not recorded" chip in Sub-task 7.6. */
  compensation_missing:           boolean
}

export function useReturnLineProgress(returnId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: queryKeys.saleReturns.lineProgress(returnId),
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('return_line_progress')
        .select('*')
        .eq('return_id', returnId!)
      if (error) throw error
      return (data ?? []) as unknown as ReturnLineProgress[]
    },
    staleTime: 15_000,
  })
}

export function useReturnProgress(returnId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: queryKeys.saleReturns.progress(returnId),
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('return_progress')
        .select('*')
        .eq('return_id', returnId!)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as unknown as ReturnProgress | null
    },
    staleTime: 15_000,
  })
}
