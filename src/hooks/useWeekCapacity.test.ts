import { describe, it, expect } from 'vitest'
import {
  computeDayCapacity,
  buildWeekDates,
  type CapacityVisitRow,
  type DaySchedule,
} from './useWeekCapacity'

const DAY_SCHEDULE: DaySchedule = { enabled: true, start: '08:00', end: '17:00', break_minutes: 60 }
const OFF_SCHEDULE: DaySchedule = { enabled: false, start: '08:00', end: '17:00', break_minutes: 0 }

describe('computeDayCapacity', () => {
  it('returns zero scheduled minutes for an off day', () => {
    const result = computeDayCapacity([], OFF_SCHEDULE)
    expect(result.scheduledMinutes).toBe(0)
    expect(result.totalMinutes).toBe(0)
    expect(result.isOff).toBe(true)
  })

  it('computes scheduled minutes from start/end minus break', () => {
    // 08:00 to 17:00 = 540 min, minus 60 break = 480 min
    const result = computeDayCapacity([], DAY_SCHEDULE)
    expect(result.scheduledMinutes).toBe(480)
    expect(result.isOff).toBe(false)
  })

  it('sums total booked minutes from visits', () => {
    const visits: CapacityVisitRow[] = [
      { start_time: '09:00', end_time: '11:00' }, // 120 min
      { start_time: '13:00', end_time: '14:30' }, // 90 min
    ]
    const result = computeDayCapacity(visits, DAY_SCHEDULE)
    expect(result.totalMinutes).toBe(210)
  })

  it('handles visits with null times as 0 minutes', () => {
    const visits: CapacityVisitRow[] = [
      { start_time: null, end_time: null },
    ]
    const result = computeDayCapacity(visits, DAY_SCHEDULE)
    expect(result.totalMinutes).toBe(0)
  })

  it('computes percentage correctly', () => {
    const visits: CapacityVisitRow[] = [
      { start_time: '08:00', end_time: '16:00' }, // 480 min — exactly 100%
    ]
    const result = computeDayCapacity(visits, DAY_SCHEDULE)
    expect(result.percentage).toBe(100)
  })

  it('allows percentage above 100 for overtime', () => {
    const visits: CapacityVisitRow[] = [
      { start_time: '08:00', end_time: '18:00' }, // 600 min > 480 scheduled
    ]
    const result = computeDayCapacity(visits, DAY_SCHEDULE)
    expect(result.percentage).toBeGreaterThan(100)
    expect(result.overflowMinutes).toBeGreaterThan(0)
  })
})

describe('buildWeekDates', () => {
  it('returns 7 dates starting from weekStart', () => {
    const dates = buildWeekDates('2026-05-03') // Sunday
    expect(dates).toHaveLength(7)
    expect(dates[0]).toBe('2026-05-03')
    expect(dates[6]).toBe('2026-05-09')
  })
})
