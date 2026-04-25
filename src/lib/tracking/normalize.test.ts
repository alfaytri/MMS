import { describe, it, expect } from 'vitest'
import { normalizeTimestamp, computeEventHash, mapRawEvents } from './normalize'

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

describe('mapRawEvents', () => {
  it('returns empty array for empty input', () => {
    expect(mapRawEvents([])).toEqual([])
  })

  it('drops events with unmapped 17track tags', () => {
    const events = mapRawEvents([
      { a: '2024-01-15T10:30:00Z', b: 'Shanghai', c: 'Info received', z: 'InfoReceived' },
      { a: '2024-01-15T11:00:00Z', b: 'Shanghai', c: 'Picked up', z: 'Pickup' },
    ])
    expect(events).toHaveLength(0)
  })

  it('maps InTransit events and sets status correctly', () => {
    const events = mapRawEvents([
      { a: '2024-01-15T10:30:00Z', b: 'Shanghai', c: 'In transit', z: 'InTransit' },
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('in_transit')
  })

  it('aliases date to normalizedTimestamp for display compatibility', () => {
    const events = mapRawEvents([
      { a: '2024-01-15T13:30:00+03:00', b: 'Doha', c: 'Delivered', z: 'Delivered' },
    ])
    expect(events[0].date).toBe(events[0].normalizedTimestamp)
    expect(events[0].date).toBe('2024-01-15T10:30:00.000Z')
  })

  it('computes a 64-character hash for each event', () => {
    const events = mapRawEvents([
      { a: '2024-01-15T10:30:00Z', b: 'Dubai', c: 'Customs cleared', z: 'Customs' },
    ])
    expect(events[0].hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('maps notes from description field', () => {
    const events = mapRawEvents([
      { a: '2024-01-15T10:30:00Z', b: 'Riyadh', c: 'Delivery delayed', z: 'Exception' },
    ])
    expect(events[0].notes).toBe('Delivery delayed')
  })
})
