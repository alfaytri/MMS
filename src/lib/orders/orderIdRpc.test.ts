import { describe, it, expect } from 'vitest'
import { orderIdRpcFor } from './orderIdRpc'

describe('orderIdRpcFor', () => {
  it('normal order → next_order_id', () => {
    expect(orderIdRpcFor('order', 'normal')).toBe('next_order_id')
  })
  it('wait-list order → next_order_id (waitlist is a status, not a prefix)', () => {
    expect(orderIdRpcFor('order', 'waitlist')).toBe('next_order_id')
  })
  it('emergency order → next_emergency_order_id', () => {
    expect(orderIdRpcFor('order', 'emergency')).toBe('next_emergency_order_id')
  })
  it('backwork → next_backwork_order_id regardless of mode', () => {
    expect(orderIdRpcFor('backwork', 'normal')).toBe('next_backwork_order_id')
    expect(orderIdRpcFor('backwork', 'emergency')).toBe('next_backwork_order_id')
  })
  it('follow-up → next_follow_up_order_id', () => {
    expect(orderIdRpcFor('follow-up', 'normal')).toBe('next_follow_up_order_id')
  })
})
