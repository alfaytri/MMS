import { it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '@/lib/contact-center/local/db'
import { useLocalCustomer } from '../useLocalCustomer'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

it('returns customer, phones, addresses, products for the given customerId', async () => {
  const db = getDb('u')
  await db.customers.put({
    id: 'cust-1', name: 'Alice', name_ar: null, customer_type: 'individual',
    is_blocked: false, pending_payment_amount: 0, created_at: '2026-06-09T12:00:00Z',
  })
  await db.phones.put({
    id: 'ph-1', customer_id: 'cust-1', phone: '+97412345678',
    is_primary: true, label: null, created_at: '2026-06-09T12:00:00Z',
  })
  await db.addresses.put({
    id: 'addr-1', customer_id: 'cust-1', address_type: 'google_coords',
    label: 'Home', unit: null, building: null, street: null, zone: null,
    lat: 25.3, lng: 51.5, is_primary: true, is_geocoded: true,
    waze_link: null, tags: [], created_at: '2026-06-09T12:00:00Z',
  })
  await db.products.put({
    id: 'prod-1', customer_id: 'cust-1', product_name: 'AC Unit',
    notes: null, created_at: '2026-06-09T12:00:00Z',
  })

  const { result } = renderHook(() => useLocalCustomer('u', 'cust-1'))
  await waitFor(() => expect(result.current.customer).not.toBeNull())
  expect(result.current.customer?.name).toBe('Alice')
  expect(result.current.phones).toHaveLength(1)
  expect(result.current.addresses).toHaveLength(1)
  expect(result.current.products).toHaveLength(1)
})
