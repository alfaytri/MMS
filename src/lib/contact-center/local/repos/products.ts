import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from '../db'
import type { LocalProduct } from '../schema'

const STALE_MS = 30_000

export async function listByCustomer(db: MmsCcDb, customerId: string): Promise<LocalProduct[]> {
  return db.products.where('customer_id').equals(customerId).toArray()
}

export async function upsertMany(db: MmsCcDb, rows: LocalProduct[]): Promise<void> {
  if (rows.length === 0) return
  await db.products.bulkPut(rows)
}

export async function upsert(db: MmsCcDb, row: LocalProduct): Promise<void> {
  await db.products.put(row)
}

export async function deleteById(db: MmsCcDb, id: string): Promise<void> {
  await db.products.delete(id)
}

export async function lazyFetch(db: MmsCcDb, supabase: SupabaseClient, customerId: string): Promise<void> {
  const cursorKey = `lastProductsSync:${customerId}`
  const cursor = await db.sync.get(cursorKey)
  if (cursor && typeof cursor.value === 'string') {
    if (Date.now() - new Date(cursor.value).getTime() < STALE_MS) return
  }
  const { data, error } = await supabase
    .from('service_customer_products')
    .select('*')
    .eq('customer_id', customerId)
  if (error) { console.error('[products.lazyFetch]', error); return }
  if (data) await db.products.bulkPut(data as unknown as LocalProduct[])
  await db.sync.put({ key: cursorKey, value: new Date().toISOString(), updatedAt: Date.now() })
}
