/**
 * Warehouse Model v2 — Phase F.
 *
 * Queues a damaged-pile writeoff for approval. Wraps
 * `rpc_request_damaged_writeoff`, which creates a stock_adjustments row
 * with source_pile='damaged' + adjustment_type='write_off' and status
 * 'pending_approval', and builds the standard 'stock_adj' approval chain.
 *
 * On approve, `approve_stock_adjustment_inventory` (Phase F extension)
 * consumes from `inventory_damaged_stock` and logs a `damaged_write_off`
 * movement. No FIFO deduct.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type RequestDamagedWriteoffPayload = {
  warehouseId:      string
  brandVariantId:   string
  qty:              number
  subContainerId:   string
  reason:           string
  notes?:           string | null
  requestedBy:      string  // user_data.id
  requestedByName:  string
}

export function useRequestDamagedWriteoff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RequestDamagedWriteoffPayload) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_request_damaged_writeoff', {
        p_warehouse_id:       payload.warehouseId,
        p_brand_variant_id:   payload.brandVariantId,
        p_qty:                payload.qty,
        p_sub_container_id:   payload.subContainerId,
        p_reason:             payload.reason,
        p_notes:              payload.notes ?? '',
        p_requested_by:       payload.requestedBy,
        p_requested_by_name:  payload.requestedByName,
      })
      if (error) throw error
      return data as unknown as string  // new stock_adjustments.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.stockAdjustments })
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.all })
    },
  })
}
