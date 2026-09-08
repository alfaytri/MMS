import { describe, it, expect } from 'vitest'
import { backworkDraftService } from './backworkDraftService'

describe('backworkDraftService', () => {
  it('maps a parent service to a 0-QAR draft (backwork is not charged)', () => {
    const d = backworkDraftService({ id: 'os1', service_id: 'svc1', name: 'AC Service', qty: 2, duration: 90, path: ['AC', 'Split'] })
    expect(d).toEqual({
      serviceId: 'svc1', serviceName: 'AC Service', qty: 2, price: 0,
      duration: 90, path: ['AC', 'Split'], fromTime: null, toTime: null,
    })
  })
  it('falls back to empty serviceId + duration 60 when the parent row is orphaned', () => {
    const d = backworkDraftService({ id: 'os2', service_id: null, name: 'Legacy', qty: 1, duration: null, path: [] })
    expect(d.serviceId).toBe('')
    expect(d.duration).toBe(60)
    expect(d.price).toBe(0)
  })
})
