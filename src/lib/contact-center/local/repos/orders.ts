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
    .select('id, order_id, service_customer_id, status, scheduled_date, type, total_amount, invoice_number, order_services(id)')
    .eq('service_customer_id', customerId)
    .order('scheduled_date', { ascending: false })
    .limit(50)
  if (error) { console.error('[orders.lazyFetch]', error); return }
  if (!data) {
    await db.sync.put({ key: cursorKey, value: new Date().toISOString(), updatedAt: Date.now() })
    return
  }

  // Bulk-fetch paid amounts from invoices linked by invoice_number
  const invoiceNumbers = data
    .map((o) => (o as { invoice_number: string | null }).invoice_number)
    .filter((v): v is string => !!v)

  let paidByInvoice = new Map<string, number>()
  if (invoiceNumbers.length > 0) {
    const { data: invs, error: invErr } = await supabase
      .from('so_invoices')
      .select('invoice_id, paid_amount')
      .in('invoice_id', invoiceNumbers)
    if (invErr) console.error('[orders.lazyFetch] invoices', invErr)
    if (invs) {
      paidByInvoice = new Map(
        invs.map((i) => [i.invoice_id as string, Number((i as { paid_amount: number | null }).paid_amount ?? 0)]),
      )
    }
  }

  const rows: LocalOrder[] = data.map((o) => {
    const row = o as {
      id: string; order_id: string; service_customer_id: string; status: string | null;
      scheduled_date: string | null; type: string | null; total_amount: number | null;
      invoice_number: string | null; order_services: { id: string }[] | null;
    }
    return {
      id:                  row.id,
      order_id:            row.order_id,
      service_customer_id: row.service_customer_id,
      status:              row.status,
      scheduled_date:      row.scheduled_date,
      type:                row.type,
      total_amount:        row.total_amount,
      service_count:       row.order_services?.length ?? 0,
      paid_amount:         row.invoice_number ? (paidByInvoice.get(row.invoice_number) ?? 0) : 0,
    }
  })

  await db.orders.bulkPut(rows)
  await db.sync.put({ key: cursorKey, value: new Date().toISOString(), updatedAt: Date.now() })
}
