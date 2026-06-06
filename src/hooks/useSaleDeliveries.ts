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
}

export type SaleDelivery = {
  id: string
  delivery_number: string
  sale_order_id: string
  warehouse_id: string | null
  warehouse_name: string | null
  date: string
  items: DeliveryItem[]
  status: DeliveryStatus | null
  created_by_name: string | null
  created_at: string
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
        .select('*, sale_orders(so_number, customers(name))')
        .order('created_at', { ascending: false })
      if (filters?.status) q = q.eq('status', filters.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []).map((d: any) => ({
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all }),
  })
}

export function useCompleteDelivery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      deliveryId,
      soId,
      invoiceId,
      remainingItems,
    }: {
      deliveryId: string
      soId: string
      invoiceId: string | null
      remainingItems: DeliveryItem[]
    }) => {
      const supabase = createClient()

      // Single atomic RPC: marks delivered + deducts FIFO + writes COGS + movements
      const { error } = await supabase
        .rpc('complete_delivery_inventory', { p_delivery_id: deliveryId, p_so_id: soId })
      if (error) throw new Error(error.message)

      // Invoice update (non-inventory concern)
      if (invoiceId) {
        const { data: inv } = await supabase
          .from('invoices')
          .select('needs_refresh, doc_status')
          .eq('id', invoiceId)
          .single()
        if (inv && !inv.needs_refresh && inv.doc_status === 'draft') {
          await supabase
            .from('invoices')
            .update({ doc_status: 'ready_to_send' })
            .eq('id', invoiceId)
        }
      }

      // Create follow-up delivery stub for remaining items (partial delivery)
      if (remainingItems.length > 0) {
        const { data: orig } = await supabase
          .from('sale_deliveries')
          .select('sale_order_id')
          .eq('id', deliveryId)
          .single()
        if (orig) {
          const { count } = await supabase
            .from('sale_deliveries')
            .select('*', { count: 'exact', head: true })
          const delivery_number = `DEL-${String((count ?? 0) + 1).padStart(5, '0')}`
          await supabase.from('sale_deliveries').insert({
            delivery_number,
            sale_order_id: orig.sale_order_id,
            warehouse_id: null,
            date: new Date().toISOString().split('T')[0],
            items: remainingItems,
            status: 'pending',
          })
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saleDeliveries.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
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
