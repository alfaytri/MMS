import { describe, it, expect } from 'vitest'
import {
  rollupProjects,
  type ProjectRow,
  type ProjectPoolRow,
  type ProjectDisciplineRow,
  type ProjectSubTotalRow,
} from './projectsRollup'

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

describe('rollupProjects (Option B — one pool + discipline tags)', () => {
  it('rolls up a project with a pool + 2 discipline tags into disciplineCount=2 and the pool totalValue', () => {
    const projects: ProjectRow[] = [makeProject()]
    const pools: ProjectPoolRow[] = [{ id: 'pool1', project_id: 'p1', is_active: true }]
    const disciplineRows: ProjectDisciplineRow[] = [
      { project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
      { project_id: 'p1', discipline_id: 'd2', is_active: true, disciplines: { name: 'Electrical' } },
    ]
    const totals: ProjectSubTotalRow[] = [{ sub_container_id: 'pool1', total_value: 750, item_count: 4 }]

    const result = rollupProjects(projects, pools, disciplineRows, totals)

    expect(result).toHaveLength(1)
    expect(result[0].poolSubContainerId).toBe('pool1')
    expect(result[0].disciplineCount).toBe(2)
    expect(result[0].totalValue).toBe(750)
    expect(result[0].itemCount).toBe(4)
    expect(result[0].disciplines.map((d) => d.discipline_name)).toEqual(['Electrical', 'Plumbing'])
  })

  it('returns poolSubContainerId=null, totalValue=0, empty disciplines for a bare project', () => {
    const result = rollupProjects([makeProject()], [], [], [])

    expect(result).toHaveLength(1)
    expect(result[0].poolSubContainerId).toBeNull()
    expect(result[0].disciplineCount).toBe(0)
    expect(result[0].totalValue).toBe(0)
    expect(result[0].disciplines).toEqual([])
  })

  it('counts only ACTIVE disciplines in disciplineCount but still lists inactive tags', () => {
    const pools: ProjectPoolRow[] = [{ id: 'pool1', project_id: 'p1', is_active: true }]
    const disciplineRows: ProjectDisciplineRow[] = [
      { project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
      { project_id: 'p1', discipline_id: 'd2', is_active: false, disciplines: { name: 'Electrical' } },
    ]
    const result = rollupProjects([makeProject()], pools, disciplineRows, [])

    expect(result[0].disciplineCount).toBe(1)
    expect(result[0].disciplines).toHaveLength(2)
  })

  it('isolates per project — a pool/tag for a different project must not leak in', () => {
    const projects: ProjectRow[] = [
      makeProject({ id: 'p1', project_number: 'PRJ-001' }),
      makeProject({ id: 'p2', project_number: 'PRJ-002' }),
    ]
    const pools: ProjectPoolRow[] = [
      { id: 'pool1', project_id: 'p1', is_active: true },
      { id: 'pool2', project_id: 'p2', is_active: true },
    ]
    const disciplineRows: ProjectDisciplineRow[] = [
      { project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
      { project_id: 'p2', discipline_id: 'd2', is_active: true, disciplines: { name: 'Electrical' } },
    ]
    const totals: ProjectSubTotalRow[] = [
      { sub_container_id: 'pool1', total_value: 100, item_count: 1 },
      { sub_container_id: 'pool2', total_value: 900, item_count: 9 },
    ]

    const result = rollupProjects(projects, pools, disciplineRows, totals)
    const p1 = result.find((p) => p.id === 'p1')!
    const p2 = result.find((p) => p.id === 'p2')!

    expect(p1.totalValue).toBe(100)
    expect(p1.disciplines.map((d) => d.discipline_name)).toEqual(['Plumbing'])
    expect(p2.totalValue).toBe(900)
    expect(p2.disciplines.map((d) => d.discipline_name)).toEqual(['Electrical'])
  })

  it('falls back to "Unknown discipline" when the discipline join is null — never a raw id', () => {
    const disciplineRows: ProjectDisciplineRow[] = [
      { project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: null },
    ]
    const result = rollupProjects([makeProject()], [], disciplineRows, [])

    expect(result[0].disciplines[0].discipline_name).toBe('Unknown discipline')
  })

  it('defaults totalValue to 0 when no matching totals row exists (not undefined/NaN)', () => {
    const pools: ProjectPoolRow[] = [{ id: 'pool1', project_id: 'p1', is_active: true }]
    const result = rollupProjects([makeProject()], pools, [], [])

    expect(result[0].totalValue).toBe(0)
    expect(result[0].itemCount).toBe(0)
  })

  it('ignores an inactive pool (deactivated surplus bucket) — poolSubContainerId stays null', () => {
    const pools: ProjectPoolRow[] = [{ id: 'pool1', project_id: 'p1', is_active: false }]
    const result = rollupProjects([makeProject()], pools, [], [
      { sub_container_id: 'pool1', total_value: 999, item_count: 1 },
    ])

    expect(result[0].poolSubContainerId).toBeNull()
    expect(result[0].totalValue).toBe(0)
  })

  it('is pure: does not mutate the input arrays or their objects', () => {
    const projects: ProjectRow[] = [makeProject()]
    const pools: ProjectPoolRow[] = [{ id: 'pool1', project_id: 'p1', is_active: true }]
    const disciplineRows: ProjectDisciplineRow[] = [
      { project_id: 'p1', discipline_id: 'd1', is_active: true, disciplines: { name: 'Plumbing' } },
    ]
    const totals: ProjectSubTotalRow[] = [{ sub_container_id: 'pool1', total_value: 500, item_count: 3 }]
    const snap = (v: unknown) => JSON.parse(JSON.stringify(v))
    const [ps, pl, dr, ts] = [snap(projects), snap(pools), snap(disciplineRows), snap(totals)]

    rollupProjects(projects, pools, disciplineRows, totals)

    expect(projects).toEqual(ps)
    expect(pools).toEqual(pl)
    expect(disciplineRows).toEqual(dr)
    expect(totals).toEqual(ts)
  })

  it('returns an empty array for empty project input', () => {
    expect(rollupProjects([], [], [], [])).toEqual([])
  })

  it('sums multiple totals rows for the same pool defensively', () => {
    const pools: ProjectPoolRow[] = [{ id: 'pool1', project_id: 'p1', is_active: true }]
    const totals: ProjectSubTotalRow[] = [
      { sub_container_id: 'pool1', total_value: 100, item_count: 1 },
      { sub_container_id: 'pool1', total_value: 50, item_count: 1 },
    ]
    const result = rollupProjects([makeProject()], pools, [], totals)

    expect(result[0].totalValue).toBe(150)
  })
})
