import { describe, it, expect } from 'vitest'
import { rollupProjects, type ProjectRow, type ProjectSubContainerRow, type ProjectSubTotalRow } from './projectsRollup'

function makeProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'p1',
    project_number: 'PRJ-001',
    name: 'Test Project',
    division_id: 'div1',
    warehouse_id: 'wh1',
    responsible_person_profile_id: null,
    is_active: true,
    created_at: '2026-08-16T00:00:00Z',
    ...overrides,
  }
}

describe('rollupProjects', () => {
  it('rolls up a project with 2 discipline buckets into disciplineCount=2 and summed totalValue', () => {
    const projects: ProjectRow[] = [makeProject()]
    const subs: ProjectSubContainerRow[] = [
      { id: 'sub1', project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
      { id: 'sub2', project_id: 'p1', discipline_id: 'd2', is_active: true, disciplines: { name: 'Electrical' } },
    ]
    const totals: ProjectSubTotalRow[] = [
      { sub_container_id: 'sub1', total_value: 500, item_count: 3 },
      { sub_container_id: 'sub2', total_value: 250, item_count: 1 },
    ]

    const result = rollupProjects(projects, subs, totals)

    expect(result).toHaveLength(1)
    expect(result[0].disciplineCount).toBe(2)
    expect(result[0].totalValue).toBe(750)
    expect(result[0].disciplineBuckets.map((b) => b.discipline_name).sort()).toEqual(['Electrical', 'Plumbing'])
  })

  it('returns disciplineCount=0, totalValue=0, and an empty bucket list for a project with no discipline sub-containers', () => {
    const projects: ProjectRow[] = [makeProject()]
    const result = rollupProjects(projects, [], [])

    expect(result).toHaveLength(1)
    expect(result[0].disciplineCount).toBe(0)
    expect(result[0].totalValue).toBe(0)
    expect(result[0].disciplineBuckets).toEqual([])
  })

  it('isolates buckets per project — a sub-container tagged to a different project must not leak in', () => {
    const projects: ProjectRow[] = [
      makeProject({ id: 'p1', project_number: 'PRJ-001' }),
      makeProject({ id: 'p2', project_number: 'PRJ-002' }),
    ]
    const subs: ProjectSubContainerRow[] = [
      { id: 'sub1', project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
      { id: 'sub2', project_id: 'p2', discipline_id: 'd2', is_active: true, disciplines: { name: 'Electrical' } },
    ]
    const totals: ProjectSubTotalRow[] = [
      { sub_container_id: 'sub1', total_value: 100, item_count: 1 },
      { sub_container_id: 'sub2', total_value: 900, item_count: 9 },
    ]

    const result = rollupProjects(projects, subs, totals)
    const p1 = result.find((p) => p.id === 'p1')!
    const p2 = result.find((p) => p.id === 'p2')!

    expect(p1.disciplineCount).toBe(1)
    expect(p1.totalValue).toBe(100)
    expect(p2.disciplineCount).toBe(1)
    expect(p2.totalValue).toBe(900)
  })

  it('falls back to "Unknown discipline" when the discipline join is null — never surfaces a raw id', () => {
    const projects: ProjectRow[] = [makeProject()]
    const subs: ProjectSubContainerRow[] = [
      { id: 'sub1', project_id: 'p1', discipline_id: null, is_active: true, disciplines: null },
    ]
    const result = rollupProjects(projects, subs, [])

    expect(result[0].disciplineBuckets[0].discipline_name).toBe('Unknown discipline')
  })

  it('defaults a bucket total_value to 0 when no matching totals row exists (not undefined/NaN)', () => {
    const projects: ProjectRow[] = [makeProject()]
    const subs: ProjectSubContainerRow[] = [
      { id: 'sub1', project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
    ]
    const result = rollupProjects(projects, subs, [])

    expect(result[0].disciplineBuckets[0].total_value).toBe(0)
    expect(result[0].totalValue).toBe(0)
  })

  it('ignores sub-containers with a null project_id (legacy / non-project buckets)', () => {
    const projects: ProjectRow[] = [makeProject()]
    const subs: ProjectSubContainerRow[] = [
      { id: 'sub1', project_id: null, discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
    ]
    const result = rollupProjects(projects, subs, [{ sub_container_id: 'sub1', total_value: 999, item_count: 1 }])

    expect(result[0].disciplineCount).toBe(0)
    expect(result[0].totalValue).toBe(0)
  })

  it('is pure: does not mutate the input arrays or their objects', () => {
    const projects: ProjectRow[] = [makeProject()]
    const subs: ProjectSubContainerRow[] = [
      { id: 'sub1', project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
    ]
    const totals: ProjectSubTotalRow[] = [{ sub_container_id: 'sub1', total_value: 500, item_count: 3 }]
    const projectsSnapshot = JSON.parse(JSON.stringify(projects))
    const subsSnapshot = JSON.parse(JSON.stringify(subs))
    const totalsSnapshot = JSON.parse(JSON.stringify(totals))

    rollupProjects(projects, subs, totals)

    expect(projects).toEqual(projectsSnapshot)
    expect(subs).toEqual(subsSnapshot)
    expect(totals).toEqual(totalsSnapshot)
  })

  it('returns an empty array for empty project input', () => {
    expect(rollupProjects([], [], [])).toEqual([])
  })

  it('sums multiple totals rows for the same sub-container defensively', () => {
    const projects: ProjectRow[] = [makeProject()]
    const subs: ProjectSubContainerRow[] = [
      { id: 'sub1', project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
    ]
    // Defensive: the view is expected to be one row per sub-container, but the
    // rollup should not silently drop value if a duplicate ever appears.
    const totals: ProjectSubTotalRow[] = [
      { sub_container_id: 'sub1', total_value: 100, item_count: 1 },
      { sub_container_id: 'sub1', total_value: 50, item_count: 1 },
    ]

    const result = rollupProjects(projects, subs, totals)

    expect(result[0].totalValue).toBe(150)
  })
})
