/**
 * Warehouse Model v2 — Phase F.
 *
 * Ad-hoc "Send for Repair" from the Damaged Stock On-hand tab. Unlike
 * `useSendDamagedForRepair` (which requires a return-line disposition),
 * this fires against a bare (warehouse, variant, qty) plus operator picks
 * (vendor, source division, expected return date).
 *
 * Calls `rpc_send_damaged_stock_for_repair`. Returns the new
 * warehouse_transfers.id.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type SendDamagedStockForRepairPayload = {
  warehouseId:        string
  brandVariantId:     string
  qty:                number
  repairVendorId:     string
  expectedReturnDate: string  // ISO date (YYYY-MM-DD)
  sourceDivisionId:   string
  notes?:             string | null
}

export function useSendDamagedStockForRepair() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SendDamagedStockForRepairPayload) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_send_damaged_stock_for_repair', {
        p_warehouse_id:         payload.warehouseId,
        p_brand_variant_id:     payload.brandVariantId,
        p_qty:                  payload.qty,
        p_repair_vendor_id:     payload.repairVendorId,
        p_expected_return_date: payload.expectedReturnDate,
        p_source_division_id:   payload.sourceDivisionId,
        p_notes:                payload.notes ?? undefined,
      })
      if (error) throw error
      return data as unknown as string  // new warehouse_transfers.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.all })
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.movementsAll })
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.outForRepairAll })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
    },
  })
}
