import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import {
  rollupProjects,
  type ProjectRow,
  type ProjectSubContainerRow,
  type ProjectSubTotalRow,
  type ProjectWithRollup,
} from '@/lib/warehouse/projectsRollup'

export type { ProjectWithRollup, ProjectDisciplineBucket } from '@/lib/warehouse/projectsRollup'

// Wraps a Supabase/PostgREST error into a real Error whose message concatenates
// the diagnostic fields — PostgrestError is a plain object, not an Error
// subclass, so `instanceof Error` fallbacks would otherwise hide the DB's
// actual message (column/RLS/constraint details).
function wrapDbError(
  error: { code?: string; message?: string; details?: string; hint?: string },
  fallback: string,
): Error {
  return new Error(
    [error.code, error.message, error.details, error.hint].filter(Boolean).join(' — ') || fallback,
  )
}

/**
 * Projects (division-filtered via the active-division view set) joined to
 * their discipline buckets and stock-value rollup.
 *
 * Three sequential, plain-table reads, each scoped to the previous result
 * (no new RPC needed for Task 1.6):
 *   1. `projects` — filtered server-side to the caller's in-view divisions.
 *   2. `warehouse_sub_containers` scoped to those projects' ids
 *      (`.in('project_id', …)`), joined to `disciplines(name)` for the label.
 *   3. `warehouse_sub_container_totals` scoped to those sub-containers' ids
 *      (`.in('sub_container_id', …)`) — the server-aggregated stock-value
 *      view (never hand-sum FIFO layers).
 * Reads 2 and 3 are skipped (return `[]`) when the prior result set is
 * empty. Each still carries a `.limit(N)` backstop and a stable `.order()`
 * for deterministic truncation if that cap is ever hit — scoping to the
 * visible project set means the cap should rarely bind in practice, but an
 * unbounded, unordered global read past a fixed cap would otherwise silently
 * under-count disciplines/value once the org outgrows the limit.
 * `rollupProjects` (pure, unit-tested) joins the three in memory.
 */
export function useProjects() {
  const { viewDivisionIds } = useActiveDivision()
  // "All divisions" (size 0) and any specific multi-select both need a stable,
  // order-independent cache key.
  const divKey = viewDivisionIds.size === 0 ? 'all' : Array.from(viewDivisionIds).sort().join(',')

  return useQuery({
    queryKey: queryKeys.projects.list(divKey),
    queryFn: async (): Promise<ProjectWithRollup[]> => {
      const supabase = createClient()

      let projectsQuery = supabase
        .from('projects')
        .select('id, project_number, name, division_id, warehouse_id, responsible_person_profile_id, is_active, created_at')
        .order('project_number')
        .limit(500)
      if (viewDivisionIds.size > 0) {
        projectsQuery = projectsQuery.in('division_id', Array.from(viewDivisionIds))
      }

      const projectsRes = await projectsQuery
      if (projectsRes.error) throw wrapDbError(projectsRes.error, 'Failed to load projects')
      const projects = (projectsRes.data ?? []) as ProjectRow[]

      // Bound both supporting reads to the visible project set instead of
      // reading globally across all divisions — past the `.limit()` caps,
      // an unscoped global read's truncation is undefined and would silently
      // under-count disciplines/value for divisions outside the caller's view.
      const projectIds = projects.map((p) => p.id)
      let subs: ProjectSubContainerRow[] = []
      if (projectIds.length > 0) {
        const subsRes = await supabase
          .from('warehouse_sub_containers')
          .select('id, project_id, discipline_id, is_active, disciplines(name)')
          .in('project_id', projectIds)
          .order('id')
          .limit(1000)
        if (subsRes.error) throw wrapDbError(subsRes.error, 'Failed to load project discipline buckets')
        // Single-hop assertion (no `unknown` detour): after the error guard
        // above, `subsRes.data`'s narrowed type is already an exact
        // structural match for `ProjectSubContainerRow[]` — the FK on
        // `discipline_id` embeds `disciplines(name)` as a singular nullable
        // object (`{ name: string } | null`), not an array, matching this
        // type field-for-field. Confirmed via tsc: assigning `subsRes.data`
        // to an unrelated type surfaces its real inferred shape rather than
        // `any`, so this assertion is a genuine (if redundant) narrowing.
        subs = (subsRes.data ?? []) as ProjectSubContainerRow[]
      }

      const subIds = subs.map((s) => s.id)
      let totals: ProjectSubTotalRow[] = []
      if (subIds.length > 0) {
        const totalsRes = await supabase
          .from('warehouse_sub_container_totals')
          .select('sub_container_id, total_value, item_count')
          .in('sub_container_id', subIds)
          .order('sub_container_id')
          .limit(2000)
        if (totalsRes.error) throw wrapDbError(totalsRes.error, 'Failed to load stock value totals')
        totals = (totalsRes.data ?? []) as ProjectSubTotalRow[]
      }

      return rollupProjects(projects, subs, totals)
    },
    staleTime: 60 * 1000,
  })
}

export type CreateProjectPayload = {
  project_number: string
  name: string
  division_id: string
  warehouse_id: string
  discipline_ids: string[]
  responsible_person_profile_id: string | null
}

/**
 * Creates a project via the `create_project` SECURITY DEFINER RPC, which
 * also auto-creates one `warehouse_sub_containers` discipline bucket per
 * picked discipline. `UNIQUE(division_id, project_number)` throws 23505 on a
 * duplicate — surfaced as a friendly message per the plan's binding spec.
 */
export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateProjectPayload): Promise<string> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('create_project', {
        p_project_number: payload.project_number,
        p_name: payload.name,
        p_division_id: payload.division_id,
        p_warehouse_id: payload.warehouse_id,
        p_discipline_ids: payload.discipline_ids,
        p_responsible_person_profile_id: payload.responsible_person_profile_id ?? undefined,
      })
      if (error) {
        if (error.code === '23505') {
          throw new Error('Project number already used in this division')
        }
        throw wrapDbError(error, 'Failed to create project')
      }
      // Single-hop assertion (no `unknown` detour): `create_project`'s
      // Functions.Returns type is already `string`, and after the error
      // guard above `data`'s narrowed type is bare `string` (confirmed via
      // tsc), matching this function's `Promise<string>` return exactly.
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.projects.all })
    },
  })
}
