import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { createDb, getDb, resetDb } from '../db'

describe('mms-cc-cache Dexie DB', () => {
  beforeEach(() => { resetDb() })
  afterEach(() => { resetDb() })

  it('creates a DB named for the auth user', async () => {
    const db = createDb('user-123')
    expect(db.name).toBe('mms-cc-cache-user-123')
    await db.open()
    await db.close()
  })

  it('has all expected tables on the schema', async () => {
    const db = createDb('user-1')
    await db.open()
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual([
      'addresses', 'conversations', 'customers', 'messages',
      'orders', 'pendingWrites', 'phones', 'products', 'sync',
    ])
    await db.close()
  })

  it('getDb returns the same singleton instance for the same user', () => {
    const a = getDb('user-1')
    const b = getDb('user-1')
    expect(a).toBe(b)
  })

  it('getDb returns a different instance for a different user', () => {
    const a = getDb('user-1')
    const b = getDb('user-2')
    expect(a).not.toBe(b)
    expect(b.name).toBe('mms-cc-cache-user-2')
  })

  it('can write and read a conversation row', async () => {
    const db = getDb('user-1')
    await db.conversations.put({
      id: 'conv-1', customer_id: null, customer_id_v2: null,
      conversation_type: 'customer', wati_phone: '+9747...', wati_contact_name: null,
      last_message: null, last_message_at: '2026-06-09T12:00:00Z',
      unread_count: 0, assigned_agent: null, is_opened: true,
      wati_status: 'open', provider: 'wati',
      created_at: '2026-06-09T12:00:00Z',
    })
    const got = await db.conversations.get('conv-1')
    expect(got?.id).toBe('conv-1')
    expect(got?.last_message_at).toBe('2026-06-09T12:00:00Z')
  })

  it('messages compound index [conversation_id+created_at] returns rows in order', async () => {
    const db = getDb('user-1')
    await db.messages.bulkAdd([
      { id: 'm3', conversation_id: 'c1', created_at: '2026-06-09T12:00:03Z',
        from_type: 'agent', source: 'whatsapp_api', message_kind: 'message',
        message_type: 'text', text: 'three', agent_name: null, attachments: null,
        reactions: [], delivery_status: 'sent', external_id: null,
        reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
        deleted_at: null },
      { id: 'm1', conversation_id: 'c1', created_at: '2026-06-09T12:00:01Z',
        from_type: 'agent', source: 'whatsapp_api', message_kind: 'message',
        message_type: 'text', text: 'one', agent_name: null, attachments: null,
        reactions: [], delivery_status: 'sent', external_id: null,
        reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
        deleted_at: null },
      { id: 'm2', conversation_id: 'c1', created_at: '2026-06-09T12:00:02Z',
        from_type: 'agent', source: 'whatsapp_api', message_kind: 'message',
        message_type: 'text', text: 'two', agent_name: null, attachments: null,
        reactions: [], delivery_status: 'sent', external_id: null,
        reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
        deleted_at: null },
    ])
    const rows = await db.messages
      .where('[conversation_id+created_at]')
      .between(['c1', ''], ['c1', '￿'])
      .toArray()
    expect(rows.map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('external_id index supports fast webhook lookup', async () => {
    const db = getDb('user-1')
    await db.messages.put({
      id: 'msg-uuid-1', conversation_id: 'c1',
      external_id: 'wamid.ABC123', delivery_status: 'sent',
      from_type: 'agent', source: 'whatsapp_api', message_kind: 'message',
      message_type: 'text', text: 'hi', agent_name: null, attachments: null,
      reactions: [], reply_to_external_id: null, sent_by_profile_id: null,
      phone_id: null, deleted_at: null, created_at: '2026-06-09T12:00:00Z',
    })
    const got = await db.messages.where('external_id').equals('wamid.ABC123').first()
    expect(got?.id).toBe('msg-uuid-1')
  })
})
