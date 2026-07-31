/**
 * Phase 9.6 — Send Damaged for Repair follow-up RPC hook.
 *
 * Called after a `send_for_repair` disposition has been recorded (via the
 * ReplacementDeliveryDialog or Record Inventory Disposition action) to link
 * the disposition to a repair vendor and produce the outbound damaged-repair
 * transfer. See flow "Send Damaged for Repair" in docs/flows-registry.md.
 *
 * Return-from-repair (`rpc_return_damaged_from_repair`) is exposed via a
 * separate hook in 9.7 when the Damaged Stock overview + ReturnFromRepairDialog
 * land.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type SendForRepairPayload = {
  dispositionId:       string
  repairVendorId:      string
  warehouseId:         string
  expectedReturnDate:  string   // ISO date (YYYY-MM-DD)
  notes?:              string | null
  /** Passed only for cache-invalidation scope. Not sent to the RPC. */
  returnId?:           string | null
}

export function useSendDamagedForRepair() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SendForRepairPayload) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_send_damaged_for_repair', {
        p_return_line_disposition_id: payload.dispositionId,
        p_repair_vendor_id:           payload.repairVendorId,
        p_warehouse_id:               payload.warehouseId,
        p_expected_return_date:       payload.expectedReturnDate,
        p_notes:                      payload.notes ?? null,
      })
      if (error) throw error
      return data as unknown as string  // new warehouse_transfers.id
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.all })
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.movementsAll })
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.outForRepairAll })
      qc.invalidateQueries({ queryKey: queryKeys.damagedStock.pendingRepairAssignmentAll })
      qc.invalidateQueries({ queryKey: queryKeys.warehouseOps.warehouseTransfers })
      if (variables.returnId) {
        qc.invalidateQueries({ queryKey: queryKeys.saleReturns.progress(variables.returnId) })
        qc.invalidateQueries({ queryKey: queryKeys.saleReturns.lineProgress(variables.returnId) })
      }
    },
  })
}
