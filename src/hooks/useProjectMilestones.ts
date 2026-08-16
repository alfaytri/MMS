import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type ProjectMilestone = DBTable<'project_milestones'>

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
 * Active milestones scoped to a project's stock pool + one discipline (Option
 * B: milestones hang off the single pool sub-container, tagged by discipline).
 * Pass `disciplineId` to get just that discipline's milestones; omit it (for
 * back-compat callers) to get every milestone on the pool. Disabled while
 * `subContainerId` is falsy — the gate `NewConsumptionDialog` relies on to
 * only query once a custody consumer is actually picked.
 */
export function useProjectMilestones(
  subContainerId: string | null | undefined,
  disciplineId?: string | null,
) {
  return useQuery({
    queryKey: [...queryKeys.projectMilestones.bySub(subContainerId), disciplineId ?? 'all'],
    enabled: !!subContainerId,
    queryFn: async (): Promise<ProjectMilestone[]> => {
      const supabase = createClient()
      let q = supabase
        .from('project_milestones')
        .select('id, sub_container_id, discipline_id, label, sort_order, is_active, created_by, created_at, updated_at')
        .eq('sub_container_id', subContainerId!)
        .eq('is_active', true)
      if (disciplineId) q = q.eq('discipline_id', disciplineId)
      const { data, error } = await q.order('sort_order').order('label').limit(200)
      if (error) throw wrapDbError(error, 'Failed to load milestones')
      return (data ?? []) as ProjectMilestone[]
    },
    staleTime: 60 * 1000,
  })
}

export type PoolDiscipline = { discipline_id: string; discipline_name: string }

/**
 * Active discipline tags for the project that owns a given pool sub-container.
 * Powers the Discipline picker in NewConsumptionDialog when the consumer is a
 * project pool; returns [] (picker hidden) for a non-project custody sub.
 */
export function usePoolDisciplines(subContainerId: string | null | undefined) {
  return useQuery({
    queryKey: ['pool-disciplines', subContainerId],
    enabled: !!subContainerId,
    queryFn: async (): Promise<PoolDiscipline[]> => {
      const supabase = createClient()
      const { data: sub, error: subErr } = await supabase
        .from('warehouse_sub_containers')
        .select('project_id')
        .eq('id', subContainerId!)
        .maybeSingle()
      if (subErr) throw wrapDbError(subErr, 'Failed to resolve project')
      const projectId = (sub as { project_id: string | null } | null)?.project_id
      if (!projectId) return []
      const { data, error } = await supabase
        .from('project_disciplines')
        .select('discipline_id, disciplines(name)')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .limit(200)
      if (error) throw wrapDbError(error, 'Failed to load project disciplines')
      return (data ?? [])
        .map((r) => ({
          discipline_id: (r as { discipline_id: string }).discipline_id,
          discipline_name:
            (r as unknown as { disciplines?: { name: string } | null }).disciplines?.name ?? 'Unknown discipline',
        }))
        .sort((a, b) => a.discipline_name.localeCompare(b.discipline_name))
    },
    staleTime: 60 * 1000,
  })
}

export type AddMilestonePayload = {
  sub_container_id: string
  discipline_id: string
  label: string
}

/**
 * Adds a milestone to a project pool + discipline via the
 * `add_project_milestone` SECURITY DEFINER RPC. The unique
 * `(sub_container_id, discipline_id, label)` throws 23505 on a duplicate label
 * within the same discipline — surfaced as a friendly message, mirroring
 * `useAddProjectDiscipline`'s 23505 handling.
 */
export function useAddMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AddMilestonePayload): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('add_project_milestone', {
        p_sub_container_id: payload.sub_container_id,
        p_discipline_id: payload.discipline_id,
        p_label: payload.label,
      })
      if (error) {
        if (error.code === '23505') {
          throw new Error('A milestone with that label already exists on this discipline')
        }
        throw wrapDbError(error, 'Failed to add milestone')
      }
      // `add_project_milestone`'s Functions.Returns type is already `string`
      // (the new milestone id), and after the error guard above `data`'s
      // narrowed type is bare `string`, matching this function's
      // `Promise<string>` return exactly.
      return data as string
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: queryKeys.projectMilestones.bySub(payload.sub_container_id) })
      // Bucket rollups may show milestone counts later.
      qc.invalidateQueries({ queryKey: queryKeys.projects.all })
    },
  })
}

export type CloseMilestonePayload = {
  milestone_id: string
  // Not sent to the RPC (`close_project_milestone` only takes the milestone
  // id) — carried so onSuccess can invalidate this bucket's specific
  // `projectMilestones.bySub` cache entry. Mirrors `useDecideConsumptionEdit`'s
  // `consumption_id` field in useConsumption.ts, kept "for cache invalidation".
  sub_container_id: string
}

/**
 * Closes (deactivates) a milestone via the `close_project_milestone`
 * SECURITY DEFINER RPC. Deactivating keeps history — already-tagged
 * consumption/cogs rows keep their `milestone_id`, so past spend reports are
 * unaffected; the milestone just stops showing up as pickable.
 */
export function useCloseMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CloseMilestonePayload): Promise<void> => {
      const supabase = createClient()
      const { error } = await supabase.rpc('close_project_milestone', {
        p_milestone_id: payload.milestone_id,
      })
      if (error) throw wrapDbError(error, 'Failed to close milestone')
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: queryKeys.projectMilestones.bySub(payload.sub_container_id) })
      qc.invalidateQueries({ queryKey: queryKeys.projects.all })
    },
  })
}
