import { it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '@/lib/contact-center/local/db'
import { useLocalOrders } from '../useLocalOrders'

function chainStub(): any {
  const handler: ProxyHandler<object> = {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      return (..._args: unknown[]) => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => chainStub(),
}))

beforeEach(() => { resetDb() })

it('returns orders sorted by scheduled_date desc', async () => {
  await getDb('u').orders.bulkPut([
    { id: 'o1', order_id: 'ORD-001', service_customer_id: 'cust-1',
      status: 'completed', scheduled_date: '2026-06-01', type: 'maintenance', total_amount: 100,
      service_count: 0, paid_amount: 0 },
    { id: 'o2', order_id: 'ORD-002', service_customer_id: 'cust-1',
      status: 'scheduled', scheduled_date: '2026-06-09', type: 'repair', total_amount: 200,
      service_count: 0, paid_amount: 0 },
  ])
  const { result } = renderHook(() => useLocalOrders('u', 'cust-1'))
  await waitFor(() => expect(result.current.orders.length).toBe(2))
  expect(result.current.orders[0].order_id).toBe('ORD-002')
})
