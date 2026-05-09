import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getWarrantyInfo, formatAddressLine } from '../warrantyUtils'
import type { CustomerAddress } from '@/types/orders'

describe('getWarrantyInfo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-09'))
  })

  it('returns expired when no warranty', () => {
    const result = getWarrantyInfo(null, 0)
    expect(result.status).toBe('expired')
  })

  it('returns expired when past expiry date', () => {
    const result = getWarrantyInfo('2026-01-01', 12)
    expect(result.status).toBe('expired')
    expect(result.label).toBe('Warranty expired')
  })

  it('returns expiring_soon within 30 days', () => {
    const result = getWarrantyInfo('2026-05-25', 12)
    expect(result.status).toBe('expiring_soon')
    expect(result.label).toMatch(/Expires in \d+ days/)
  })

  it('returns active with months remaining', () => {
    const result = getWarrantyInfo('2027-05-09', 24)
    expect(result.status).toBe('active')
    expect(result.label).toMatch(/\d+ months remaining/)
  })
})

describe('formatAddressLine', () => {
  const base: CustomerAddress = {
    id: '1', customer_id: '1', phone_id: '1', label: null,
    address_type: 'blue_plate', blue_plate_no: 'BP123',
    unit_no: '5', building_no: '58', street_no: '662', zone_no: '70',
    lat: null, lng: null,
    is_primary: false, created_at: '2026-01-01'
  }

  it('formats blue plate address from parts', () => {
    const result = formatAddressLine(base)
    expect(result).toBe('U-5, B 58, St 662, Zone 70, Qatar')
  })

  it('formats coordinates address', () => {
    const coords: CustomerAddress = { ...base, address_type: 'coordinates', lat: 25.3764, lng: 51.448 }
    expect(formatAddressLine(coords)).toBe('25.3764, 51.4480')
  })

  it('returns fallback for empty coords', () => {
    const empty: CustomerAddress = { ...base, address_type: 'coordinates', lat: null, lng: null }
    expect(formatAddressLine(empty)).toBe('Address on file')
  })
})
