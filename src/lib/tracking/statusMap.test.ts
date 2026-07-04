import { describe, it, expect } from 'vitest'
import { map17trackTag, STATUS_WEIGHTS, STATUS_MAP_JSON } from './statusMap'

describe('map17trackTag', () => {
  it('maps InTransit to in_transit', () => expect(map17trackTag('InTransit')).toBe('in_transit'))
  it('maps Delivered to delivered',   () => expect(map17trackTag('Delivered')).toBe('delivered'))
  it('maps Exception to delayed',     () => expect(map17trackTag('Exception')).toBe('delayed'))
  it('maps Undelivered to delayed',   () => expect(map17trackTag('Undelivered')).toBe('delayed'))
  it('maps Customs to customs',       () => expect(map17trackTag('Customs')).toBe('customs'))
  it('maps InfoReceived to info_received',       () => expect(map17trackTag('InfoReceived')).toBe('info_received'))
  it('maps OutForDelivery to out_for_delivery', () => expect(map17trackTag('OutForDelivery')).toBe('out_for_delivery'))
  it('maps PickedUp to picked_up',               () => expect(map17trackTag('PickedUp')).toBe('picked_up'))
  it('maps NotFound to not_found',               () => expect(map17trackTag('NotFound')).toBe('not_found'))
  it('lowercases unknown tags',                  () => expect(map17trackTag('FooBar')).toBe('foobar'))
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
