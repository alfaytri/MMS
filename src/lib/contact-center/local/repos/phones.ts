import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from '../db'
import type { LocalPhone } from '../schema'

const STALE_MS = 30_000

export async function listByCustomer(db: MmsCcDb, customerId: string): Promise<LocalPhone[]> {
  const rows = await db.phones.where('customer_id').equals(customerId).toArray()
  return rows.sort((a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1))
}

export async function upsertMany(db: MmsCcDb, rows: LocalPhone[]): Promise<void> {
  if (rows.length === 0) return
  await db.phones.bulkPut(rows)
}

export async function upsert(db: MmsCcDb, row: LocalPhone): Promise<void> {
  await db.phones.put(row)
}

export async function deleteById(db: MmsCcDb, id: string): Promise<void> {
  await db.phones.delete(id)
}

export async function lazyFetch(db: MmsCcDb, supabase: SupabaseClient, customerId: string): Promise<void> {
  const cursorKey = `lastPhonesSync:${customerId}`
  const cursor = await db.sync.get(cursorKey)
  if (cursor && typeof cursor.value === 'string') {
    if (Date.now() - new Date(cursor.value).getTime() < STALE_MS) return
  }
  const { data, error } = await supabase
    .from('service_customer_phones')
    .select('*')
    .eq('customer_id', customerId)
  if (error) { console.error('[phones.lazyFetch]', error); return }
  if (data) await db.phones.bulkPut(data as unknown as LocalPhone[])
  await db.sync.put({ key: cursorKey, value: new Date().toISOString(), updatedAt: Date.now() })
}
