import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../db'
import { SyncWorker } from '../sync-worker'
import * as messagesRepo from '../repos/messages'

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
