import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../db'
import { prune } from '../retention'

beforeEach(async () => { resetDb() })

function isoDaysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString()
}

describe('retention.prune', () => {
  it('drops messages older than 30 days but keeps the 20 newest per conversation', async () => {
    const c = 'c-1'
    await getDb('test').conversations.put({
      id: c, customer_id: null, customer_id_v2: null,
      conversation_type: 'customer', wati_phone: null, wati_contact_name: null,
      last_message: null, last_message_at: isoDaysAgo(10),
      unread_count: 0, assigned_agent: null, is_opened: true,
      wati_status: 'open', provider: 'wati', created_at: isoDaysAgo(60),
    })

    const rows = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `old-${i}`, conversation_id: c, from_type: 'customer' as const,
        source: 'whatsapp_api' as const, message_kind: 'message' as const,
        message_type: 'text' as const, text: null, agent_name: null,
        attachments: null, reactions: [], delivery_status: 'sent' as const,
        external_id: null, reply_to_external_id: null, sent_by_profile_id: null,
        phone_id: null, deleted_at: null,
        revoked_at: null,
        created_at: isoDaysAgo(45 + i),
      })),
      ...Array.from({ length: 25 }, (_, i) => ({
        id: `new-${i}`, conversation_id: c, from_type: 'customer' as const,
        source: 'whatsapp_api' as const, message_kind: 'message' as const,
        message_type: 'text' as const, text: null, agent_name: null,
        attachments: null, reactions: [], delivery_status: 'sent' as const,
        external_id: null, reply_to_external_id: null, sent_by_profile_id: null,
        phone_id: null, deleted_at: null,
        revoked_at: null,
        created_at: isoDaysAgo(5 + i * 0.01),
      })),
    ]
    await getDb('test').messages.bulkPut(rows)

    await prune(getDb('test'))

    const remaining = await getDb('test').messages.where('conversation_id').equals(c).count()
    expect(remaining).toBe(25)
  })

  it('keeps at least 20 messages per conversation even if every row is past cutoff', async () => {
    const c = 'c-2'
    await getDb('test').conversations.put({
      id: c, customer_id: null, customer_id_v2: null,
      conversation_type: 'customer', wati_phone: null, wati_contact_name: null,
      last_message: null, last_message_at: isoDaysAgo(60),
      unread_count: 0, assigned_agent: null, is_opened: false,
      wati_status: 'open', provider: 'wati', created_at: isoDaysAgo(60),
    })
    const rows = Array.from({ length: 35 }, (_, i) => ({
      id: `m-${i}`, conversation_id: c, from_type: 'customer' as const,
      source: 'whatsapp_api' as const, message_kind: 'message' as const,
      message_type: 'text' as const, text: null, agent_name: null,
      attachments: null, reactions: [], delivery_status: 'sent' as const,
      external_id: null, reply_to_external_id: null, sent_by_profile_id: null,
      phone_id: null, deleted_at: null,
      revoked_at: null,
      created_at: isoDaysAgo(60 + i),
    }))
    await getDb('test').messages.bulkPut(rows)

    await prune(getDb('test'))

    const remaining = await getDb('test').messages.where('conversation_id').equals(c).count()
    expect(remaining).toBe(20)
  })

  it('never prunes pendingWrites', async () => {
    await getDb('test').pendingWrites.add({
      kind: 'send_message', payload: {}, status: 'failed',
      retryCount: 5, lastError: 'x', createdAt: Date.now() - 90 * 86_400_000,
    })
    await prune(getDb('test'))
    const c = await getDb('test').pendingWrites.count()
    expect(c).toBe(1)
  })
})
