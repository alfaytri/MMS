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

// Flush a handful of microtasks so the worker's `await authReady` → subscribe
// chain resolves under fake timers.
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mkBroadcastSupabase(): { supa: any; channels: Record<string, any>; broadcastCbs: Record<string, (msg: any) => void> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: Record<string, any> = {}
  const broadcastCbs: Record<string, (msg: unknown) => void> = {}
  const supa = {
    channel: vi.fn((topic: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ch: any = {
        topic,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        on: vi.fn((type: string, _cfg: unknown, cb: (msg: any) => void) => {
          if (type === 'broadcast') broadcastCbs[topic] = cb
          return ch
        }),
        subscribe: vi.fn((cb?: (s: string) => void) => { cb?.('SUBSCRIBED'); return ch }),
        unsubscribe: vi.fn(),
      }
      channels[topic] = ch
      return ch
    }),
    removeChannel: vi.fn(),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }) },
    realtime: { setAuth: vi.fn() },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supa: supa as any, channels, broadcastCbs }
}

describe('SyncWorker realtime subscriptions (Broadcast)', () => {
  it('start() subscribes to the private cc:inbox topic and never to postgres_changes', async () => {
    // Was an unfiltered `event:'*'` postgres_changes subscription on
    // chat_messages that fanned every row change out to every online agent.
    // Now it's a scoped Broadcast (migration 20261058000000).
    const { supa, channels } = mkBroadcastSupabase()
    const dbMock = { sync: { put: vi.fn() } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = new SyncWorker(dbMock as any, supa, 'wati')
    w.start()
    await tick()

    expect(supa.channel).toHaveBeenCalledWith('cc:inbox', { config: { private: true } })
    const onTypes = Object.values(channels).flatMap((c) => c.on.mock.calls.map((a: unknown[]) => a[0]))
    expect(onTypes).toContain('broadcast')
    expect(onTypes).not.toContain('postgres_changes')
    w.stop()
  })

  it('setActiveConversation subscribes to thread:{id} and re-points (removing the old) on change', async () => {
    const { supa, channels } = mkBroadcastSupabase()
    const dbMock = { sync: { put: vi.fn() } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = new SyncWorker(dbMock as any, supa, 'wati')
    w.start()
    await tick()

    w.setActiveConversation('c1')
    await tick()
    expect(supa.channel).toHaveBeenCalledWith('thread:c1', { config: { private: true } })

    w.setActiveConversation('c2')
    await tick()
    expect(supa.removeChannel).toHaveBeenCalledWith(channels['thread:c1'])
    expect(supa.channel).toHaveBeenCalledWith('thread:c2', { config: { private: true } })
    w.stop()
  })
})

describe('SyncWorker thread Broadcast → Dexie', () => {
  it('buffers thread cc_message events for 50ms then flushes via bulkPut', async () => {
    const { supa, broadcastCbs } = mkBroadcastSupabase()
    const bulkSpy = vi.spyOn(messagesRepo, 'upsertMany').mockResolvedValue()
    // Lightweight db stub — upsertMany is mocked, so this test never needs real
    // Dexie (and a real Dexie read under fake timers wedges the shared test DB).
    const dbMock = { sync: { put: vi.fn() } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = new SyncWorker(dbMock as any, supa, 'wati')
    w.start()
    await tick()
    w.setActiveConversation('c1')
    await tick()

    for (let i = 0; i < 10; i++) {
      broadcastCbs['thread:c1']?.({
        payload: {
          op: 'UPDATE',
          record: {
            id: `m-${i}`, conversation_id: 'c1',
            delivery_status: 'read', external_id: `wamid.${i}`,
            created_at: '2026-06-09T12:00:00Z',
            from_type: 'agent', source: 'whatsapp_api', message_kind: 'message',
            message_type: 'text', text: null, agent_name: null, attachments: null,
            reactions: [], reply_to_external_id: null, sent_by_profile_id: null,
            phone_id: null, deleted_at: null,
          },
        },
      })
    }

    expect(bulkSpy).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)
    await Promise.resolve()

    expect(bulkSpy).toHaveBeenCalledTimes(1)
    expect(bulkSpy.mock.calls[0][1].length).toBe(10)
    w.stop()
  })
})

describe('SyncWorker drain (text)', () => {
  beforeEach(async () => {
    vi.useRealTimers()
    await getDb('test').pendingWrites.clear()
    await getDb('test').messages.clear()
  })

  it('drains a queued send_message via the /api/wati/send-session route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ whatsappMessageId: 'WAMID-1' }) })
    vi.stubGlobal('fetch', fetchMock)

    // Chainable supabase stub so pushFullMessage + the external_id update resolve.
    const chain = {
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockResolvedValue({ error: null }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = { ...mkSupabaseStub(), from: vi.fn(() => chain) } as any

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

    expect(fetchMock).toHaveBeenCalledWith('/api/wati/send-session', expect.objectContaining({ method: 'POST' }))
    expect(await getDb('test').pendingWrites.get(pwId)).toBeUndefined()
    const m = await getDb('test').messages.get('msg-x')
    expect(m?.external_id).toBe('wati_WAMID-1')
    expect(m?.delivery_status).toBe('sent')
    vi.unstubAllGlobals()
  })

  it('retries a 500-class failure with backoff (transient)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'server error' }) }))
    const w = new SyncWorker(getDb('test'), mkSupabaseStub(), 'wati')

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
    vi.unstubAllGlobals()
  })

  it('marks terminal failure after MAX_RETRIES', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'oops' }) }))
    const w = new SyncWorker(getDb('test'), mkSupabaseStub(), 'wati')

    const pwId = await q.enqueue(getDb('test'), {
      kind: 'send_message', payload: { id: 'mz', conversationId: 'c1', phone: '+x', text: 'h' },
      localMessageId: 'mz',
    })
    await getDb('test').pendingWrites.update(pwId, { retryCount: q.MAX_RETRIES })

    w.start()
    await w.drainOnce()

    const row = await getDb('test').pendingWrites.get(pwId)
    expect(row?.status).toBe('failed')
    vi.unstubAllGlobals()
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
