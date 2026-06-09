import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../../db'
import * as repo from '../conversations'
import type { LocalConversation } from '../../schema'

const CONV: LocalConversation = {
  id: 'c1', customer_id: 'cust-1', customer_id_v2: null,
  conversation_type: 'customer', wati_phone: '+97412345678',
  wati_contact_name: 'Test', last_message: 'hi',
  last_message_at: '2026-06-09T12:00:00Z',
  unread_count: 2, assigned_agent: null, is_opened: false,
  wati_status: 'open', provider: 'wati', created_at: '2026-06-09T11:00:00Z',
}

beforeEach(async () => {
  resetDb()
  await getDb('test').sync.clear()
  await getDb('test').conversations.clear()
})

describe('conversations repo', () => {
  it('upsert + getById', async () => {
    await repo.upsert(getDb('test'), CONV)
    const got = await repo.getById(getDb('test'), 'c1')
    expect(got?.wati_phone).toBe('+97412345678')
  })

  it('listByProvider returns rows ordered by last_message_at desc', async () => {
    const older  = { ...CONV, id: 'c-old', last_message_at: '2026-06-08T10:00:00Z' }
    const newer  = { ...CONV, id: 'c-new', last_message_at: '2026-06-09T20:00:00Z' }
    await repo.upsert(getDb('test'), older)
    await repo.upsert(getDb('test'), newer)
    const rows = await repo.listByProvider(getDb('test'), 'wati')
    expect(rows.map((r) => r.id)).toEqual(['c-new', 'c-old'])
  })

  it('lazyFetch is a no-op when the sync cursor is fresh', async () => {
    const supa = { from: vi.fn() }
    await getDb('test').sync.put({
      key: 'lastConversationSync:wati',
      value: new Date().toISOString(),
      updatedAt: Date.now(),
    })
    await repo.lazyFetch(getDb('test'), supa as any, 'wati')
    expect(supa.from).not.toHaveBeenCalled()
  })

  it('lazyFetch hits Supabase and upserts when stale', async () => {
    const fakeRows = [{ ...CONV, id: 'fetched-1' }]
    const supa = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: fakeRows, error: null }),
              }),
            }),
          }),
        }),
      }),
    }
    await repo.lazyFetch(getDb('test'), supa as any, 'wati')
    expect(supa.from).toHaveBeenCalledWith('chat_conversations')
    const got = await repo.getById(getDb('test'), 'fetched-1')
    expect(got).toBeTruthy()
  })

  it('delete removes the row', async () => {
    await repo.upsert(getDb('test'), CONV)
    await repo.deleteById(getDb('test'), 'c1')
    expect(await repo.getById(getDb('test'), 'c1')).toBeUndefined()
  })
})
