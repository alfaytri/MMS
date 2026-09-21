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
      // Home codes for this discipline PLUS codes shared into it from another
      // discipline (via milestone_code_disciplines). The RPC returns full
      // milestone_codes rows already ordered by sort_order, code; a row whose
      // `discipline_id` !== the requested discipline is a shared-in code (its
      // `discipline_id` is that code's home discipline).
      const { data, error } = await supabase.rpc('rpc_milestone_codes_for_discipline', {
        p_discipline_id: disciplineId!,
      })
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
  /** Extra disciplines this code is ALSO available in (beyond its home). Full replace. */
  extra_discipline_ids?: string[]
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
        p_extra_discipline_ids: payload.extra_discipline_ids ?? [],
      })
      if (error) throw wrapDbError(error, 'Failed to save milestone code')
      return data as string
    },
    onSuccess: (_data, payload) => {
      // Prefix-matches every `byDiscipline(...)` entry too (TanStack Query
      // invalidates by key prefix), so a plain `.all` invalidation is enough
      // even though we don't always know the affected discipline here. Also
      // refresh this code's shared-discipline set (edit-form default).
      qc.invalidateQueries({ queryKey: queryKeys.milestoneCodes.all })
      qc.invalidateQueries({ queryKey: ['milestone-code-disciplines', payload.id] })
    },
  })
}

/**
 * The EXTRA disciplines a milestone code is shared into (beyond its home
 * discipline) — powers the "Also available in" multi-select's default selection
 * when editing a code.
 */
export function useMilestoneCodeDisciplines(codeId: string | null | undefined) {
  return useQuery({
    queryKey: ['milestone-code-disciplines', codeId ?? null],
    enabled: !!codeId,
    queryFn: async (): Promise<string[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('milestone_code_disciplines')
        .select('discipline_id')
        .eq('milestone_code_id', codeId!)
        .limit(100)
      if (error) throw wrapDbError(error, 'Failed to load code disciplines')
      return (data ?? []).map((r) => (r as { discipline_id: string }).discipline_id)
    },
    staleTime: 60 * 1000,
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
