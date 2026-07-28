// src/hooks/useSaleDeliveries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { queryKeys } from '@/lib/queryKeys'

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
}

export function useSaleDeliveries(filters?: { status?: DeliveryStatus | '' }) {
  return useQuery({
    queryKey: queryKeys.saleDeliveries.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('sale_deliveries')
        .select('*, sale_delivery_lines(*), sale_orders(so_number, customers(name))')
        .order('created_at', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      const { data, error } = await q.limit(500)
      if (error) throw error
      return (data ?? []).map((d) => ({
        ...d,
        so_number: d.sale_orders?.so_number ?? null,
        customer_name: d.sale_orders?.customers?.name ?? null,
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
      remainingItems,
    }: {
      deliveryId: string
      soId: string
      remainingItems: DeliveryItem[]
    }) => {
      const supabase = createClient()

      // Single atomic RPC: marks delivered + deducts FIFO + writes COGS + movements
      const { error } = await supabase
        .rpc('complete_delivery_inventory', { p_delivery_id: deliveryId, p_so_id: soId })
      if (error) throw new Error(error.message)

      // Create follow-up delivery stub for remaining items (partial delivery)
      if (remainingItems.length > 0) {
        const { data: orig } = await supabase
          .from('sale_deliveries')
          .select('sale_order_id')
          .eq('id', deliveryId)
          .single()
        if (orig) {
          const { data: seqRow } = await supabase.rpc('next_delivery_number')
          const delivery_number = (seqRow as unknown as string) ?? `DEL-${Date.now()}`
          const { data: newDel, error: newDelErr } = await supabase.from('sale_deliveries').insert({
            delivery_number,
            sale_order_id: orig.sale_order_id,
            warehouse_id: null,
            date: new Date().toISOString().split('T')[0],
            status: 'pending',
          }).select('id').single()
          if (newDelErr) throw newDelErr
          if (newDel && remainingItems.length > 0) {
            const { error: linesErr } = await supabase.from('sale_delivery_lines').insert(
              remainingItems.map((li) => ({
                sale_delivery_id: newDel.id,
                brand_variant_id: li.brand_variant_id,
                item_name: li.item_name,
                sku: li.sku,
                qty_delivered: li.qty_delivered,
              }))
            )
            if (linesErr) throw linesErr
          }
        }
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      // saleOrders.detail uses ['sale-order', id] (singular) — .all won't cover it.
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(variables.soId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.inventoryBrandVariants })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.fifoLayers })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stockMovements })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.cogsEntries })
      queryClient.invalidateQueries({ queryKey: queryKeys.activityLog.all })
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
      const { data, error } = await supabase
        .from('sale_deliveries')
        .select('id, delivery_number, status, date')
        .eq('return_id', returnId!)
        .maybeSingle()
      if (error) throw error
      return data
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
    }) => {
      // Delegate everything to the atomic RPC — creates sale_deliveries +
      // sale_delivery_lines + return_line_resolutions in one transaction and
      // auto-closes the return when total_remaining hits 0. Replaces the
      // hand-rolled client-side sequence that produced DEL-00004 orphans.
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
    },
  })
}

/** Writes off any damaged return_lines with remaining_qty > 0 as
 *  inventory_stock_movements(type='sale_return_damaged') + ledger rows.
 *  Idempotent — safe to call repeatedly. */
export function useWriteOffDamagedReturn() {
  const qc = useQueryClient()
  const supabase = createClient()
  return useMutation({
    mutationFn: async (input: { returnId: string; warehouseId: string }) => {
      const { data, error } = await supabase.rpc('rpc_write_off_return_damaged', {
        p_return_id: input.returnId,
        p_warehouse_id: input.warehouseId,
      })
      if (error) throw error
      return data as unknown as number  // count of lines written off
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
