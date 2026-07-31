import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type ReturnLineSourceInfo = {
  refNumber:        string
  warehouseId:      string
  warehouseName:    string
  subContainerName: string | null
}

/**
 * Batch-resolves provenance labels (ref number / warehouse / sub-container)
 * for a set of PO-side receival_item_ids and/or SO-side sale_delivery_line_ids.
 *
 * For SO-side entries where the cogs_entries.source_id chain is NULL (pre-D.3
 * deliveries), the hook falls back to the same (warehouse × division) derive
 * the restock RPC uses, so the UI shows what will actually be picked. Pass
 * `returnId` to enable that fallback.
 */
export function useReturnLineSources(
  receivalItemIds:     string[],
  saleDeliveryLineIds: string[],
  returnId?:           string | null,
) {
  return useQuery({
    queryKey: [
      'return-line-sources',
      receivalItemIds.slice().sort().join(','),
      saleDeliveryLineIds.slice().sort().join(','),
      returnId ?? '',
    ],
    enabled:  receivalItemIds.length > 0 || saleDeliveryLineIds.length > 0,
    queryFn:  async () => {
      const supabase = createClient()

      const receivalMap: Map<string, ReturnLineSourceInfo> = new Map()
      const deliveryMap: Map<string, ReturnLineSourceInfo> = new Map()

      if (receivalItemIds.length > 0) {
        const { data, error } = await supabase
          .from('receival_items')
          .select('id, sub_container_id, warehouse_sub_containers(name), receivals(receival_number, warehouse_id, warehouses(name))')
          .in('id', receivalItemIds)
        if (error) throw error
        type Row = {
          id:                        string
          sub_container_id:          string | null
          warehouse_sub_containers?: { name?: string | null } | null
          receivals?: {
            receival_number: string
            warehouse_id:    string
            warehouses?:     { name?: string | null } | null
          } | null
        }
        for (const row of (data ?? []) as unknown as Row[]) {
          receivalMap.set(row.id, {
            refNumber:        row.receivals?.receival_number ?? '—',
            warehouseId:      row.receivals?.warehouse_id ?? '',
            warehouseName:    row.receivals?.warehouses?.name ?? '—',
            subContainerName: row.warehouse_sub_containers?.name ?? null,
          })
        }
      }

      if (saleDeliveryLineIds.length > 0) {
        const { data, error } = await supabase
          .from('sale_delivery_lines')
          .select('id, sale_delivery_id, brand_variant_id, sale_deliveries(delivery_number, warehouse_id, warehouse_name)')
          .in('id', saleDeliveryLineIds)
        if (error) throw error

        type LineRow = {
          id:                string
          sale_delivery_id:  string
          brand_variant_id:  string | null
          sale_deliveries?:  { delivery_number: string; warehouse_id: string; warehouse_name: string } | null
        }
        const typed = (data ?? []) as unknown as LineRow[]

        // Primary: sub-container per delivery via cogs_entries.source_id → fifo_cost_layers
        const deliveryIds = Array.from(new Set(typed.map((r) => r.sale_delivery_id)))
        const subContainerByDelivery = new Map<string, string | null>()
        if (deliveryIds.length > 0) {
          const { data: cogs } = await supabase
            .from('cogs_entries')
            .select('sale_delivery_id, source_id, fifo_cost_layers(warehouse_sub_containers(name))')
            .in('sale_delivery_id', deliveryIds)
          type CogsRow = {
            sale_delivery_id: string
            fifo_cost_layers?: { warehouse_sub_containers?: { name?: string | null } | null } | null
          }
          for (const c of (cogs ?? []) as unknown as CogsRow[]) {
            const existing = subContainerByDelivery.get(c.sale_delivery_id)
            if (existing) continue
            const name = c.fifo_cost_layers?.warehouse_sub_containers?.name ?? null
            if (name) subContainerByDelivery.set(c.sale_delivery_id, name)
          }
        }

        // Fallback (mirrors rpc_process_return_restock's pre-D.3 branch):
        // for any delivery without a sub-container from cogs, resolve via
        // (warehouse, division-cascade) → first active warehouse_sub_containers row.
        // Division cascade: return.division_id → sale_orders.division_id → warehouses.division_id.
        const unresolvedDeliveryIds = deliveryIds.filter((id) => !subContainerByDelivery.get(id))
        if (unresolvedDeliveryIds.length > 0 && returnId) {
          const { data: ret } = await supabase
            .from('so_po_returns')
            .select('division_id, source_id')
            .eq('id', returnId)
            .maybeSingle()

          let fallbackDivision: string | null = ret?.division_id ?? null

          if (!fallbackDivision && ret?.source_id) {
            const { data: so } = await supabase
              .from('sale_orders')
              .select('division_id')
              .eq('id', ret.source_id)
              .maybeSingle()
            fallbackDivision = so?.division_id ?? null
          }

          const warehouseByDelivery = new Map<string, string>()
          for (const t of typed) {
            if (unresolvedDeliveryIds.includes(t.sale_delivery_id) && t.sale_deliveries?.warehouse_id) {
              warehouseByDelivery.set(t.sale_delivery_id, t.sale_deliveries.warehouse_id)
            }
          }

          for (const deliveryId of unresolvedDeliveryIds) {
            const wh = warehouseByDelivery.get(deliveryId)
            if (!wh) continue

            let divisionForThisWh: string | null = fallbackDivision
            if (!divisionForThisWh) {
              const { data: w } = await supabase
                .from('warehouses')
                .select('division_id')
                .eq('id', wh)
                .maybeSingle()
              divisionForThisWh = w?.division_id ?? null
            }

            if (!divisionForThisWh) continue

            const { data: subContainers } = await supabase
              .from('warehouse_sub_containers')
              .select('name')
              .eq('warehouse_id', wh)
              .eq('division_id', divisionForThisWh)
              .eq('is_active', true)
              .order('created_at', { ascending: true })
              .limit(1)
            const scName = (subContainers ?? [])[0]?.name ?? null
            if (scName) subContainerByDelivery.set(deliveryId, scName)
          }
        }

        for (const row of typed) {
          deliveryMap.set(row.id, {
            refNumber:        row.sale_deliveries?.delivery_number ?? '—',
            warehouseId:      row.sale_deliveries?.warehouse_id ?? '',
            warehouseName:    row.sale_deliveries?.warehouse_name ?? '—',
            subContainerName: subContainerByDelivery.get(row.sale_delivery_id) ?? null,
          })
        }
      }

      return { receival: receivalMap, delivery: deliveryMap }
    },
    staleTime: 60_000,
  })
}
