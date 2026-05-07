import { describe, it, expect } from 'vitest'
import { filterEligibleTeams, type TeamEligibility } from './SwapTeamDialog'
import type { TeamFull } from '@/hooks/useTeams'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'

function makeTeam(overrides: Partial<TeamFull>): TeamFull {
  return {
    // TeamRaw fields
    id: 't1',
    name: 'Team 1',
    name_en: 'Team 1',
    name_ar: null,
    division: 'rsh' as TeamFull['division'],
    is_qc: false,
    is_emergency: false,
    leader_id: null,
    vehicle_id: null,
    schedule_id: null,
    schedule_start: null,
    schedule_end: null,
    phone: null,
    tag: null,
    traccar_device_id: null,
    created_at: null,
    updated_at: null,
    deleted_at: null,
    // TeamFull relation fields
    leader: null,
    members: [],
    vehicle: null,
    schedule: null,
    ...overrides,
  } as TeamFull
}

function makeVisit(overrides: Partial<CalendarVisit>): CalendarVisit {
  return {
    id: 'v1',
    source_type: 'order',
    team_id: 't1',
    division: 'rsh',
    is_qc: false,
    visit_date: '2026-05-07',
    start_time: '09:00',
    end_time: '11:00',
    visit_type: 'normal_order',
    status: 'scheduled',
    customer_name: 'Test',
    customer_id: 'c1',
    service_id: 'svc-1',
    ...overrides,
  }
}

describe('filterEligibleTeams', () => {
  const targetVisit = makeVisit({
    id: 'target',
    team_id: 'team-current',
    start_time: '09:00',
    end_time: '11:00',
    service_id: 'svc-pest',
  })

  const teamSkills: Map<string, string[]> = new Map([
    ['team-b', ['svc-pest', 'svc-cleaning']],
    ['team-c', ['svc-cleaning']],
    ['team-current', ['svc-pest']],
  ])

  it('excludes the current team', () => {
    const teams = [makeTeam({ id: 'team-current' }), makeTeam({ id: 'team-b' })]
    const result = filterEligibleTeams(teams, targetVisit, [], teamSkills)
    expect(result.find(r => r.team.id === 'team-current')).toBeUndefined()
  })

  it('excludes QC teams', () => {
    const teams = [makeTeam({ id: 'team-qc', is_qc: true }), makeTeam({ id: 'team-b' })]
    const result = filterEligibleTeams(teams, targetVisit, [], teamSkills)
    expect(result.find(r => r.team.id === 'team-qc')).toBeUndefined()
  })

  it('marks a team missing the required skill as ineligible', () => {
    const teams = [makeTeam({ id: 'team-c' })]
    const result = filterEligibleTeams(teams, targetVisit, [], teamSkills)
    const entry = result.find(r => r.team.id === 'team-c')
    expect(entry?.eligible).toBe(false)
    expect(entry?.reason).toMatch(/skill/i)
  })

  it('marks a team with the required skill as eligible', () => {
    const teams = [makeTeam({ id: 'team-b' })]
    const result = filterEligibleTeams(teams, targetVisit, [], teamSkills)
    const entry = result.find(r => r.team.id === 'team-b')
    expect(entry?.eligible).toBe(true)
  })

  it('marks a team with time conflict as ineligible', () => {
    const teams = [makeTeam({ id: 'team-b' })]
    const existingVisits: CalendarVisit[] = [
      makeVisit({ id: 'conflict', team_id: 'team-b', start_time: '10:00', end_time: '12:00' }),
    ]
    const result = filterEligibleTeams(teams, targetVisit, existingVisits, teamSkills)
    const entry = result.find(r => r.team.id === 'team-b')
    expect(entry?.eligible).toBe(false)
    expect(entry?.reason).toMatch(/conflict/i)
  })

  it('marks a team with no conflict as eligible', () => {
    const teams = [makeTeam({ id: 'team-b' })]
    const existingVisits: CalendarVisit[] = [
      makeVisit({ id: 'other', team_id: 'team-b', start_time: '13:00', end_time: '14:00' }),
    ]
    const result = filterEligibleTeams(teams, targetVisit, existingVisits, teamSkills)
    const entry = result.find(r => r.team.id === 'team-b')
    expect(entry?.eligible).toBe(true)
  })

  it('treats missing service_id as no skill requirement (all teams eligible)', () => {
    const visit = makeVisit({ id: 'no-svc', team_id: 'team-current', service_id: null })
    const teams = [makeTeam({ id: 'team-c' })]
    const result = filterEligibleTeams(teams, visit, [], teamSkills)
    const entry = result.find(r => r.team.id === 'team-c')
    expect(entry?.eligible).toBe(true)
  })
})
