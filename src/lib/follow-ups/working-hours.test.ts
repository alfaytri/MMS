import { describe, it, expect } from 'vitest'
import { workingHoursForDate } from './working-hours'

describe('workingHoursForDate', () => {
  // 2026-06-20 is a Saturday, 2026-06-22 is a Monday (UTC).
  const SATURDAY = '2026-06-20'
  const MONDAY = '2026-06-22'

  const days = {
    sun: { enabled: true, start: '08:00', end: '17:00' },
    mon: { enabled: true, start: '07:30', end: '16:30' },
    tue: { enabled: true, start: '08:00', end: '17:00' },
    wed: { enabled: true, start: '08:00', end: '17:00' },
    thu: { enabled: true, start: '08:00', end: '17:00' },
    fri: { enabled: false, start: '08:00', end: '17:00' },
    sat: { enabled: false, start: '08:00', end: '17:00' },
  }

  it('reads the requested weekday’s hours', () => {
    expect(workingHoursForDate(days, MONDAY)).toEqual({ working_from: '07:30', working_to: '16:30' })
  })

  it('falls back to the default window when that day is disabled', () => {
    // Saturday is off in this schedule → default 08:00–18:00.
    expect(workingHoursForDate(days, SATURDAY)).toEqual({ working_from: '08:00', working_to: '18:00' })
  })

  it('falls back to the default window when there is no schedule', () => {
    expect(workingHoursForDate(null, MONDAY)).toEqual({ working_from: '08:00', working_to: '18:00' })
  })

  it('falls back when the day config is incomplete', () => {
    const partial = { mon: { enabled: true, start: '09:00' } } // no end
    expect(workingHoursForDate(partial, MONDAY)).toEqual({ working_from: '08:00', working_to: '18:00' })
  })
})
