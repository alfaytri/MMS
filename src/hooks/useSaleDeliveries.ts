// src/hooks/useSaleDeliveries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { queryKeys } from '@/lib/queryKeys'
import { openWarrantyCertificate, deliveryHasWarrantyRecords } from '@/lib/sales/warranty-certificate'
import { notifyOwnerAndKey } from '@/lib/notify'

export type DeliveryStatus = 'pending' | 'in_progress' | 'delivered' | 'cancelled'

export type DeliveryItem = {
  item_name: string
  sku: string | null
  qty_delivered: number
  brand_variant_id: string | null
  is_gift?: boolean
}

export type SaleDelivery = {
  id: string
  delivery_number: string
  sale_order_id: string
  warehouse_id: string | null
  warehouse_name: string | null
  date: string
  sale_delivery_lines?: DeliveryItem[]
  status: DeliveryStatus | null
  created_by_name: string | null
  created_at: string
  type: 'standard' | 'replacement'
  return_id: string | null
  source_credit_note_id: string | null
  // joined
  so_number?: string
  customer_name?: string
  division_id?: string | null
}

export function useSaleDeliveries(filters?: { status?: DeliveryStatus | '' }) {
  return useQuery({
    queryKey: queryKeys.saleDeliveries.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('sale_deliveries')
        .select('*, sale_delivery_lines(*), sale_orders(so_number, division_id, customers(name))')
        .order('created_at', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      const { data, error } = await q.limit(500)
      if (error) throw error
      return (data ?? []).map((d) => ({
        ...d,
        so_number: d.sale_orders?.so_number ?? null,
        customer_name: d.sale_orders?.customers?.name ?? null,
        division_id: d.sale_orders?.division_id ?? null,
      })) as SaleDelivery[]
    },
  })
}

export function useUpdateDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      items: lineItems,
      ...updates
    }: {
      id: string
      warehouse_id?: string
      warehouse_name?: string
      date?: string
      items?: DeliveryItem[]
      status?: DeliveryStatus
    }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('sale_deliveries')
        .update(updates)
        .eq('id', id)
      if (error) throw error

      // If line items were provided, replace them in sale_delivery_lines
      if (lineItems) {
        const { error: delErr } = await supabase
          .from('sale_delivery_lines')
          .delete()
          .eq('sale_delivery_id', id)
        if (delErr) throw delErr
        if (lineItems.length > 0) {
          const { error: insErr } = await supabase
            .from('sale_delivery_lines')
            .insert(lineItems.map((li) => ({
              sale_delivery_id: id,
              brand_variant_id: li.brand_variant_id,
              item_name: li.item_name,
              sku: li.sku,
              qty_delivered: li.qty_delivered,
            })))
          if (insErr) throw insErr
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      // saleOrders.detail is ['sale-order', id]; root prefix covers all IDs.
      queryClient.invalidateQueries({ queryKey: ['sale-order'] })
    },
  })
}

export function useCompleteDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      deliveryId,
      soId,
      subContainerId,
      remainingItems,
    }: {
      deliveryId: string
      soId: string
      subContainerId?: string | null
      remainingItems: DeliveryItem[]
    }) => {
      const supabase = createClient()

      // H15: single wrapper RPC does complete_delivery_inventory +
      // follow-up partial-delivery stub in one transaction. Previously the
      // stub was a client-side follow-up — a failure between the two left
      // inventory deducted with no stub. See migration 20260806170000.
      const { error } = await supabase.rpc('rpc_complete_delivery_with_followup', {
        p_delivery_id:      deliveryId,
        p_so_id:            soId,
        p_sub_container_id: subContainerId ?? undefined,
        p_remaining_items:  remainingItems.length > 0
          ? (remainingItems.map((li) => ({
              brand_variant_id: li.brand_variant_id,
              item_name:        li.item_name,
              sku:              li.sku,
              qty_delivered:    li.qty_delivered,
            })) as unknown as import('@/types/database.types').Json)
          : undefined,
      })
      if (error) {
        throw new Error(
          `Complete delivery failed: ${error.code} ${error.message}` +
          `${error.details ? ' — ' + error.details : ''}` +
          `${error.hint ? ' (' + error.hint + ')' : ''}`,
        )
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      // saleOrders.detail uses ['sale-order', id] (singular) — .all won't cover it.
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(variables.soId) })
      // Notify the SO owner their delivery was completed (best-effort).
      void (async () => {
        const supabase = createClient()
        const { data: so } = await supabase
          .from('sale_orders').select('created_by, so_number').eq('id', variables.soId).maybeSingle()
        await notifyOwnerAndKey(
          so?.created_by ?? null,
          'notify.sales.delivery_completed',
          'delivery_completed',
          `Delivery completed for SO ${so?.so_number ?? ''}`.trim(),
          { relatedId: variables.soId, relatedType: 'sale_order' },
        )
      })()
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.inventoryBrandVariants })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.cogsEntries })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      // Record the completed delivery on the SO's activity feed (the cancel
      // path already logs; completion previously did not, so delivered lines
      // never showed under the SO Activity tab).
      logActivity({
        action:    'Delivery Completed',
        module:    'sale_orders',
        entity_id: variables.soId,
      })
      // Auto-open the warranty certificate when this delivery produced any
      // warranty records (any covered item). Fire-and-forget + non-fatal: a
      // failure or a blocked pop-up never affects the completion itself, and
      // the manual "Print Warranty Certificate" button remains as a fallback.
      void (async () => {
        try {
          if (await deliveryHasWarrantyRecords(variables.deliveryId)) {
            await openWarrantyCertificate(variables.deliveryId)
          }
        } catch { /* non-fatal */ }
      })()
    },
  })
}

