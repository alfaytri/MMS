/**
 * Pure rollup logic for the Virtual Warehouse Projects list (Task 1.6).
 *
 * A "discipline bucket" is a `warehouse_sub_containers` row with both
 * `project_id` and `discipline_id` set (created automatically by the
 * `create_project` / `add_project_discipline` RPCs). This module joins
 * projects to their discipline buckets and to the server-aggregated
 * `warehouse_sub_container_totals` view to produce, per project, a
 * discipline count and a total stock value — WITHOUT hand-summing FIFO
 * layers (per the plan's binding constraint: reuse the view).
 *
 * Kept side-effect free and framework-free so it can be unit tested in
 * isolation from React/TanStack Query/Supabase.
 */

export type ProjectRow = {
  id: string
  project_number: string
  name: string
  division_id: string
  warehouse_id: string
  responsible_person_profile_id: string | null
  is_active: boolean
  created_at: string
}

/** A `warehouse_sub_containers` row tagged to a project, joined to its discipline's name. */
export type ProjectSubContainerRow = {
  id: string
  project_id: string | null
  discipline_id: string | null
  is_active: boolean
  disciplines: { name: string } | null
}

/** A row from the `warehouse_sub_container_totals` view, narrowed to what the rollup needs. */
export type ProjectSubTotalRow = {
  sub_container_id: string | null
  total_value: number | null
  item_count?: number | null
}

export type ProjectDisciplineBucket = {
  sub_container_id: string
  discipline_id: string | null
  discipline_name: string
  total_value: number
  item_count: number
  is_active: boolean
}

export type ProjectWithRollup = ProjectRow & {
  disciplineBuckets: ProjectDisciplineBucket[]
  disciplineCount: number
  totalValue: number
}

const UNKNOWN_DISCIPLINE = 'Unknown discipline'

/**
 * Joins `projects` to their discipline buckets (`warehouse_sub_containers`
 * where `project_id` matches) and to the `warehouse_sub_container_totals`
 * view, producing a per-project discipline count and summed stock value.
 *
 * Pure — does not mutate any input array or object.
 */
export function rollupProjects(
  projects: ProjectRow[],
  subContainers: ProjectSubContainerRow[],
  totals: ProjectSubTotalRow[],
): ProjectWithRollup[] {
  // sub_container_id -> summed total_value / item_count. Summed defensively —
  // the view is expected to be one row per sub-container, but a duplicate
  // must never silently drop value.
  const valueBySub = new Map<string, number>()
  const itemsBySub = new Map<string, number>()
  for (const t of totals) {
    if (!t.sub_container_id) continue
    valueBySub.set(t.sub_container_id, (valueBySub.get(t.sub_container_id) ?? 0) + (t.total_value ?? 0))
    itemsBySub.set(t.sub_container_id, (itemsBySub.get(t.sub_container_id) ?? 0) + (t.item_count ?? 0))
  }

  // project_id -> its discipline-bucket sub-containers.
  const subsByProject = new Map<string, ProjectSubContainerRow[]>()
  for (const sub of subContainers) {
    if (!sub.project_id) continue
    const arr = subsByProject.get(sub.project_id)
    if (arr) arr.push(sub)
    else subsByProject.set(sub.project_id, [sub])
  }

  return projects.map((project): ProjectWithRollup => {
    const subs = subsByProject.get(project.id) ?? []
    const disciplineBuckets: ProjectDisciplineBucket[] = subs.map((sub) => ({
      sub_container_id: sub.id,
      discipline_id: sub.discipline_id,
      discipline_name: sub.disciplines?.name ?? UNKNOWN_DISCIPLINE,
      total_value: valueBySub.get(sub.id) ?? 0,
      item_count: itemsBySub.get(sub.id) ?? 0,
      is_active: sub.is_active,
    }))

    return {
      ...project,
      disciplineBuckets,
      disciplineCount: disciplineBuckets.length,
      totalValue: disciplineBuckets.reduce((sum, b) => sum + b.total_value, 0),
    }
  })
}
