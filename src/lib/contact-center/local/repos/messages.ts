import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from '../db'
import type { LocalMessage } from '../schema'

const STALE_MS = 30_000

export async function getById(db: MmsCcDb, id: string): Promise<LocalMessage | undefined> {
  return db.messages.get(id)
}

export async function getByExternalId(db: MmsCcDb, externalId: string): Promise<LocalMessage | undefined> {
  return db.messages.where('external_id').equals(externalId).first()
}

export async function listByConversation(
  db: MmsCcDb,
  conversationId: string,
  limit = 500,
): Promise<LocalMessage[]> {
  const rows = await db.messages
    .where('[conversation_id+created_at]')
    .between([conversationId, ''], [conversationId, '￿'])
    .limit(limit)
    .toArray()
  return rows.filter((m) => m.deleted_at == null)
}

export async function listByConversations(
  db: MmsCcDb,
  conversationIds: string[],
  limit = 500,
): Promise<LocalMessage[]> {
  if (conversationIds.length === 0) return []
  const rows = await db.messages
    .where('conversation_id').anyOf(conversationIds)
    .toArray()
  return rows
    .filter((m) => m.deleted_at == null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, limit)
}

export async function upsert(db: MmsCcDb, row: LocalMessage): Promise<void> {
  await db.messages.put(row)
}

export async function upsertMany(db: MmsCcDb, rows: LocalMessage[]): Promise<void> {
  if (rows.length === 0) return
  // Defensive merge: never let a realtime payload with null attachments wipe
  // an attachment that already lives in Dexie. The webhook/fetch-messages can
  // briefly emit a row with attachments=null before the canonical URL lands;
  // bulkPut'ing that directly would make the user's just-sent video flicker
  // to "[empty message]" until the next refresh.
  const merged = await Promise.all(rows.map(async (row) => {
    if (row.attachments != null && (row.attachments as unknown as unknown[]).length > 0) return row
    const existing = await db.messages.get(row.id)
    if (existing?.attachments && existing.attachments.length > 0) {
      return { ...row, attachments: existing.attachments }
    }
    return row
  }))
  await db.messages.bulkPut(merged)
}

export async function deleteById(db: MmsCcDb, id: string): Promise<void> {
  await db.messages.delete(id)
}

export async function lazyFetch(
  db: MmsCcDb,
  supabase: SupabaseClient,
  conversationId: string,
): Promise<void> {
  const cursorKey = `lastMessageSync:${conversationId}`
  const cursor = await db.sync.get(cursorKey)
  if (cursor && typeof cursor.value === 'string') {
    const age = Date.now() - new Date(cursor.value).getTime()
    if (age < STALE_MS) return
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) {
    console.error('[messages.lazyFetch]', error)
    return
  }

  if (data && data.length > 0) {
    await db.messages.bulkPut(data as unknown as LocalMessage[])
  }

  await db.sync.put({
    key: cursorKey,
    value: new Date().toISOString(),
    updatedAt: Date.now(),
  })
}
