import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toDbError } from './useToolAssignments'

/**
 * Tool repair lifecycle (Operations → Tools & Assets, Phase 2 rework):
 *   send-to-bucket  → collect a team's tool (status=maintenance, awaiting vendor)
 *   send-for-repair → dispatch a bucket tool to a vendor (damaged_repair_out transfer)
 *   return-from-repair → usable (back to a store, Repaired) | writeoff (retire + scrap→P&L)
 *   resolve-repair (Phase 2) → direct Scrap from the bucket (rpc_resolve_tool_repair)
 * All go through the SECURITY DEFINER RPCs in migrations 20260922000100 / 20260923000200.
 */

export type RepairOutcome = 'repaired' | 'scrap'
export type ReturnOutcome = 'usable' | 'writeoff'

function useInvalidateRepair() {
  const qc = useQueryClient()
  return () => {
    // Repair actions change a team's units + the bucket + the Damaged-Stock out-for-repair list.
    qc.invalidateQueries({ queryKey: queryKeys.toolAssignments.all })
    qc.invalidateQueries({ queryKey: queryKeys.toolInspections.all })
    qc.invalidateQueries({ queryKey: queryKeys.damagedStock.outForRepairAll })
  }
}

/** Direct Scrap from the bucket (Phase 2 rpc_resolve_tool_repair). */
export function useResolveRepair() {
  const invalidate = useInvalidateRepair()
  return useMutation<void, Error, { unitId: string; outcome: RepairOutcome; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_resolve_tool_repair', {
        p_unit_id: v.unitId,
        p_outcome: v.outcome,
        ...(v.notes ? { p_notes: v.notes } : {}),
      })
      if (error) throw toDbError(error, 'Resolve repair')
    },
    onSuccess: invalidate,
  })
}

/** Collect a team's tool into the Repair bucket (awaiting vendor). */
export function useSendToolToRepairBucket() {
  const invalidate = useInvalidateRepair()
  return useMutation<void, Error, { unitId: string; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_send_tool_to_repair_bucket', {
        p_unit_id: v.unitId,
        ...(v.notes ? { p_notes: v.notes } : {}),
      })
      if (error) throw toDbError(error, 'Send to repair')
    },
    onSuccess: invalidate,
  })
}

/** Dispatch a bucket tool to a repair vendor. */
export function useSendToolForRepair() {
  const invalidate = useInvalidateRepair()
  return useMutation<string, Error, { unitId: string; vendorId: string; expectedReturnDate?: string | null; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_send_tool_for_repair', {
        p_unit_id: v.unitId,
        p_repair_vendor_id: v.vendorId,
        ...(v.expectedReturnDate ? { p_expected_return_date: v.expectedReturnDate } : {}),
        ...(v.notes ? { p_notes: v.notes } : {}),
      })
      if (error) throw toDbError(error, 'Send for repair')
      return data as string
    },
    onSuccess: invalidate,
  })
}

/** Return a tool from a vendor: usable → store (Repaired), or writeoff → scrap→P&L. */
export function useReturnToolFromRepair() {
  const invalidate = useInvalidateRepair()
  return useMutation<void, Error, { transferId: string; outcome: ReturnOutcome; toLocationId?: string | null; notes?: string }>({
    mutationFn: async (v) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_return_tool_from_repair', {
        p_transfer_id: v.transferId,
        p_outcome: v.outcome,
        ...(v.toLocationId ? { p_to_warehouse_id: v.toLocationId } : {}),
        ...(v.notes ? { p_notes: v.notes } : {}),
      })
      if (error) throw toDbError(error, 'Return from repair')
    },
    onSuccess: invalidate,
  })
}
