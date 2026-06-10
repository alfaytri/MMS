import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from '../db'
import type { LocalCustomer } from '../schema'

const STALE_MS = 30_000

export async function getById(db: MmsCcDb, id: string): Promise<LocalCustomer | undefined> {
  return db.customers.get(id)
}

export async function upsert(db: MmsCcDb, row: LocalCustomer): Promise<void> {
  await db.customers.put(row)
}

export async function upsertMany(db: MmsCcDb, rows: LocalCustomer[]): Promise<void> {
  if (rows.length === 0) return
  await db.customers.bulkPut(rows)
}

export async function deleteById(db: MmsCcDb, id: string): Promise<void> {
  await db.customers.delete(id)
}

export async function lazyFetch(db: MmsCcDb, supabase: SupabaseClient, customerId: string): Promise<void> {
  const cursorKey = `lastCustomerSync:${customerId}`
  const cursor = await db.sync.get(cursorKey)
  if (cursor && typeof cursor.value === 'string') {
    if (Date.now() - new Date(cursor.value).getTime() < STALE_MS) return
  }
  const { data, error } = await supabase
    .from('service_customers')
    .select('id, name, name_ar, customer_type, is_blocked, pending_payment_amount, created_at')
    .eq('id', customerId)
    .maybeSingle()
  if (error) { console.error('[customers.lazyFetch]', error); return }
  if (data) await db.customers.put(data as unknown as LocalCustomer)
  await db.sync.put({ key: cursorKey, value: new Date().toISOString(), updatedAt: Date.now() })
}
