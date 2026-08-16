/**
 * Pure rollup logic for the Virtual Warehouse Projects list.
 *
 * "Option B" model: a project is ONE stock pool (`warehouse_sub_containers`
 * row with `project_id` set and `discipline_id` NULL). Disciplines are TAGS
 * recorded in `project_disciplines` (not stock containers); milestones and
 * consumption/COGS carry the discipline as a tag. This module joins a project
 * to its single pool (for stock value, via the server-aggregated
 * `warehouse_sub_container_totals` view — never hand-sum FIFO layers) and to
 * its discipline tags.
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

/** The project's single stock-pool `warehouse_sub_containers` row (discipline_id NULL). */
export type ProjectPoolRow = {
  id: string
  project_id: string | null
  is_active: boolean
}

/** A `project_disciplines` row joined to its discipline's name. */
export type ProjectDisciplineRow = {
  project_id: string
  discipline_id: string
  is_active: boolean
  disciplines: { name: string } | null
}

/** A row from the `warehouse_sub_container_totals` view, narrowed to what the rollup needs. */
export type ProjectSubTotalRow = {
  sub_container_id: string | null
  total_value: number | null
  item_count?: number | null
}

/** A discipline tag on a project (not a stock container). */
export type ProjectDisciplineTag = {
  discipline_id: string
  discipline_name: string
  is_active: boolean
}

export type ProjectWithRollup = ProjectRow & {
  /** The single stock-pool sub-container id (null only for a malformed legacy project). */
  poolSubContainerId: string | null
  /** Stock value + item count held in the pool. */
  totalValue: number
  itemCount: number
  /** Discipline tags (spend categories), active + inactive. */
  disciplines: ProjectDisciplineTag[]
  disciplineCount: number
}

const UNKNOWN_DISCIPLINE = 'Unknown discipline'

/**
 * Joins `projects` to their single stock pool (`warehouse_sub_containers` where
 * `project_id` matches and `discipline_id` is NULL), the pool's row in the
 * `warehouse_sub_container_totals` view, and their `project_disciplines` tags.
 *
 * Pure — does not mutate any input array or object.
 */
export function rollupProjects(
  projects: ProjectRow[],
  pools: ProjectPoolRow[],
  disciplineRows: ProjectDisciplineRow[],
  totals: ProjectSubTotalRow[],
): ProjectWithRollup[] {
  // sub_container_id -> summed value / item count (summed defensively).
  const valueBySub = new Map<string, number>()
  const itemsBySub = new Map<string, number>()
  for (const t of totals) {
    if (!t.sub_container_id) continue
    valueBySub.set(t.sub_container_id, (valueBySub.get(t.sub_container_id) ?? 0) + (t.total_value ?? 0))
    itemsBySub.set(t.sub_container_id, (itemsBySub.get(t.sub_container_id) ?? 0) + (t.item_count ?? 0))
  }

  // project_id -> its (single) active pool sub-container id.
  const poolByProject = new Map<string, string>()
  for (const p of pools) {
    if (!p.project_id || !p.is_active) continue
    if (!poolByProject.has(p.project_id)) poolByProject.set(p.project_id, p.id)
  }

  // project_id -> discipline tags.
  const discByProject = new Map<string, ProjectDisciplineTag[]>()
  for (const d of disciplineRows) {
    const tag: ProjectDisciplineTag = {
      discipline_id: d.discipline_id,
      discipline_name: d.disciplines?.name ?? UNKNOWN_DISCIPLINE,
      is_active: d.is_active,
    }
    const arr = discByProject.get(d.project_id)
    if (arr) arr.push(tag)
    else discByProject.set(d.project_id, [tag])
  }

  return projects.map((project): ProjectWithRollup => {
    const poolId = poolByProject.get(project.id) ?? null
    const disciplines = (discByProject.get(project.id) ?? []).sort((a, b) =>
      a.discipline_name.localeCompare(b.discipline_name),
    )
    return {
      ...project,
      poolSubContainerId: poolId,
      totalValue: poolId ? (valueBySub.get(poolId) ?? 0) : 0,
      itemCount: poolId ? (itemsBySub.get(poolId) ?? 0) : 0,
      disciplines,
      disciplineCount: disciplines.filter((d) => d.is_active).length,
    }
  })
}
