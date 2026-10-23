import { describe, it, expect } from 'vitest'
import { dedupeHandlingTeams, type HandlingOrderRow } from '../useHandlingTeams'

type TeamShape = NonNullable<NonNullable<HandlingOrderRow['order_team_assignments']>[number]['teams']>

function team(id: string, over: Partial<TeamShape> = {}): TeamShape {
  return {
    id,
    name_en:     id.toUpperCase(),
    name_ar:     null,
    phone:       `+9745${id}`,
    division_id: 'd1',
    deleted_at:  null,
    ...over,
  }
}

function order(id: string, teams: TeamShape[]): HandlingOrderRow {
  return {
    id,
    status: 'confirmed',
    order_team_assignments: teams.map((t) => ({ team_id: t.id, teams: t })),
  }
}

describe('dedupeHandlingTeams', () => {
  it('collapses many orders under one team into a single entry with the open-order count', () => {
    const t1 = team('t1')
    const rows = Array.from({ length: 15 }, (_, i) => order(`o${i}`, [t1]))
    const result = dedupeHandlingTeams(rows)
    expect(result).toHaveLength(1)
    expect(result[0].team_id).toBe('t1')
    expect(result[0].open_orders).toBe(15)
  })

  it('returns distinct teams sorted by open-order count descending', () => {
    const t1 = team('t1')
    const t2 = team('t2')
    const rows = [order('a', [t1]), order('b', [t1]), order('c', [t1]), order('d', [t2])]
    const result = dedupeHandlingTeams(rows)
    expect(result.map((r) => [r.team_id, r.open_orders])).toEqual([
      ['t1', 3],
      ['t2', 1],
    ])
  })

  it('excludes teams without a phone number', () => {
    const noPhone = team('t3', { phone: null })
    expect(dedupeHandlingTeams([order('a', [noPhone])])).toEqual([])
  })

  it('excludes deleted teams', () => {
    const deleted = team('t4', { deleted_at: '2026-01-01T00:00:00Z' })
    expect(dedupeHandlingTeams([order('a', [deleted])])).toEqual([])
  })

  it('counts an order once per team even with several assignments to that team', () => {
    const t1 = team('t1')
    const rows: HandlingOrderRow[] = [
      { id: 'o1', status: 'confirmed', order_team_assignments: [
        { team_id: 't1', teams: t1 },
        { team_id: 't1', teams: t1 },
      ] },
    ]
    const result = dedupeHandlingTeams(rows)
    expect(result).toHaveLength(1)
    expect(result[0].open_orders).toBe(1)
  })

  it('handles orders with no assignments and an empty input', () => {
    expect(dedupeHandlingTeams([])).toEqual([])
    expect(dedupeHandlingTeams([{ id: 'o1', status: 'confirmed', order_team_assignments: null }])).toEqual([])
  })
})
