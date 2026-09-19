import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'
import { useActiveDivision } from '@/components/providers/DivisionProvider'

export type Discipline = DBTable<'disciplines'>

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
 * Reference list of disciplines (Plumbing / Electrical / Automation, seeded).
 * Feeds the discipline multi-select checkboxes in `ProjectFormDialog` and
 * the discipline-name join in `useProjects`.
 *
 * MEP Task 1 made `disciplines` read RLS division-scoped (same
 * `is_division_visible` gate as `projects`), so this now also filters
 * client-side by division — pass an explicit `divisionId` to scope to a
 * specific division (e.g. the division picked in a project form, which may
 * differ from the caller's ambient active division); omit it to fall back to
 * the caller's current `activeDivisionId` (mirrors `useProjects`'s
 * `useActiveDivision` usage). When neither resolves to a single division
 * (global "All" view), no client-side filter is applied and RLS alone scopes
 * the result — same pattern as `useProjects`'s `viewDivisionIds.size > 0` gate.
 */
export function useDisciplines(divisionId?: string | null) {
  const { activeDivisionId } = useActiveDivision()
  const effectiveDivisionId = divisionId !== undefined ? divisionId : activeDivisionId

  return useQuery({
    queryKey: queryKeys.disciplines.byDivision(effectiveDivisionId),
    queryFn: async (): Promise<Discipline[]> => {
      const supabase = createClient()
      let q = supabase
        .from('disciplines')
        .select('id, division_id, name, prefix, sort_order, is_active, created_at')
        .eq('is_active', true)
        .order('sort_order')
        .limit(200)
      if (effectiveDivisionId) q = q.eq('division_id', effectiveDivisionId)
      const { data, error } = await q
      if (error) throw wrapDbError(error, 'Failed to load disciplines')
      return (data ?? []) as Discipline[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export type UpsertDisciplinePayload = {
  /**
   * Always required — `rpc_upsert_discipline` keys its insert-vs-update branch
   * off `p_id`, so callers must generate a fresh id (`crypto.randomUUID()`)
   * when creating and pass the existing row's id when editing.
   */
  id: string
  division_id: string
  name: string
  prefix?: string | null
  sort_order?: number
}

/**
 * Creates or updates a discipline via the `rpc_upsert_discipline` SECURITY
 * DEFINER RPC. Mirrors the mutation shape used in `useProjects.ts`
 * (useMutation + wrapDbError + onSuccess invalidate).
 */
export function useUpsertDiscipline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpsertDisciplinePayload): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_upsert_discipline', {
        p_id: payload.id,
        p_division_id: payload.division_id,
        p_name: payload.name,
        p_prefix: payload.prefix ?? undefined,
        p_sort_order: payload.sort_order,
      })
      if (error) throw wrapDbError(error, 'Failed to save discipline')
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.disciplines.all })
    },
  })
}

/**
 * Activates/deactivates a discipline via the `rpc_set_discipline_active`
 * SECURITY DEFINER RPC.
 */
export function useSetDisciplineActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id: string; active: boolean }): Promise<void> => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_set_discipline_active', {
        p_id: payload.id,
        p_active: payload.active,
      })
      if (error) throw wrapDbError(error, 'Failed to update discipline status')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.disciplines.all })
    },
  })
}
