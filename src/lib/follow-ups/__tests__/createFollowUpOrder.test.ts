import { describe, it, expect } from 'vitest'
import { buildFollowUpOrderRows } from '../createFollowUpOrder'

describe('buildFollowUpOrderRows', () => {
  it('sums total from new_services only (reused are 0 QAR)', () => {
    const rows = buildFollowUpOrderRows({
      orderId: 'O1',
      reused_services: [
        { parent_order_service_id: 'p1', name: 'X', qty: 1, duration: 30 },
      ],
      new_services: [
        { service_id: 's2', name: 'Y', path: ['a','b'], qty: 2, price: 50, duration: 60 },
      ],
    })
    expect(rows.total_amount).toBe(100)
    expect(rows.order_services).toHaveLength(2)
    expect(rows.order_services[0].price).toBe(0)
    expect(rows.order_services[1].price).toBe(50)
  })

  it('total = 0 when no new services', () => {
    const rows = buildFollowUpOrderRows({
      orderId: 'O1',
      reused_services: [{ parent_order_service_id: 'p1', name: 'X', qty: 1, duration: 30 }],
      new_services: [],
    })
    expect(rows.total_amount).toBe(0)
    expect(rows.order_services).toHaveLength(1)
  })
})
