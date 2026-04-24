import { describe, it, expect } from 'vitest'
import { map17trackTag, STATUS_WEIGHTS, STATUS_MAP_JSON } from './statusMap'

describe('map17trackTag', () => {
  it('maps InTransit to in_transit', () => expect(map17trackTag('InTransit')).toBe('in_transit'))
  it('maps Delivered to delivered',   () => expect(map17trackTag('Delivered')).toBe('delivered'))
  it('maps Exception to delayed',     () => expect(map17trackTag('Exception')).toBe('delayed'))
  it('maps Undelivered to delayed',   () => expect(map17trackTag('Undelivered')).toBe('delayed'))
  it('maps Customs to customs',       () => expect(map17trackTag('Customs')).toBe('customs'))
  it('returns null for InfoReceived', () => expect(map17trackTag('InfoReceived')).toBeNull())
  it('returns null for Pickup',       () => expect(map17trackTag('Pickup')).toBeNull())
  it('returns null for NotFound',     () => expect(map17trackTag('NotFound')).toBeNull())
  it('returns null for unknown tag',  () => expect(map17trackTag('FooBar')).toBeNull())
})

describe('STATUS_WEIGHTS', () => {
  it('delivered outranks all others', () => {
    (['booked', 'in_transit', 'customs', 'delayed'] as const).forEach(s =>
      expect(STATUS_WEIGHTS.delivered).toBeGreaterThan(STATUS_WEIGHTS[s])
    )
  })
  it('delayed outranks customs', () => {
    expect(STATUS_WEIGHTS.delayed).toBeGreaterThan(STATUS_WEIGHTS.customs)
  })
  it('in_transit outranks booked', () => {
    expect(STATUS_WEIGHTS.in_transit).toBeGreaterThan(STATUS_WEIGHTS.booked)
  })
  it('STATUS_MAP_JSON matches STATUS_WEIGHTS', () => {
    expect(STATUS_MAP_JSON).toEqual(STATUS_WEIGHTS)
  })
})
