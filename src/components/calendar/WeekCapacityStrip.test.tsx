import { describe, it, expect } from 'vitest'
import { getBarColor, formatOverflow } from './WeekCapacityStrip'

describe('getBarColor', () => {
  it('returns green for 0–79%', () => {
    expect(getBarColor(0)).toBe('bg-green-500')
    expect(getBarColor(79)).toBe('bg-green-500')
  })

  it('returns amber for 80–99%', () => {
    expect(getBarColor(80)).toBe('bg-amber-400')
    expect(getBarColor(99)).toBe('bg-amber-400')
  })

  it('returns red for 100%+', () => {
    expect(getBarColor(100)).toBe('bg-red-500')
    expect(getBarColor(150)).toBe('bg-red-500')
  })
})

describe('formatOverflow', () => {
  it('returns empty string when no overflow', () => {
    expect(formatOverflow(0)).toBe('')
  })

  it('formats overflow minutes as +Nm', () => {
    expect(formatOverflow(120)).toBe('+120m')
  })
})
