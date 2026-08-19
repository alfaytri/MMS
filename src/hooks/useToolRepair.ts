import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export type ToolOutForRepair = {
  transfer_id: string
  transfer_number: string
  unit_id: string
  item_name: string | null
  serial_number: string | null
  division_id: string | null
  vendor_name: string | null
  expected_return_date: string | null
  dispatched_at: string | null
}

/** Serialized tools currently out at a repair vendor (damaged_repair_out, in_transit). */
export function useToolsOutForRepair() {
  return useQuery({
    queryKey: queryKeys.toolInspections.outForRepair,
    queryFn: async (): Promise<ToolOutForRepair[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('warehouse_transfers')
        .select(`
          id, transfer_number, expected_return_date, dispatched_at, tool_unit_id,
          repair_vendors ( name ),
          tool_asset_units!warehouse_transfers_tool_unit_id_fkey (
            serial_number, division_id,
            inventory_items ( name_en )
          )
        `)
        .eq('transfer_kind', 'damaged_repair_out')
        .eq('status', 'in_transit')
        .not('tool_unit_id', 'is', null)
        .order('dispatched_at', { ascending: false })
        .limit(200)
      if (error) throw toDbError(error, 'Load tools out for repair')

      type Row = {
        id: string
        transfer_number: string | null
        expected_return_date: string | null
        dispatched_at: string | null
        tool_unit_id: string
        repair_vendors: { name: string | null } | null
        tool_asset_units: { serial_number: string | null; division_id: string | null; inventory_items: { name_en: string | null } | null } | null
      }
      return ((data ?? []) as unknown as Row[]).map((r): ToolOutForRepair => ({
        transfer_id: r.id,
        transfer_number: r.transfer_number ?? '',
        unit_id: r.tool_unit_id,
        item_name: r.tool_asset_units?.inventory_items?.name_en ?? null,
        serial_number: r.tool_asset_units?.serial_number ?? null,
        division_id: r.tool_asset_units?.division_id ?? null,
        vendor_name: r.repair_vendors?.name ?? null,
        expected_return_date: r.expected_return_date,
        dispatched_at: r.dispatched_at,
      }))
    },
    staleTime: 60_000,
  })
}
