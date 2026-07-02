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

  it('maps v2.2 events with stage field', () => {
    const events = mapRawEvents([
      { time_iso: '2024-01-15T13:30:00+03:00', time_utc: '2024-01-15T10:30:00Z', location: 'Doha', description: 'Delivered to recipient', stage: 'Delivered', sub_status: 'Delivered_Other' },
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('delivered')
    expect(events[0].location).toBe('Doha')
    expect(events[0].notes).toBe('Delivered to recipient')
  })

  it('falls back to sub_status prefix when stage is null', () => {
    const events = mapRawEvents([
      { time_iso: '2024-01-15T08:09:10+03:00', time_utc: '2024-01-15T05:09:10Z', location: 'Al Rayyan', description: 'Parcel arrived at station', stage: null, sub_status: 'InTransit_Other' },
    ])
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('in_transit')
  })

  it('uses time_utc for normalization', () => {
    const events = mapRawEvents([
      { time_iso: '2024-01-15T13:30:00+03:00', time_utc: '2024-01-15T10:30:00Z', location: 'Doha', description: 'Test', stage: 'Delivered', sub_status: 'Delivered_Other' },
    ])
    expect(events[0].date).toBe('2024-01-15T10:30:00.000Z')
  })

  it('handles null location', () => {
    const events = mapRawEvents([
      { time_iso: '2024-01-15T10:00:00Z', time_utc: '2024-01-15T10:00:00Z', location: null, description: 'order created', stage: 'InfoReceived', sub_status: 'InfoReceived' },
    ])
    expect(events[0].location).toBe('')
    expect(events[0].status).toBe('info_received')
  })

  it('computes a 64-character hash for each event', () => {
    const events = mapRawEvents([
      { time_iso: '2024-01-15T10:30:00Z', time_utc: '2024-01-15T10:30:00Z', location: 'Dubai', description: 'Customs cleared', stage: 'Customs', sub_status: 'Customs_Other' },
    ])
    expect(events[0].hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
