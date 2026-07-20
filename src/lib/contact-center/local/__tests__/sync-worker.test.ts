import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../db'
import { SyncWorker } from '../sync-worker'
import * as messagesRepo from '../repos/messages'
import * as q from '../pending-writes'

beforeEach(() => { resetDb(); vi.useFakeTimers() })
afterEach(()  => { vi.useRealTimers() })

function mkSupabaseStub() {
  return {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
    from: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('SyncWorker lifecycle', () => {
  it('start sets running=true, stop sets it false', () => {
    const w = new SyncWorker(getDb('test'), mkSupabaseStub(), 'wati')
    w.start()
    expect(w.isRunning).toBe(true)
    w.stop()
    expect(w.isRunning).toBe(false)
  })

  it('start is idempotent', () => {
    const w = new SyncWorker(getDb('test'), mkSupabaseStub(), 'wati')
    w.start(); w.start()
    expect(w.isRunning).toBe(true)
    w.stop()
  })

  it('fileMap.set + delete + has', () => {
    const w = new SyncWorker(getDb('test'), mkSupabaseStub(), 'wati')
    const blob = new Blob(['x'])
    const file = new File([blob], 'a.pdf', { type: 'application/pdf' })
    w.fileMap.set('ref-1', file)
    expect(w.fileMap.has('ref-1')).toBe(true)
    w.fileMap.delete('ref-1')
    expect(w.fileMap.has('ref-1')).toBe(false)
  })

  it('stop drops every file ref from the map (prevents RAM bloat across restarts)', () => {
    const w = new SyncWorker(getDb('test'), mkSupabaseStub(), 'wati')
    w.fileMap.set('a', new File([], 'x'))
    w.fileMap.set('b', new File([], 'y'))
    w.start(); w.stop()
    expect(w.fileMap.size).toBe(0)
  })

  it('status starts at "offline" and transitions to "connected" via setStatus', () => {
    const w = new SyncWorker(getDb('test'), mkSupabaseStub(), 'wati')
    expect(w.status).toBe('offline')
    w.setStatus('connected')
    expect(w.status).toBe('connected')
  })
})

describe('SyncWorker.subscribeRealtime', () => {
  let onCalls: Array<{ event: string; cfg: Record<string, unknown> }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let supabaseMock: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbMock: any

  beforeEach(() => {
    onCalls = []
    const channel = {
      on: vi.fn((event: string, cfg: Record<string, unknown>) => {
        onCalls.push({ event, cfg })
        return channel
      }),
      subscribe: vi.fn(() => channel),
    }
    supabaseMock = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }
    dbMock = { sync: { put: vi.fn() } } // minimal — start() only touches sync.put for status
  })

  it('subscribes to exactly one channel covering all chat_messages events', () => {
    // 2026-06-14: filter relaxed from `from_type=eq.customer` INSERT to `*`.
    // The customer-only filter prevented agent INSERTs and from_type heal UPDATEs
    // from reaching Dexie, which broke the V2 sidebar (showed messages on the
    // wrong side or hid them entirely). Still ONE subscription — far less than
    // the original six unfiltered channels that prompted the tightening.
    const worker = new SyncWorker(dbMock, supabaseMock, 'wati')
    worker.start()

    expect(supabaseMock.channel).toHaveBeenCalledTimes(1)
    expect(onCalls).toHaveLength(1)
    expect(onCalls[0]).toEqual({
      event: 'postgres_changes',
      cfg: {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
      },
    })

    worker.stop()
  })

  it('does not subscribe to chat_conversations, service_customers, _addresses, _phones, or installed_products', () => {
    const worker = new SyncWorker(dbMock, supabaseMock, 'wati')
    worker.start()

    const tables = onCalls.map((c) => (c.cfg as { table: string }).table)
    expect(tables).not.toContain('chat_conversations')
    expect(tables).not.toContain('service_customers')
    expect(tables).not.toContain('service_customer_addresses')
    expect(tables).not.toContain('service_customer_phones')
    expect(tables).not.toContain('installed_products')

    worker.stop()
  })
})

describe('SyncWorker Realtime → Dexie', () => {
  it('subscribes to chat_messages on start', () => {
    const supa = mkSupabaseStub()
    const w = new SyncWorker(getDb('test'), supa, 'wati')
    w.start()
    expect(supa.channel).toHaveBeenCalledWith(expect.stringContaining('cc-sync'))
    w.stop()
  })

  it('buffers UPDATE events for 50ms then flushes via bulkPut', async () => {
    const supa = mkSupabaseStub()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSubCallbacks: Array<(payload: any) => void> = []
    supa.channel.mockReturnValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on: vi.fn().mockImplementation((_evt: string, _filter: any, cb: any) => {
        onSubCallbacks.push(cb); return { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), unsubscribe: vi.fn() }
      }),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    })

    const bulkSpy = vi.spyOn(messagesRepo, 'upsertMany').mockResolvedValue()
    const w = new SyncWorker(getDb('test'), supa, 'wati')
    w.start()

    for (let i = 0; i < 10; i++) {
      onSubCallbacks[0]?.({
        eventType: 'UPDATE',
        new: {
          id: `m-${i}`, conversation_id: 'c1',
          delivery_status: 'read', external_id: `wamid.${i}`,
          created_at: '2026-06-09T12:00:00Z',
          from_type: 'agent', source: 'whatsapp_api', message_kind: 'message',
          message_type: 'text', text: null, agent_name: null, attachments: null,
          reactions: [], reply_to_external_id: null, sent_by_profile_id: null,
          phone_id: null, deleted_at: null,
        },
      })
    }

    expect(bulkSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    await Promise.resolve()

    expect(bulkSpy).toHaveBeenCalledTimes(1)
    expect(bulkSpy.mock.calls[0][1].length).toBe(10)
  })
})

