import { describe, it, expect } from 'vitest'
import { normalizeTimestamp, computeEventHash } from './normalize'

describe('normalizeTimestamp', () => {
  it('converts UTC string to ISO-8601', () => {
    expect(normalizeTimestamp('2024-01-15T10:30:00Z')).toBe('2024-01-15T10:30:00.000Z')
  })
  it('converts offset +03:00 to UTC', () => {
    expect(normalizeTimestamp('2024-01-15T13:30:00+03:00')).toBe('2024-01-15T10:30:00.000Z')
  })
  it('returns ISO format for space-separated string', () => {
    expect(normalizeTimestamp('2024-01-15 10:30:00')).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    )
  })
  it('returns original string for unparseable input', () => {
    expect(normalizeTimestamp('not-a-date')).toBe('not-a-date')
  })
})

describe('computeEventHash', () => {
  it('returns same hash for identical inputs', () => {
    const h1 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Picked up')
    const h2 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Picked up')
    expect(h1).toBe(h2)
  })
  it('returns different hash when description changes', () => {
    const h1 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Picked up')
    const h2 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Shanghai facility')
    expect(h1).not.toBe(h2)
  })
  it('returns different hash when location changes', () => {
    const h1 = computeEventHash('2024-01-15T10:30:00.000Z', 'Shanghai', 'Picked up')
    const h2 = computeEventHash('2024-01-15T10:30:00.000Z', 'Beijing', 'Picked up')
    expect(h1).not.toBe(h2)
  })
  it('returns a 64-character hex string', () => {
    expect(computeEventHash('ts', 'loc', 'desc')).toMatch(/^[a-f0-9]{64}$/)
  })
})
