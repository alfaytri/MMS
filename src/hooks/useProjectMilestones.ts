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
 * Active milestones for a project's discipline (MEP reshape — milestones are
 * now keyed by `project_id` + `discipline_id` instead of the pool
 * `sub_container_id`; `milestone_no` is the canonical display sequence).
 * Feeds the milestone picker in `MilestoneManager` and the
 * Discipline→Milestone→Code cascade in `NewConsumptionDialog`. Disabled until
 * BOTH a project and a discipline are known — mirrors the old hook's
 * `subContainerId` gate.
 */
export function useProjectMilestones(
  projectId: string | null | undefined,
  disciplineId: string | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.projectMilestones.byProjectDiscipline(projectId, disciplineId),
    enabled: !!projectId && !!disciplineId,
    queryFn: async (): Promise<ProjectMilestone[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_milestones')
        .select('id, project_id, discipline_id, milestone_no, name, description, amount, status, is_active, created_by, created_at, updated_at')
        .eq('project_id', projectId!)
        .eq('discipline_id', disciplineId!)
        .eq('is_active', true)
        .order('milestone_no')
        .limit(200)
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
 *
 * LEGACY (pre-MEP-reshape) pool-model RPC — left in place ("Keep the existing
 * close/deactivate mutation working") for any caller not yet switched to
 * `useUpsertProjectMilestone`. Not used by the new project_id+discipline_id
 * milestone flow.
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
 *
 * LEGACY (pre-MEP-reshape) pool-model RPC — still works unchanged against the
 * DB (signature confirmed unchanged against staging), kept as-is per brief.
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

export type UpsertProjectMilestonePayload = {
  /**
   * Always required — `rpc_upsert_project_milestone` keys its insert-vs-update
   * branch off `p_id`, so callers must generate a fresh id
   * (`crypto.randomUUID()`) when creating and pass the existing row's id when
   * editing.
   */
  id: string
  project_id: string
  discipline_id: string
  milestone_no: number
  name: string
  description?: string | null
  amount?: number | null
  status?: string | null
}

/**
 * Creates or updates a MEP project milestone (keyed by project_id +
 * discipline_id) via the `rpc_upsert_project_milestone` SECURITY DEFINER RPC.
 * Mirrors the mutation shape used in `useProjects.ts`.
 */
export function useUpsertProjectMilestone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: UpsertProjectMilestonePayload): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_upsert_project_milestone', {
        p_id: payload.id,
        p_project_id: payload.project_id,
        p_discipline_id: payload.discipline_id,
        p_milestone_no: payload.milestone_no,
        p_name: payload.name,
        p_description: payload.description ?? undefined,
        p_amount: payload.amount ?? undefined,
        p_status: payload.status ?? undefined,
      })
      if (error) throw wrapDbError(error, 'Failed to save milestone')
      return data as string
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({
        queryKey: queryKeys.projectMilestones.byProjectDiscipline(payload.project_id, payload.discipline_id),
      })
      qc.invalidateQueries({ queryKey: queryKeys.projects.all })
    },
  })
}

export type SetMilestoneCodesPayload = {
  milestone_id: string
  code_ids: string[]
  // Not sent to the RPC (`rpc_set_project_milestone_codes` only takes the
  // milestone id + code ids) — carried so onSuccess can invalidate the right
  // `projectMilestones.byProjectDiscipline` bucket. Mirrors
  // `CloseMilestonePayload.sub_container_id` above.
  project_id?: string
  discipline_id?: string
}

/**
 * Replaces a milestone's bundled `milestone_codes` set via the
 * `rpc_set_project_milestone_codes` SECURITY DEFINER RPC (full replace, not
 * additive — pass the complete desired `code_ids` list).
 */
export function useSetMilestoneCodes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SetMilestoneCodesPayload): Promise<void> => {
      const supabase = createClient()
      const { error } = await supabase.rpc('rpc_set_project_milestone_codes', {
        p_milestone_id: payload.milestone_id,
        p_code_ids: payload.code_ids,
      })
      if (error) throw wrapDbError(error, 'Failed to update milestone codes')
    },
    onSuccess: (_data, payload) => {
      if (payload.project_id && payload.discipline_id) {
        qc.invalidateQueries({
          queryKey: queryKeys.projectMilestones.byProjectDiscipline(payload.project_id, payload.discipline_id),
        })
      }
      qc.invalidateQueries({ queryKey: ['project-milestone-codes', payload.milestone_id] })
    },
  })
}

export type ProjectMilestoneCode = {
  /** `project_milestone_codes` junction row id. */
  id: string
  milestone_id: string
  /** `milestone_codes.id`. */
  code_id: string
  code: string
  grp: string | null
  description: string | null
}

type RawProjectMilestoneCodeRow = {
  id: string
  milestone_id: string
  milestone_code_id: string
  milestone_codes: { code: string; grp: string | null; description: string | null } | null
}

/**
 * A milestone's bundled codes (`project_milestone_codes` embedding
 * `milestone_codes`) — powers the code chips in `MilestoneManager` and the
 * code picker's default selection when editing an existing milestone.
 */
export function useProjectMilestoneCodes(milestoneId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-milestone-codes', milestoneId ?? null],
    enabled: !!milestoneId,
    queryFn: async (): Promise<ProjectMilestoneCode[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('project_milestone_codes')
        .select('id, milestone_id, milestone_code_id, milestone_codes(code, grp, description)')
        .eq('milestone_id', milestoneId!)
        .limit(200)
      if (error) throw wrapDbError(error, 'Failed to load milestone codes')
      return (data as unknown as RawProjectMilestoneCodeRow[]).map((r) => ({
        id: r.id,
        milestone_id: r.milestone_id,
        code_id: r.milestone_code_id,
        code: r.milestone_codes?.code ?? '(code)',
        grp: r.milestone_codes?.grp ?? null,
        description: r.milestone_codes?.description ?? null,
      }))
    },
    staleTime: 60 * 1000,
  })
}
