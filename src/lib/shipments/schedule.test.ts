import { describe, it, expect } from 'vitest'
import { currentPlanned, actualDate, legHistory, type ScheduleRevision } from './schedule'

const revs: ScheduleRevision[] = [
  { leg: 'etd', revision_type: 'original', date_value: '2026-08-20', created_at: '2026-08-01T10:00:00Z' },
  { leg: 'etd', revision_type: 'updated',  date_value: '2026-08-24', created_at: '2026-08-19T09:00:00Z' },
  { leg: 'etd', revision_type: 'actual',   date_value: '2026-08-25', created_at: '2026-08-25T20:00:00Z' },
  { leg: 'eta', revision_type: 'original', date_value: '2026-09-10', created_at: '2026-08-01T10:00:00Z' },
]

describe('schedule', () => {
  it('current planned = newest non-actual', () => {
    expect(currentPlanned(revs, 'etd')).toBe('2026-08-24')
    expect(currentPlanned(revs, 'eta')).toBe('2026-09-10')
    expect(currentPlanned([], 'etd')).toBeNull()
  })
  it('actual is the actual row', () => {
    expect(actualDate(revs, 'etd')).toBe('2026-08-25')
    expect(actualDate(revs, 'eta')).toBeNull()
  })
  it('legHistory is chronological (ties original -> updated -> actual)', () => {
    expect(legHistory(revs, 'etd').map((r) => r.revision_type)).toEqual(['original', 'updated', 'actual'])
    expect(legHistory(revs, 'eta').map((r) => r.revision_type)).toEqual(['original'])
  })
})