describe('SyncWorker drain (text)', () => {
  beforeEach(async () => {
    vi.useRealTimers()
    await getDb('test').pendingWrites.clear()
    await getDb('test').messages.clear()
  })

  it('drains a queued send_message via supabase.functions.invoke', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { message: { whatsappMessageId: 'WAMID-1' } },
      error: null,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = { ...mkSupabaseStub(), functions: { invoke } } as any

    const w = new SyncWorker(getDb('test'), supa, 'wati')
    await getDb('test').messages.put({
      id: 'msg-x', conversation_id: 'c1', from_type: 'agent',
      source: 'whatsapp_api', message_kind: 'message', message_type: 'text',
      text: 'hi', agent_name: null, attachments: null, reactions: [],
      delivery_status: 'sending', external_id: null,
      reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
      deleted_at: null, revoked_at: null, created_at: '2026-06-09T12:00:00Z',
      _localOnly: true,
    })
    const pwId = await q.enqueue(getDb('test'), {
      kind: 'send_message',
      payload: { id: 'msg-x', conversationId: 'c1', phone: '+97411111111', text: 'hi' },
      localMessageId: 'msg-x',
    })

    w.start()
    await w.drainOnce()

    expect(invoke).toHaveBeenCalledWith('api-wati', expect.objectContaining({
      body: expect.objectContaining({
        action: 'send_session_message',
        text: 'hi',
        message_id: 'msg-x',
      }),
    }))
    expect(await getDb('test').pendingWrites.get(pwId)).toBeUndefined()
    const m = await getDb('test').messages.get('msg-x')
    expect(m?.external_id).toBe('wati_WAMID-1')
    expect(m?.delivery_status).toBe('sent')
  })

  it('retries a 500-class failure with backoff (transient)', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null, error: { message: 'server error', status: 500 },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = { ...mkSupabaseStub(), functions: { invoke } } as any
    const w = new SyncWorker(getDb('test'), supa, 'wati')

    const pwId = await q.enqueue(getDb('test'), {
      kind: 'send_message',
      payload: { id: 'msg-y', conversationId: 'c1', phone: '+x', text: 'hi' },
      localMessageId: 'msg-y',
    })

    w.start()
    await w.drainOnce()

    const row = await getDb('test').pendingWrites.get(pwId)
    expect(row?.status).toBe('queued')
    expect(row?.retryCount).toBe(1)
  })

  it('marks terminal failure after MAX_RETRIES', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'oops', status: 500 } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = { ...mkSupabaseStub(), functions: { invoke } } as any
    const w = new SyncWorker(getDb('test'), supa, 'wati')

    const pwId = await q.enqueue(getDb('test'), {
      kind: 'send_message', payload: { id: 'mz', conversationId: 'c1', phone: '+x', text: 'h' },
      localMessageId: 'mz',
    })
    await getDb('test').pendingWrites.update(pwId, { retryCount: q.MAX_RETRIES })

    w.start()
    await w.drainOnce()

    const row = await getDb('test').pendingWrites.get(pwId)
    expect(row?.status).toBe('failed')
  })
})

