import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from '../db'
import type { LocalAddress } from '../schema'

const STALE_MS = 30_000

export async function listByCustomer(db: MmsCcDb, customerId: string): Promise<LocalAddress[]> {
  const rows = await db.addresses.where('customer_id').equals(customerId).toArray()
  return rows.sort((a, b) => (a.is_primary === b.is_primary ? 0 : a.is_primary ? -1 : 1))
}

export async function upsertMany(db: MmsCcDb, rows: LocalAddress[]): Promise<void> {
  if (rows.length === 0) return
  await db.addresses.bulkPut(rows)
}

export async function upsert(db: MmsCcDb, row: LocalAddress): Promise<void> {
  await db.addresses.put(row)
}

export async function deleteById(db: MmsCcDb, id: string): Promise<void> {
  await db.addresses.delete(id)
}

export async function lazyFetch(db: MmsCcDb, supabase: SupabaseClient, customerId: string): Promise<void> {
  const cursorKey = `lastAddressesSync:${customerId}`
  const cursor = await db.sync.get(cursorKey)
  if (cursor && typeof cursor.value === 'string') {
    if (Date.now() - new Date(cursor.value).getTime() < STALE_MS) return
  }
  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
  if (error) { console.error('[addresses.lazyFetch]', error); return }
  if (data) await db.addresses.bulkPut(data.map((row) => {
    // customer_addresses stores *_no columns + hyphen address_type; map to LocalAddress shape.
    const r = row as unknown as Record<string, unknown>
    return {
      id:           r.id,
      customer_id:  r.customer_id,
      address_type: (((r.address_type as string) ?? '').replace('-', '_')),
      label:        (r.label as string | null) ?? null,
      unit:         (r.unit_no as string | null) ?? null,
      building:     (r.building_no as string | null) ?? null,
      street:       (r.street_no as string | null) ?? null,
      zone:         (r.zone_no as string | null) ?? null,
      lat:          (r.lat as number | null) ?? null,
      lng:          (r.lng as number | null) ?? null,
      is_primary:   (r.is_primary as boolean) ?? false,
      is_geocoded:  (r.is_geocoded as boolean) ?? false,
      waze_link:    (r.waze_link as string | null) ?? null,
      tags:         (r.tags as string[]) ?? [],
      created_at:   r.created_at,
    } as unknown as LocalAddress
  }))
  await db.sync.put({ key: cursorKey, value: new Date().toISOString(), updatedAt: Date.now() })
}
