// src/lib/optimumfleet.mapping.test.ts
import { describe, it, expect } from 'vitest'
import {
  mapLiveDataToVehicle,
  normalizeStatus,
  parseUffizioDate,
  hashImei,
  toTraccarPosition,
  toVehicleMapData,
  type UffizioVehicleData,
} from './optimumfleet'

const baseRow: UffizioVehicleData = {
  Vehicle_Name: 'HILUX-01',
  Vehicle_No: '123456',
  Imeino: '860123456789012',
  Vehicletype: 'Pickup',
  Company: 'ALFAYTRI',
  Latitude: '25.2854',
  Longitude: '51.5310',
  Speed: '42',
  Angle: '270',
  IGN: '1',
  Status: 'Running',
  Datetime: '16-09-2026 08:30',
  Location: 'Doha, Qatar',
  Driver_First_Name: 'Ahmed',
  Driver_Last_Name: 'Khan',
  Odometer: '10450',
  battery_percentage: 87,
}

describe('normalizeStatus', () => {
  it('treats Running / any positive speed as moving', () => {
    expect(normalizeStatus('Running', true, 0)).toBe('moving')
    expect(normalizeStatus('Stop', false, 15)).toBe('moving') // speed wins
    expect(normalizeStatus('Moving', true, 40)).toBe('moving')
  })
  it('maps Idle (or ignition on, no motion) to idle', () => {
    expect(normalizeStatus('Idle', true, 0)).toBe('idle')
    expect(normalizeStatus('', true, 0)).toBe('idle')
  })
  it('maps Stop / parked / ignition-off to stopped', () => {
    expect(normalizeStatus('Stop', false, 0)).toBe('stopped')
    expect(normalizeStatus('Parked', false, 0)).toBe('stopped')
    expect(normalizeStatus('', false, 0)).toBe('stopped')
  })
  it('maps Inactive / NoData / Offline to offline', () => {
    expect(normalizeStatus('Inactive', false, 0)).toBe('offline')
    expect(normalizeStatus('No Data', false, 0)).toBe('offline')
    expect(normalizeStatus('NoData', true, 0)).toBe('offline')
    expect(normalizeStatus('Offline', false, 0)).toBe('offline')
  })
})

describe('parseUffizioDate', () => {
  it('parses dd-MM-yyyy HH:mm as UTC ISO', () => {
    expect(parseUffizioDate('16-09-2026 08:30')).toBe('2026-09-16T08:30:00.000Z')
  })
  it('parses dd-MM-yyyy HH:mm:ss', () => {
    expect(parseUffizioDate('01-02-2026 23:59:45')).toBe('2026-02-01T23:59:45.000Z')
  })
  it('parses yyyy-MM-dd HH:mm:ss', () => {
    expect(parseUffizioDate('2026-09-16 08:30:00')).toBe('2026-09-16T08:30:00.000Z')
  })
  it('returns null for empty / unparseable input', () => {
    expect(parseUffizioDate('')).toBeNull()
    expect(parseUffizioDate(null)).toBeNull()
    expect(parseUffizioDate('not a date')).toBeNull()
  })
})

describe('hashImei', () => {
  it('is stable, positive, and safe-integer', () => {
    const a = hashImei('860123456789012')
    expect(a).toBe(hashImei('860123456789012'))
    expect(a).toBeGreaterThan(0)
    expect(Number.isSafeInteger(a)).toBe(true)
  })
  it('differs for different keys', () => {
    expect(hashImei('860123456789012')).not.toBe(hashImei('860123456789013'))
  })
})

