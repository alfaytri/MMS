import { describe, it, expect } from 'vitest'
import { addOrBumpService } from '../draft-services'

type Line = { serviceId: string; qty: number; name?: string }
const byServiceId = (s: Line) => s.serviceId

describe('addOrBumpService', () => {
  it('appends a new service', () => {
    const out = addOrBumpService<Line>([], { serviceId: 'a', qty: 1 }, byServiceId)
    expect(out).toEqual([{ serviceId: 'a', qty: 1 }])
  })

  it('bumps quantity when the same node is added again', () => {
    const list: Line[] = [{ serviceId: 'a', qty: 1 }]
    const out = addOrBumpService(list, { serviceId: 'a', qty: 1 }, byServiceId)
    expect(out).toHaveLength(1)
    expect(out[0].qty).toBe(2)
  })

  it('adds a bumped quantity, not just +1', () => {
    const list: Line[] = [{ serviceId: 'a', qty: 2 }]
    const out = addOrBumpService(list, { serviceId: 'a', qty: 3 }, byServiceId)
    expect(out[0].qty).toBe(5)
  })

  it('keeps different nodes as separate lines (different tree paths)', () => {
    const list: Line[] = [{ serviceId: 'a', qty: 1 }]
    const out = addOrBumpService(list, { serviceId: 'b', qty: 1 }, byServiceId)
    expect(out).toHaveLength(2)
    expect(out.map((s) => s.serviceId)).toEqual(['a', 'b'])
  })

  it('does not mutate the input list', () => {
    const list: Line[] = [{ serviceId: 'a', qty: 1 }]
    addOrBumpService(list, { serviceId: 'a', qty: 1 }, byServiceId)
    expect(list[0].qty).toBe(1)
  })

  it('works with an alternate key field (team-leader billables use `id`)', () => {
    type Billable = { id: string; qty: number }
    const list: Billable[] = [{ id: 'x', qty: 1 }]
    const out = addOrBumpService(list, { id: 'x', qty: 2 }, (s) => s.id)
    expect(out).toHaveLength(1)
    expect(out[0].qty).toBe(3)
  })
})
