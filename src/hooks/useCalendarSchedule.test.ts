import { describe, it, expect } from 'vitest'
import { parseCalendarSchedule, deriveCalendarScheduleRaw, type CalendarScheduleRaw } from './useCalendarSchedule'

describe('parseCalendarSchedule', () => {
  it('returns defaults when value is null', () => {
    const result = parseCalendarSchedule(null)
    expect(result).toEqual({
      mode: 'normal',
      day_start: 7,
      day_end: 18,
      scroll_to: 7,
      label: '7 AM – 6 PM · Normal',
    })
  })

  it('parses a valid normal schedule', () => {
    const raw: CalendarScheduleRaw = { mode: 'normal', day_start: 8, day_end: 17, scroll_to: 8 }
    const result = parseCalendarSchedule(raw)
    expect(result.mode).toBe('normal')
    expect(result.day_start).toBe(8)
    expect(result.day_end).toBe(17)
    expect(result.scroll_to).toBe(8)
  })

  it('parses a ramadan schedule', () => {
    const raw: CalendarScheduleRaw = { mode: 'ramadan', day_start: 9, day_end: 15, scroll_to: 9 }
    const result = parseCalendarSchedule(raw)
    expect(result.mode).toBe('ramadan')
  })

  it('builds a readable label', () => {
    const raw: CalendarScheduleRaw = { mode: 'normal', day_start: 8, day_end: 17, scroll_to: 8 }
    const result = parseCalendarSchedule(raw)
    expect(result.label).toBe('8 AM – 5 PM · Normal')
  })

  it('formats ramadan label', () => {
    const raw: CalendarScheduleRaw = { mode: 'ramadan', day_start: 9, day_end: 15, scroll_to: 9 }
    const result = parseCalendarSchedule(raw)
    expect(result.label).toBe('9 AM – 3 PM · Ramadan')
  })
})

describe('deriveCalendarScheduleRaw', () => {
  it('returns defaults for null / no enabled days', () => {
    expect(deriveCalendarScheduleRaw(null)).toEqual({ mode: 'normal', day_start: 7, day_end: 18, scroll_to: 7 })
    expect(deriveCalendarScheduleRaw({ sun: { enabled: false, start: '08:00', end: '17:00' } }))
      .toEqual({ mode: 'normal', day_start: 7, day_end: 18, scroll_to: 7 })
  })

  it('spans earliest start to latest end across enabled days', () => {
    const raw = deriveCalendarScheduleRaw({
      sun: { enabled: true, start: '08:00', end: '17:00' },
      mon: { enabled: true, start: '06:30', end: '19:30' }, // 06:xx→6, 19:30→20
      fri: { enabled: false, start: '05:00', end: '23:00' }, // ignored (disabled)
    })
    expect(raw.day_start).toBe(6)
    expect(raw.day_end).toBe(20)
    expect(raw.scroll_to).toBe(6)
  })

  it('floors the window to at least one hour when a day is inverted', () => {
    // Enabled day with end before start → naive max(ends) would sit at/under day_start.
    const raw = deriveCalendarScheduleRaw({
      sun: { enabled: true, start: '17:00', end: '05:00' },
    })
    expect(raw.day_start).toBe(17)
    expect(raw.day_end).toBe(18) // clamped to day_start + 1, not 5
  })
})