describe('mapLiveDataToVehicle', () => {
  it('maps a running vehicle to the full normalised shape', () => {
    const v = mapLiveDataToVehicle(baseRow)!
    expect(v).not.toBeNull()
    expect(v.imei).toBe('860123456789012')
    expect(v.vehicleId).toBe('of:860123456789012')
    expect(v.deviceId).toBe(hashImei('860123456789012'))
    expect(v.name).toBe('HILUX-01')
    expect(v.plate).toBe('123456')
    expect(v.type).toBe('Pickup')
    expect(v.latitude).toBeCloseTo(25.2854, 4)
    expect(v.longitude).toBeCloseTo(51.531, 3)
    expect(v.speedKmh).toBe(42)
    expect(v.heading).toBe(270)
    expect(v.status).toBe('moving')
    expect(v.motion).toBe(true)
    expect(v.ignition).toBe(true)
    expect(v.lastUpdate).toBe('2026-09-16T08:30:00.000Z')
    expect(v.driver).toBe('Ahmed Khan')
    expect(v.location).toBe('Doha, Qatar')
    expect(v.odometer).toBe(10450)
    expect(v.battery).toBe(87)
    expect(v.hasFix).toBe(true)
  })

  it('idle vehicle → idle status, ignition on, no motion', () => {
    const v = mapLiveDataToVehicle({ ...baseRow, Status: 'Idle', Speed: '0', IGN: '1' })!
    expect(v.status).toBe('idle')
    expect(v.motion).toBe(false)
    expect(v.ignition).toBe(true)
  })

  it('stopped vehicle → stopped status, ignition off', () => {
    const v = mapLiveDataToVehicle({ ...baseRow, Status: 'Stop', Speed: '0', IGN: '0' })!
    expect(v.status).toBe('stopped')
    expect(v.motion).toBe(false)
    expect(v.ignition).toBe(false)
  })

  it('inactive vehicle → offline', () => {
    const v = mapLiveDataToVehicle({ ...baseRow, Status: 'Inactive', Speed: '0', IGN: '0' })!
    expect(v.status).toBe('offline')
  })

  it('flags no GPS fix when lat/lng are 0 or missing', () => {
    expect(mapLiveDataToVehicle({ ...baseRow, Latitude: '0', Longitude: '0' })!.hasFix).toBe(false)
    expect(mapLiveDataToVehicle({ ...baseRow, Latitude: undefined, Longitude: undefined })!.hasFix).toBe(false)
  })

  it('returns null when the row has no identity', () => {
    expect(mapLiveDataToVehicle({ Latitude: '25', Longitude: '51' })).toBeNull()
    expect(mapLiveDataToVehicle({})).toBeNull()
  })

  it('tolerates missing optional fields', () => {
    const v = mapLiveDataToVehicle({ Imeino: '111', Latitude: '25.1', Longitude: '51.2' })!
    expect(v.imei).toBe('111')
    expect(v.driver).toBeNull()
    expect(v.odometer).toBeNull()
    expect(v.battery).toBeNull()
    expect(v.heading).toBe(0)
    expect(v.speedKmh).toBe(0)
  })

  it('normalises heading into 0–359', () => {
    expect(mapLiveDataToVehicle({ ...baseRow, Angle: '365' })!.heading).toBe(5)
    expect(mapLiveDataToVehicle({ ...baseRow, Angle: '-90' })!.heading).toBe(270)
  })
})

describe('adapters to the map contract', () => {
  it('toVehicleMapData carries identity with the synthetic numeric id', () => {
    const v = mapLiveDataToVehicle(baseRow)!
    expect(toVehicleMapData(v)).toEqual({
      vehicleId: 'of:860123456789012',
      name: 'HILUX-01',
      plate: '123456',
      type: 'Pickup',
      traccarDeviceId: v.deviceId,
    })
  })

  it('toTraccarPosition matches the vehicle by deviceId and carries motion/ignition', () => {
    const v = mapLiveDataToVehicle(baseRow)!
    const p = toTraccarPosition(v)
    expect(p.deviceId).toBe(v.deviceId)
    expect(p.latitude).toBeCloseTo(25.2854, 4)
    expect(p.longitude).toBeCloseTo(51.531, 3)
    expect(p.speed).toBe(42)
    expect(p.course).toBe(270)
    expect(p.attributes.motion).toBe(true)
    expect(p.attributes.ignition).toBe(true)
    expect(p.deviceTime).toBe('2026-09-16T08:30:00.000Z')
  })

  it('zeroes position speed for an offline vehicle with a stale non-zero Speed', () => {
    // Inactive/NoData is resolved before the speed check, so a stale Speed can't
    // flip the marker to "moving" — the emitted position speed must be 0.
    const stale = mapLiveDataToVehicle({ ...baseRow, Status: 'Inactive', Speed: '20', IGN: '0' })!
    expect(stale.status).toBe('offline')
    expect(stale.motion).toBe(false)
    expect(toTraccarPosition(stale).speed).toBe(0)
  })
})
