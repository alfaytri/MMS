import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../../db'
import * as customersRepo from '../customers'
import * as phonesRepo    from '../phones'
import * as addressesRepo from '../addresses'
import * as productsRepo  from '../products'
import * as ordersRepo    from '../orders'

beforeEach(async () => {
  resetDb()
})

describe('customers repo', () => {
  it('upsert + getById', async () => {
    await customersRepo.upsert(getDb('test'), {
      id: 'cust-1', name: 'Acme', name_ar: null,
      customer_type: 'business', is_blocked: false,
      pending_payment_amount: 0, created_at: '2026-06-09T12:00:00Z',
    })
    const got = await customersRepo.getById(getDb('test'), 'cust-1')
    expect(got?.name).toBe('Acme')
  })
})

describe('phones repo', () => {
  it('listByCustomer returns primary first', async () => {
    await phonesRepo.upsertMany(getDb('test'), [
      { id: 'p1', customer_id: 'cust-1', phone: '+97411111111', is_primary: false, label: null, created_at: '2026-06-09T12:00:00Z' },
      { id: 'p2', customer_id: 'cust-1', phone: '+97422222222', is_primary: true,  label: null, created_at: '2026-06-09T12:00:01Z' },
    ])
    const rows = await phonesRepo.listByCustomer(getDb('test'), 'cust-1')
    expect(rows[0].id).toBe('p2')
    expect(rows[1].id).toBe('p1')
  })
})

describe('addresses repo', () => {
  it('listByCustomer returns primary first', async () => {
    await addressesRepo.upsertMany(getDb('test'), [
      { id: 'a1', customer_id: 'cust-1', address_type: 'blue_plate', label: null, unit: null, building: '32', street: '526', zone: '53', lat: null, lng: null, is_primary: false, is_geocoded: false, waze_link: null, tags: [], created_at: '2026-06-09T12:00:00Z' },
      { id: 'a2', customer_id: 'cust-1', address_type: 'blue_plate', label: null, unit: null, building: '40', street: '530', zone: '54', lat: null, lng: null, is_primary: true,  is_geocoded: false, waze_link: null, tags: [], created_at: '2026-06-09T12:00:01Z' },
    ])
    const rows = await addressesRepo.listByCustomer(getDb('test'), 'cust-1')
    expect(rows[0].id).toBe('a2')
  })
})

describe('products repo', () => {
  it('listByCustomer returns all rows for the customer', async () => {
    await productsRepo.upsertMany(getDb('test'), [
      { id: 'pr1', customer_id: 'cust-1', product_name: 'Tank cleaning', notes: null, created_at: '2026-06-09T12:00:00Z' },
      { id: 'pr2', customer_id: 'cust-1', product_name: 'Pest control',  notes: null, created_at: '2026-06-09T12:00:01Z' },
    ])
    const rows = await productsRepo.listByCustomer(getDb('test'), 'cust-1')
    expect(rows.length).toBe(2)
  })
})

describe('orders repo', () => {
  it('listByCustomer returns rows ordered by scheduled_date DESC', async () => {
    await ordersRepo.upsertMany(getDb('test'), [
      { id: 'o1', order_id: 'N/2026/05/0011', service_customer_id: 'cust-1', status: 'completed', scheduled_date: '2026-05-25T00:00:00Z', type: 'tank_cleaning', total_amount: 500, service_count: 1, paid_amount: 0 },
      { id: 'o2', order_id: 'N/2026/05/0016', service_customer_id: 'cust-1', status: 'completed', scheduled_date: '2026-05-31T00:00:00Z', type: 'tank_cleaning', total_amount: 100, service_count: 1, paid_amount: 0 },
    ])
    const rows = await ordersRepo.listByCustomer(getDb('test'), 'cust-1')
    expect(rows.map((r) => r.id)).toEqual(['o2', 'o1'])
  })
})
