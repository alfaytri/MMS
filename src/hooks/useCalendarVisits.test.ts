import { describe, it, expect } from 'vitest'
import { groupVisitsByTeam, filterVisitsByType, type CalendarVisit } from './useCalendarVisits'

const makeVisit = (overrides: Partial<CalendarVisit>): CalendarVisit => ({
  id: 'v1',
  source_type: 'order',
  team_id: 'team-a',
  division: 'rsh',
  is_qc: false,
  visit_date: '2026-05-07',
  start_time: '09:00',
  end_time: '11:00',
  visit_type: 'normal_order',
  status: 'scheduled',
  customer_name: 'Al-Sayed',
  customer_id: 'cust-1',
  service_id: null,
  order_number: null,
  customer_phone: null,
  services_summary: null,
  ...overrides,
})

describe('groupVisitsByTeam', () => {
  it('returns empty map for empty array', () => {
    expect(groupVisitsByTeam([])).toEqual(new Map())
  })

  it('groups visits by team_id', () => {
    const visits = [
      makeVisit({ id: 'v1', team_id: 'team-a' }),
      makeVisit({ id: 'v2', team_id: 'team-b' }),
      makeVisit({ id: 'v3', team_id: 'team-a' }),
    ]
    const result = groupVisitsByTeam(visits)
    expect(result.get('team-a')).toHaveLength(2)
    expect(result.get('team-b')).toHaveLength(1)
  })

  it('excludes QC visits', () => {
    const visits = [
      makeVisit({ id: 'v1', team_id: 'team-a', is_qc: false }),
      makeVisit({ id: 'v2', team_id: 'team-qc', is_qc: true }),
    ]
    const result = groupVisitsByTeam(visits)
    expect(result.has('team-qc')).toBe(false)
    expect(result.get('team-a')).toHaveLength(1)
  })
})

describe('filterVisitsByType', () => {
  it('returns all visits when filter set is empty (all selected)', () => {
    const visits = [
      makeVisit({ visit_type: 'normal_order' }),
      makeVisit({ visit_type: 'emergency' }),
    ]
    expect(filterVisitsByType(visits, new Set())).toHaveLength(2)
  })

  it('filters to only selected types', () => {
    const visits = [
      makeVisit({ id: 'v1', visit_type: 'normal_order' }),
      makeVisit({ id: 'v2', visit_type: 'emergency' }),
    ]
    const result = filterVisitsByType(visits, new Set(['emergency']))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('v2')
  })
})
