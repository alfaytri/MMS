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
    const onSubCallbacks: Array<(payload: any) => void> = []
    supa.channel.mockReturnValue({
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
    const supa = { ...mkSupabaseStub(), functions: { invoke } } as any

    const w = new SyncWorker(getDb('test'), supa, 'wati')
    await getDb('test').messages.put({
      id: 'msg-x', conversation_id: 'c1', from_type: 'agent',
      source: 'whatsapp_api', message_kind: 'message', message_type: 'text',
      text: 'hi', agent_name: null, attachments: null, reactions: [],
      delivery_status: 'sending', external_id: null,
      reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
      deleted_at: null, created_at: '2026-06-09T12:00:00Z',
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