export function useCancelDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, soId }: { id: string; soId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .rpc('cancel_delivery_inventory', {
          p_delivery_id: id,
          p_so_id:       soId,
        })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(variables.soId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.inventoryBrandVariants })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.cogsEntries })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
      logActivity({
        action:    'Delivery Cancelled',
        module:    'sale_orders',
        entity_id: variables.soId,
        severity:  'warning',
      })
    },
  })
}

export function useDeliveryByReturnId(returnId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: queryKeys.saleDeliveries.byReturnId(returnId),
    enabled: !!returnId,
    queryFn: async () => {
      // A return may now have multiple replacement deliveries (post-Sub-task 6.5
      // partial replacements). Return the most recent one for the legacy single-chip
      // callers; use useDeliveriesByReturnId if you need the full list.
      const { data, error } = await supabase
        .from('sale_deliveries')
        .select('id, delivery_number, status, date')
        .eq('return_id', returnId!)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    staleTime: 30_000,
  })
}

export function useDeliveriesByReturnId(returnId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: [...queryKeys.saleDeliveries.byReturnId(returnId), 'list'],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sale_deliveries')
        .select('id, delivery_number, status, date')
        .eq('return_id', returnId!)
        .order('date', { ascending: true })
      if (error) throw error
      return (data ?? []) as Array<{ id: string; delivery_number: string; status: string; date: string }>
    },
    staleTime: 30_000,
  })
}

/** Line shape for the RPC — one row per return_line we're covering. */
export type PartialReplacementLine = {
  return_line_id:    string
  qty:               number
  brand_variant_id:  string | null
  item_name:         string
  sku:               string | null
}

/** Phase 7 — per-damaged-line disposition decision passed alongside a
 *  replacement (or on its own via useRecordInventoryDisposition). Only
 *  `write_off` is fully implemented today; the other two are Phase 8/9. */
export type ReturnDispositionType = 'write_off' | 'restock_as_damaged' | 'send_for_repair'

export type ReturnLineDisposition = {
  return_line_id: string
  type:           ReturnDispositionType
  qty:            number
  transfer_id?:   string | null
}

export function useCreateReplacementDelivery() {
  const qc = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async (input: {
      soId: string
      returnId: string
      warehouseId: string
      lines: PartialReplacementLine[]
      giftItems?: { item_name: string; sku: string | null; qty: number; brand_variant_id: string | null }[]
      dispositions?: ReturnLineDisposition[]
    }) => {
      // Delegate everything to the atomic RPC — creates sale_deliveries +
      // sale_delivery_lines + customer_resolution rows, plus optional
      // inventory_disposition rows for damaged lines on the same call.
      // Auto-closes the return when BOTH dimensions hit 0.
      const { data, error } = await supabase.rpc('rpc_create_partial_replacement', {
        p_return_id: input.returnId,
        p_warehouse_id: input.warehouseId,
        p_lines: input.lines as unknown as never,
        p_gift_items: (input.giftItems ?? []).map((g) => ({
          return_line_id: null,
          brand_variant_id: g.brand_variant_id,
          item_name: g.item_name,
          sku: g.sku,
          qty: g.qty,
        })) as unknown as never,
        p_dispositions: (input.dispositions ?? []) as unknown as never,
      })
      if (error) throw error
      return data as unknown as string  // new sale_delivery id
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all })
      qc.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      qc.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(variables.soId) })
      qc.invalidateQueries({ queryKey: queryKeys.saleReturns.all })
      qc.invalidateQueries({ queryKey: queryKeys.saleReturns.bySo })
      qc.invalidateQueries({ queryKey: queryKeys.saleReturns.progress(variables.returnId) })
      qc.invalidateQueries({ queryKey: queryKeys.saleReturns.lineProgress(variables.returnId) })
      qc.invalidateQueries({ queryKey: queryKeys.creditNotes.all })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
    },
  })
}

/** Phase 7 — after-the-fact inventory disposition for damaged returns.
 *  Wraps rpc_record_inventory_disposition. Only `write_off` fully
 *  implemented; other types raise "not yet implemented" server-side. */
export function useRecordInventoryDisposition() {
  const qc = useQueryClient()
  const supabase = createClient()
  return useMutation({
    mutationFn: async (input: {
      returnId:     string
      warehouseId:  string
      dispositions: ReturnLineDisposition[]
    }) => {
      const { data, error } = await supabase.rpc('rpc_record_inventory_disposition', {
        p_return_id:    input.returnId,
        p_warehouse_id: input.warehouseId,
        p_dispositions: input.dispositions as unknown as never,
      })
      if (error) throw error
      return data as unknown as number  // count of dispositions processed
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.saleReturns.all })
      qc.invalidateQueries({ queryKey: queryKeys.saleReturns.bySo })
      qc.invalidateQueries({ queryKey: queryKeys.saleReturns.progress(variables.returnId) })
      qc.invalidateQueries({ queryKey: queryKeys.saleReturns.lineProgress(variables.returnId) })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
    },
  })
}

