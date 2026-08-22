// src/lib/follow-ups/__tests__/availability.test.ts
import { describe, expect, it } from 'vitest'
import { computeAvailability, type Booking } from '../availability'

describe('computeAvailability', () => {
  const team = { working_from: '08:00', working_to: '18:00' }

  it('returns no conflict when window is fully free', () => {
    const out = computeAvailability({
      team,
      bookings: [],
      requested: { date: '2026-06-20', from: '10:00', to: '12:00' },
    })
    expect(out).toEqual({ ok: true })
  })

  it('returns conflict + free slots same/next day when window overlaps a booking', () => {
    const bookings: Booking[] = [
      { date: '2026-06-20', from: '09:00', to: '11:00' },
    ]
    const out = computeAvailability({
      team,
      bookings,
      requested: { date: '2026-06-20', from: '10:00', to: '12:00' },
    })
    if (out.ok) throw new Error('expected conflict')
    expect(out.ok).toBe(false)
    expect(out.free_slots).toEqual([
      { date: '2026-06-20', from: '11:00', to: '18:00' },
      { date: '2026-06-21', from: '08:00', to: '18:00' },
    ])
  })

  it('omits free slots shorter than 60 minutes', () => {
    const bookings: Booking[] = [
      { date: '2026-06-20', from: '08:00', to: '17:30' }, // only 30 min free at end
    ]
    const out = computeAvailability({
      team,
      bookings,
      requested: { date: '2026-06-20', from: '09:00', to: '11:00' },
    })
    if (out.ok) throw new Error('expected conflict')
    // Same day has only 17:30–18:00 free (30 min) — excluded
    expect(out.free_slots.find((s) => s.date === '2026-06-20')).toBeUndefined()
  })

  it('treats touching slots as non-overlapping (10–12 and 12–14)', () => {
    const out = computeAvailability({
      team,
      bookings: [{ date: '2026-06-20', from: '10:00', to: '12:00' }],
      requested: { date: '2026-06-20', from: '12:00', to: '14:00' },
    })
    expect(out).toEqual({ ok: true })
  })
})
