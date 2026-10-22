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
    .from('customers')
    .select('id, name, name_ar, entity_type, is_blocked, created_at')
    .eq('id', customerId)
    .maybeSingle()
  if (error) { console.error('[customers.lazyFetch]', error); return }
  if (data) {
    // Real pending from the tl_invoices-backed RPC (customers has no stored amount).
    const { data: pend } = await supabase.rpc(
      'get_customer_pending_summary' as never, { p_customer_id: customerId } as never,
    )
    const pRow = (Array.isArray(pend) ? pend[0] : pend) as { total_pending?: number } | null
    const r = data as unknown as {
      id: string; name: string; name_ar: string | null
      entity_type: 'individual' | 'business' | null; is_blocked: boolean; created_at: string
    }
    await db.customers.put({
      id:                     r.id,
      name:                   r.name,
      name_ar:                r.name_ar,
      customer_type:          r.entity_type ?? 'individual',
      is_blocked:             r.is_blocked,
      pending_payment_amount: Number(pRow?.total_pending ?? 0),
      created_at:             r.created_at,
    } as LocalCustomer)
  }
  await db.sync.put({ key: cursorKey, value: new Date().toISOString(), updatedAt: Date.now() })
}
