import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from '../db'
import type { LocalConversation } from '../schema'

const STALE_MS = 30_000

export async function getById(db: MmsCcDb, id: string): Promise<LocalConversation | undefined> {
  return db.conversations.get(id)
}

export async function listByProvider(
  db: MmsCcDb,
  provider: 'wati' | 'whapi',
  limit = 200,
): Promise<LocalConversation[]> {
  return db.conversations
    .where('provider').equals(provider)
    .reverse()
    .sortBy('last_message_at')
    .then((rows) => rows.slice(0, limit))
}

export async function listAll(db: MmsCcDb, limit = 300): Promise<LocalConversation[]> {
  return db.conversations
    .orderBy('last_message_at')
    .reverse()
    .limit(limit)
    .toArray()
}

export async function upsert(db: MmsCcDb, row: LocalConversation): Promise<void> {
  await db.conversations.put(row)
}

export async function upsertMany(db: MmsCcDb, rows: LocalConversation[]): Promise<void> {
  await db.conversations.bulkPut(rows)
}

export async function deleteById(db: MmsCcDb, id: string): Promise<void> {
  await db.conversations.delete(id)
}

export async function lazyFetch(
  db: MmsCcDb,
  supabase: SupabaseClient,
  provider: 'wati' | 'whapi',
): Promise<void> {
  const cursorKey = `lastConversationSync:${provider}`
  const cursor = await db.sync.get(cursorKey)
  if (cursor && typeof cursor.value === 'string') {
    const age = Date.now() - new Date(cursor.value).getTime()
    if (age < STALE_MS) return
  }

  const { data, error } = await supabase
    .from('chat_conversations')
    .select(`
      id, customer_id, customer_id_v2, conversation_type, wati_phone, wati_contact_name,
      last_message, last_message_at, unread_count, assigned_agent, is_opened,
      wati_status, provider, created_at,
      service_customers:customer_id_v2 ( name )
    `)
    .eq('provider', provider)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  if (error) {
    console.error('[conversations.lazyFetch]', error)
    return
  }

  if (data && data.length > 0) {
    // Flatten the joined service_customers.name into customer_name so Dexie
    // stays a flat shape (no nested objects in the row), matching the rest
    // of the LocalConversation interface.
    const rows: LocalConversation[] = (data as unknown as Array<LocalConversation & {
      service_customers?: { name?: string | null } | null
    }>).map((r) => {
      const { service_customers, ...rest } = r
      return { ...rest, customer_name: service_customers?.name ?? null }
    })
    await db.conversations.bulkPut(rows)
  }

  await db.sync.put({
    key: cursorKey,
    value: new Date().toISOString(),
    updatedAt: Date.now(),
  })
}
