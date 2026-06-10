import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from '../db'
import type { LocalOrder } from '../schema'

const STALE_MS = 30_000

export async function listByCustomer(db: MmsCcDb, customerId: string): Promise<LocalOrder[]> {
  const rows = await db.orders.where('service_customer_id').equals(customerId).toArray()
  return rows.sort((a, b) => {
    const da = a.scheduled_date ?? ''
    const db_ = b.scheduled_date ?? ''
    return db_.localeCompare(da)
  })
}

export async function upsertMany(db: MmsCcDb, rows: LocalOrder[]): Promise<void> {
  if (rows.length === 0) return
  await db.orders.bulkPut(rows)
}

export async function upsert(db: MmsCcDb, row: LocalOrder): Promise<void> {
  await db.orders.put(row)
}

export async function deleteById(db: MmsCcDb, id: string): Promise<void> {
  await db.orders.delete(id)
}

export async function lazyFetch(db: MmsCcDb, supabase: SupabaseClient, customerId: string): Promise<void> {
  const cursorKey = `lastOrdersSync:${customerId}`
  const cursor = await db.sync.get(cursorKey)
  if (cursor && typeof cursor.value === 'string') {
    if (Date.now() - new Date(cursor.value).getTime() < STALE_MS) return
  }
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_id, service_customer_id, status, scheduled_date, type, total_amount')
    .eq('service_customer_id', customerId)
    .order('scheduled_date', { ascending: false })
    .limit(50)
  if (error) { console.error('[orders.lazyFetch]', error); return }
  if (data) await db.orders.bulkPut(data as unknown as LocalOrder[])
  await db.sync.put({ key: cursorKey, value: new Date().toISOString(), updatedAt: Date.now() })
}
