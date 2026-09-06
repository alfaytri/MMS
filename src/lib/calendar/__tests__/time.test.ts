import { describe, it, expect } from 'vitest'
import {
  fmt12, toMinutes, toMinutesSafe, toHours, HALF_HOUR_SLOTS, formatSlotLabel,
  blockLeftPx, blockWidthPx, assignTracks, computeOvertime,
  workSlotCount, fitCellWidth,
} from '../time'

describe('calendar time', () => {
  it('fmt12', () => {
    expect(fmt12('14:30')).toBe('2:30 PM')
    expect(fmt12('00:00')).toBe('12:00 AM')
    expect(fmt12('12:00')).toBe('12:00 PM')
    expect(fmt12('09:05')).toBe('9:05 AM')
  })
  it('toMinutes / toMinutesSafe / toHours', () => {
    expect(toMinutes('14:30')).toBe(870)
    expect(toMinutesSafe(null)).toBeNull()
    expect(toMinutesSafe('09:30')).toBe(570)
    expect(toHours('09:30')).toBe(9.5)
    expect(toHours(null)).toBeNull()
  })
  it('48-slot axis + labels', () => {
    expect(HALF_HOUR_SLOTS).toHaveLength(48)
    expect(HALF_HOUR_SLOTS[0]).toBe(0)
    expect(HALF_HOUR_SLOTS[47]).toBe(23.5)
    expect(formatSlotLabel(0)).toBe('12AM')
    expect(formatSlotLabel(6)).toBe('6AM')
    expect(formatSlotLabel(6.5)).toBe(':30')
    expect(formatSlotLabel(12)).toBe('12PM')
    expect(formatSlotLabel(15)).toBe('3PM')
  })
  it('block positioning (2 slots per hour)', () => {
    // 9:00–11:00, dayStart 0, cellWidth 36 → left = 9*2*36 = 648, width = 2*2*36 = 144
    expect(blockLeftPx(540, 0, 36)).toBe(648)
    expect(blockWidthPx(540, 660, 36)).toBe(144)
    expect(blockWidthPx(540, 540, 36)).toBe(4) // min
  })
  it('assignTracks stacks overlaps', () => {
    const m = assignTracks([
      { id: 'a', start: 540, end: 660 },
      { id: 'b', start: 600, end: 720 }, // overlaps a
      { id: 'c', start: 720, end: 780 }, // after a → track 0
    ])
    expect(m.get('a')).toBe(0)
    expect(m.get('b')).toBe(1)
    expect(m.get('c')).toBe(0)
  })
  it('computeOvertime early + late segments', () => {
    // work 480–1080 (8:00–18:00), block 420–1140 → early 60min, late 60min
    const ot = computeOvertime(420, 1140, 480, 1080, 36)
    expect(ot.isEarly).toBe(true)
    expect(ot.isLate).toBe(true)
    expect(ot.earlyPx).toBe((60 / 30) * 36)
    expect(ot.latePx).toBe((60 / 30) * 36)
    const none = computeOvertime(540, 660, 480, 1080, 36)
    expect(none.isEarly).toBe(false)
    expect(none.isLate).toBe(false)
  })
  it('workSlotCount', () => {
    expect(workSlotCount(8, 17)).toBe(18)   // 9h → 18 half-hours
    expect(workSlotCount(7, 18)).toBe(22)
    expect(workSlotCount(9, 9)).toBe(1)     // degenerate → min 1
    expect(workSlotCount(10, 9)).toBe(1)    // inverted → min 1
  })
  it('fitCellWidth frames the work window, clamped', () => {
    // 8–17 = 18 slots. 900px / 18 = 50 → cells fit the window at 50px.
    expect(fitCellWidth(900, 8, 17)).toBe(50)
    // Unmeasured → fallback.
    expect(fitCellWidth(0, 8, 17)).toBe(40)
    expect(fitCellWidth(0, 8, 17, { fallback: 36 })).toBe(36)
    // Very wide viewport → clamped to max so cells don't get absurd.
    expect(fitCellWidth(100000, 8, 17)).toBe(88)
    // Very narrow → clamped to min (stays scrollable).
    expect(fitCellWidth(100, 8, 17)).toBe(28)
  })
})
