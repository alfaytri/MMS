import { describe, it, expect } from 'vitest'
import { parseCalendarSchedule, type CalendarScheduleRaw } from './useCalendarSchedule'

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
