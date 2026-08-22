import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../../db'
import * as repo from '../messages'
import type { LocalMessage } from '../../schema'

function mkMsg(overrides: Partial<LocalMessage> = {}): LocalMessage {
  return {
    id: 'm1', conversation_id: 'c1', from_type: 'agent',
    source: 'whatsapp_api', message_kind: 'message',
    message_type: 'text', text: 'hi', agent_name: null, attachments: null,
    reactions: [], delivery_status: 'sent', external_id: null,
    reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
    deleted_at: null, created_at: '2026-06-09T12:00:00Z',
    ...overrides,
  }
}

beforeEach(async () => {
  resetDb()
  await getDb('test').messages.clear()
  await getDb('test').sync.clear()
})

describe('messages repo', () => {
  it('listByConversation returns rows ordered by created_at ASC', async () => {
    await getDb('test').messages.bulkAdd([
      mkMsg({ id: 'm-c', created_at: '2026-06-09T12:00:30Z' }),
      mkMsg({ id: 'm-a', created_at: '2026-06-09T12:00:10Z' }),
      mkMsg({ id: 'm-b', created_at: '2026-06-09T12:00:20Z' }),
    ])
    const rows = await repo.listByConversation(getDb('test'), 'c1')
    expect(rows.map((m) => m.id)).toEqual(['m-a', 'm-b', 'm-c'])
  })

  it('listByConversation skips deleted rows', async () => {
    await getDb('test').messages.bulkPut([
      mkMsg({ id: 'm-live' }),
      mkMsg({ id: 'm-del', deleted_at: '2026-06-09T12:00:01Z' }),
    ])
    const rows = await repo.listByConversation(getDb('test'), 'c1')
    expect(rows.map((m) => m.id)).toEqual(['m-live'])
  })

  it('listByConversations merges across multiple conversations', async () => {
    await getDb('test').messages.bulkPut([
      mkMsg({ id: 'a', conversation_id: 'c1', created_at: '2026-06-09T12:00:01Z' }),
      mkMsg({ id: 'b', conversation_id: 'c2', created_at: '2026-06-09T12:00:02Z' }),
    ])
    const rows = await repo.listByConversations(getDb('test'), ['c1', 'c2'])
    expect(rows.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('getByExternalId uses the indexed lookup', async () => {
    await getDb('test').messages.put(mkMsg({ id: 'msg-1', external_id: 'wamid.X' }))
    const got = await repo.getByExternalId(getDb('test'), 'wamid.X')
    expect(got?.id).toBe('msg-1')
  })

  it('upsertMany is a single transaction (bulkPut)', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      mkMsg({ id: `m-${i}`, created_at: new Date(2026, 5, 9, 12, 0, i).toISOString() })
    )
    await repo.upsertMany(getDb('test'), rows)
    const count = await getDb('test').messages.count()
    expect(count).toBe(50)
  })

  it('lazyFetch is no-op when cursor fresh', async () => {
    const supa = { from: vi.fn() }
    await getDb('test').sync.put({
      key: 'lastMessageSync:c1',
      value: new Date().toISOString(),
      updatedAt: Date.now(),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await repo.lazyFetch(getDb('test'), supa as any, 'c1')
    expect(supa.from).not.toHaveBeenCalled()
  })
})
