import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { nextNoteId } from '@/hooks/useCreditNotes'

export type SaleReturn = {
  id: string
  return_number: string
  source_type: 'sale_order'
  source_id: string
  date: string
  reason: string
  items: {
    item_name: string
    sku: string | null
    qty: number
    condition: 'good' | 'damaged'
    brand_variant_id: string | null
  }[]
  restock_warehouse_id: string | null
  notes: string | null
  status: 'pending' | 'received' | 'restocked' | 'closed' | 'cancelled'
  credit_note_id: string | null
  credit_note?: import('@/hooks/useCreditNotes').CreditNote | null  // full object for inline detail view
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export function useSaleReturns(filters: { search?: string; status?: string } = {}) {
  return useQuery({
    queryKey: ['sale-returns', filters],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'sale_order')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filters.status) q = q.eq('status', filters.status)
      if (filters.search) {
        const safe = filters.search.replace(/%/g, '\\%')
        q = q.ilike('return_number', `%${safe}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as SaleReturn[]
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
      items: SaleReturn['items']
      restock_warehouse_id: string | null
      notes: string | null
    }) => {
      const supabase = createClient()

      // Generate return number
      const { count } = await (supabase as any)
        .from('returns')
        .select('*', { count: 'exact', head: true })
        .eq('source_type', 'sale_order')
      const return_number = `SR-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data, error } = await (supabase as any)
        .from('returns')
        .insert({
          return_number,
          source_type: 'sale_order',
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
      return data as SaleReturn
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sale-returns-by-so'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      const damagedCount = data.items.filter((i) => i.condition === 'damaged').reduce((s, i) => s + i.qty, 0)
      const goodCount    = data.items.filter((i) => i.condition === 'good').reduce((s, i) => s + i.qty, 0)
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
  supabase: any,
  returnId: string,
  ret: { source_id: string; return_number: string; items: any[]; reason: string }
) {
  // 1. Fetch SO lines for unit price lookup
  const { data: soLines } = await supabase
    .from('sale_order_lines')
    .select('item_name, sku, brand_variant_id, unit_price')
    .eq('sale_order_id', ret.source_id)
  const soLineArr: any[] = soLines ?? []

  // 2. Fetch linked invoice
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_id, total_amount')
    .eq('sale_order_id', ret.source_id)
    .eq('direction', 'outgoing')
    .maybeSingle()

  // 3. Fetch customer name from SO
  const { data: soData } = await supabase
    .from('sale_orders')
    .select('customers(name)')
    .eq('id', ret.source_id)
    .single()
  const customerName: string = (soData?.customers as any)?.name ?? 'Unknown'

  // 4. Build returned lines — resolve unit price from SO lines
  const returnedLines = ret.items.map((item: any) => {
    const soLine = soLineArr.find(
      (l: any) =>
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

  // 5. Build original lines from SO
  const originalLines = soLineArr.map((l: any) => ({
    item_name:  l.item_name,
    sku:        l.sku ?? null,
    qty:        0,
    unit_price: l.unit_price,
    total:      0,
  }))

  const cnTotal = returnedLines.reduce((s: number, l: any) => s + l.total, 0)
  const originalTotal = inv?.total_amount ?? 0
  const newTotal = originalTotal - cnTotal

  const credit_note_id = await nextNoteId('credit')
  const pdfData = { original_lines: originalLines, returned_lines: returnedLines }

  const { data: cn, error: cnErr } = await supabase
    .from('credit_notes')
    .insert({
      credit_note_id,
      note_type:        'credit',
      invoice_id:       inv?.id ?? null,
      customer_name:    customerName,
      source_return_id: returnId,
      reason:           ret.reason,
      type:             'auto',
      status:           'issued',
      total_amount:     cnTotal,
      original_total:   originalTotal,
      new_total:        newTotal,
      line_items:       pdfData,
    })
    .select('id')
    .single()
  if (cnErr) throw cnErr

  // 6. Link return → credit note
  await supabase
    .from('returns')
    .update({ credit_note_id: cn.id })
    .eq('id', returnId)
}

export function useUpdateReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SaleReturn['status'] }) => {
      const supabase = createClient()

      const { data: ret, error: fetchErr } = await (supabase as any)
        .from('returns')
        .select('source_id, return_number, items, reason')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      const { error } = await (supabase as any)
        .from('returns')
        .update({ status })
        .eq('id', id)
      if (error) throw error

      if (status === 'restocked') {
        const { error: rpcError } = await (supabase as any)
          .rpc('rpc_process_return_restock', { p_return_id: id })
        if (rpcError) throw rpcError

        // Auto-create credit note
        await createCreditNoteForReturn(supabase as any, id, ret)
      }

      return ret as { source_id: string; return_number: string; items: any[]; reason: string }
    },
    onSuccess: (ret, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sale-returns-by-so'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      if (variables.status === 'restocked') {
        queryClient.invalidateQueries({ queryKey: ['brand-variants-v2'] })
        queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      }
      const label: Record<SaleReturn['status'], string> = {
        pending:   'Return Marked Pending',
        received:  'Return Received',
        restocked: 'Return Restocked',
        closed:    'Return Closed',
        cancelled: 'Return Cancelled',
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
    queryKey: ['sale-returns-by-so', soId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('returns')
        .select('*')
        .eq('source_type', 'sale_order')
        .eq('source_id', soId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data ?? []
      // Batch-fetch full credit note objects so the dialog can open inline
      const noteIds = rows.map((r: any) => r.credit_note_id).filter(Boolean)
      let noteMap: Record<string, any> = {}
      if (noteIds.length > 0) {
        const { data: notes } = await (supabase as any)
          .from('credit_notes')
          .select('*')
          .in('id', noteIds)
        for (const n of (notes ?? [])) noteMap[n.id] = n
      }
      return rows.map((r: any) => ({
        ...r,
        credit_note: r.credit_note_id ? (noteMap[r.credit_note_id] ?? null) : null,
      })) as SaleReturn[]
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
        items:         ret.items,
        reason:        ret.reason,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns-by-so'] })
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
    },
  })
}