describe('SyncWorker drain (file)', () => {
  beforeEach(async () => {
    vi.useRealTimers()
    await getDb('test').pendingWrites.clear()
    await getDb('test').messages.clear()
  })

  it('uploads to Storage first, then patches Dexie with the public URL, then sends', async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: 'c1/msg-f.pdf' }, error: null })
    const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://x.test/c1/msg-f.pdf' } })
    const invoke = vi.fn().mockResolvedValue({
      data: { message: { whatsappMessageId: 'WAMID-F' } }, error: null,
    })

    const supa = {
      ...mkSupabaseStub(),
      storage: { from: () => ({ upload, getPublicUrl }) },
      functions: { invoke },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const w = new SyncWorker(getDb('test'), supa, 'wati')

    const file = new File([new Blob(['%PDF-1.4'])], 'doc.pdf', { type: 'application/pdf' })
    w.fileMap.set('ref-f', file)
    await getDb('test').messages.put({
      id: 'msg-f', conversation_id: 'c1', from_type: 'agent', source: 'whatsapp_api',
      message_kind: 'message', message_type: 'document',
      text: null, agent_name: null,
      attachments: [{ url: 'blob:http://test/abc', type: 'application/pdf', name: 'doc.pdf', status: 'local' }],
      reactions: [], delivery_status: 'sending', external_id: null,
      reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
      deleted_at: null, revoked_at: null, created_at: '2026-06-09T12:00:00Z', _localOnly: true,
    })
    const pwId = await q.enqueue(getDb('test'), {
      kind: 'send_file',
      payload: { id: 'msg-f', conversationId: 'c1', phone: '+x', caption: '', filename: 'doc.pdf', mime: 'application/pdf' },
      localMessageId: 'msg-f',
      fileRef: 'ref-f',
    })

    w.start()
    await w.drainOnce()

    expect(upload).toHaveBeenCalledWith(expect.stringContaining('c1/msg-f.pdf'), file, expect.objectContaining({ contentType: 'application/pdf' }))
    expect(invoke).toHaveBeenCalledWith('api-wati', expect.objectContaining({
      body: expect.objectContaining({ action: 'send_file', message_id: 'msg-f' }),
    }))
    expect(await getDb('test').pendingWrites.get(pwId)).toBeUndefined()
    expect(w.fileMap.has('ref-f')).toBe(false)
    const m = await getDb('test').messages.get('msg-f')
    expect(m?.attachments?.[0].url).toBe('https://x.test/c1/msg-f.pdf')
    expect(m?.delivery_status).toBe('sent')
  })

  it('marks terminal failure with file-lost when fileMap has no ref (post-reload)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = { ...mkSupabaseStub(), storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) }, functions: { invoke: vi.fn() } } as any
    const w = new SyncWorker(getDb('test'), supa, 'wati')

    const pwId = await q.enqueue(getDb('test'), {
      kind: 'send_file',
      payload: { id: 'msg-g', conversationId: 'c1', phone: '+x', caption: '', filename: 'x.png', mime: 'image/png' },
      localMessageId: 'msg-g',
      fileRef: 'lost-ref',
    })
    w.start()
    await w.drainOnce()

    const row = await getDb('test').pendingWrites.get(pwId)
    expect(row?.status).toBe('failed')
    expect(row?.lastError).toMatch(/file lost/i)
  })
})
