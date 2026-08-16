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
 * Active milestones scoped to one discipline bucket (a `warehouse_sub_containers`
 * row acting as a project discipline). Disabled while `subContainerId` is
 * falsy — that's the gate `NewConsumptionDialog` relies on to only query once
 * a custody consumer bucket is actually picked.
 *
 * A non-empty result here IS the "this discipline bucket has milestones"
 * signal used to decide whether to show the optional Milestone picker —
 * the caller doesn't need project_id/discipline_id in scope for that check.
 */
export function useProjectMilestones(subContainerId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.projectMilestones.bySub(subContainerId),
    enabled: !!subContainerId,
    queryFn: async (): Promise<ProjectMilestone[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_milestones')
        .select('id, sub_container_id, label, sort_order, is_active, created_by, created_at, updated_at')
        .eq('sub_container_id', subContainerId!)
        .eq('is_active', true)
        .order('sort_order')
        .order('label')
        .limit(200)
      if (error) throw wrapDbError(error, 'Failed to load milestones')
      return (data ?? []) as ProjectMilestone[]
    },
    staleTime: 60 * 1000,
  })
}

export type AddMilestonePayload = {
  sub_container_id: string
  label: string
}

/**
 * Adds a milestone to a discipline bucket via the `add_project_milestone`
 * SECURITY DEFINER RPC. `UNIQUE(sub_container_id, label)` throws 23505 on a
 * duplicate label within the same discipline — surfaced as a friendly
 * message, mirroring `useAddProjectDiscipline`'s 23505 handling.
 */
export function useAddMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AddMilestonePayload): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('add_project_milestone', {
        p_sub_container_id: payload.sub_container_id,
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
