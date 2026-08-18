import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { toDbError } from './useToolAssignments'

/**
 * Resolve a unit under repair (Operations → Tools & Assets, Phase 2):
 * 'repaired' returns it to service (Good); 'scrap' retires it + posts its cost
 * to the P&L "Scrap & Defective" line (rpc_resolve_tool_repair, 20260922000100).
 */

export type RepairOutcome = 'repaired' | 'scrap'

export function useResolveRepair() {
  const qc = useQueryClient()
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.toolAssignments.all })
      qc.invalidateQueries({ queryKey: queryKeys.toolInspections.all })
    },
  })
}
