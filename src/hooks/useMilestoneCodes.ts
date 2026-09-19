import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type MilestoneCode = DBTable<'milestone_codes'>

// Wraps a Supabase/PostgREST error into a real Error whose message concatenates
// the diagnostic fields — PostgrestError is a plain object, not an Error
// subclass, so `instanceof Error` fallbacks would otherwise hide the DB's
// actual message (column/RLS/constraint details). Mirrors useProjects.ts:19-26.
function wrapDbError(
  error: { code?: string; message?: string; details?: string; hint?: string },
  fallback: string,
): Error {
  return new Error(
    [error.code, error.message, error.details, error.hint].filter(Boolean).join(' — ') || fallback,
  )
}

/**
 * Active milestone codes for one discipline (e.g. Plumbing's "P1 — First Fix").
 * Feeds the milestone-code multi-select in `MilestoneManager` (bundling codes
 * onto a project milestone) and the discipline→code catalog in
 * `MilestoneCodesManager`. Disabled while `disciplineId` is falsy — mirrors
 * `useProjectMilestones`'s `subContainerId` gate.
 */
export function useMilestoneCodes(disciplineId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.milestoneCodes.byDiscipline(disciplineId ?? ''),
    enabled: !!disciplineId,
    queryFn: async (): Promise<MilestoneCode[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('milestone_codes')
        .select('id, discipline_id, code, grp, description, sort_order, is_active, created_at')
        .eq('discipline_id', disciplineId!)
        .eq('is_active', true)
        .order('sort_order')
        .order('code')
        .limit(500)
      if (error) throw wrapDbError(error, 'Failed to load milestone codes')
      return (data ?? []) as MilestoneCode[]
    },
    staleTime: 60 * 1000,
  })
}

export type UpsertMilestoneCodePayload = {
  /**
   * Always required — `rpc_upsert_milestone_code` keys its insert-vs-update
   * branch off `p_id`, so callers must generate a fresh id
   * (`crypto.randomUUID()`) when creating and pass the existing row's id when
   * editing.
   */
  id: string
  discipline_id: string
  code: string
  grp?: string | null
  description?: string | null
  sort_order?: number
}

/**
 * Creates or updates a milestone code via the `rpc_upsert_milestone_code`
 * SECURITY DEFINER RPC. Mirrors the mutation shape used in `useProjects.ts`
 * (useMutation + wrapDbError + onSuccess invalidate).
 */
export function useUpsertMilestoneCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpsertMilestoneCodePayload): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_upsert_milestone_code', {
        p_id: payload.id,
        p_discipline_id: payload.discipline_id,
        p_code: payload.code,
        p_grp: payload.grp ?? undefined,
        p_description: payload.description ?? undefined,
        p_sort_order: payload.sort_order,
      })
      if (error) throw wrapDbError(error, 'Failed to save milestone code')
      return data as string
    },
    onSuccess: () => {
      // Prefix-matches every `byDiscipline(...)` entry too (TanStack Query
      // invalidates by key prefix), so a plain `.all` invalidation is enough
      // even though we don't always know the affected discipline here.
      qc.invalidateQueries({ queryKey: queryKeys.milestoneCodes.all })
    },
  })
}

/**
 * Activates/deactivates a milestone code via the `rpc_set_milestone_code_active`
 * SECURITY DEFINER RPC.
 */
export function useSetMilestoneCodeActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id: string; active: boolean }): Promise<void> => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_set_milestone_code_active', {
        p_id: payload.id,
        p_active: payload.active,
      })
      if (error) throw wrapDbError(error, 'Failed to update milestone code status')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.milestoneCodes.all })
    },
  })
}
