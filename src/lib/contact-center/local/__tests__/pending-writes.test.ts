import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../db'
import * as q from '../pending-writes'

beforeEach(async () => {
  resetDb()
  await getDb('test').pendingWrites.clear()
})

describe('pendingWrites queue', () => {
  it('enqueue returns the new id', async () => {
    const id = await q.enqueue(getDb('test'), {
      kind: 'send_message',
      payload: { conversationId: 'c1', text: 'hi' },
    })
    expect(typeof id).toBe('number')
    expect(id).toBeGreaterThan(0)
  })

  it('enqueue stores status=queued, retryCount=0', async () => {
    const id = await q.enqueue(getDb('test'), {
      kind: 'send_message',
      payload: { conversationId: 'c1', text: 'hi' },
    })
    const row = await getDb('test').pendingWrites.get(id)
    expect(row?.status).toBe('queued')
    expect(row?.retryCount).toBe(0)
    expect(row?.lastError).toBeNull()
  })

  it('listQueued returns rows in FIFO order', async () => {
    await q.enqueue(getDb('test'), { kind: 'send_message', payload: { text: 'a' } })
    await new Promise((r) => setTimeout(r, 2))
    await q.enqueue(getDb('test'), { kind: 'send_message', payload: { text: 'b' } })
    const rows = await q.listQueued(getDb('test'))
    expect((rows[0].payload as { text: string }).text).toBe('a')
    expect((rows[1].payload as { text: string }).text).toBe('b')
  })

  it('markInFlight sets status=in_flight', async () => {
    const id = await q.enqueue(getDb('test'), { kind: 'send_message', payload: {} })
    await q.markInFlight(getDb('test'), id)
    const row = await getDb('test').pendingWrites.get(id)
    expect(row?.status).toBe('in_flight')
  })

  it('markSuccess removes the row', async () => {
    const id = await q.enqueue(getDb('test'), { kind: 'send_message', payload: {} })
    await q.markSuccess(getDb('test'), id)
    const row = await getDb('test').pendingWrites.get(id)
    expect(row).toBeUndefined()
  })

  it('markFailedTransient increments retryCount and re-queues', async () => {
    const id = await q.enqueue(getDb('test'), { kind: 'send_message', payload: {} })
    await q.markFailedTransient(getDb('test'), id, 'rate limited')
    const row = await getDb('test').pendingWrites.get(id)
    expect(row?.status).toBe('queued')
    expect(row?.retryCount).toBe(1)
    expect(row?.lastError).toBe('rate limited')
  })

  it('markFailedTerminal marks status=failed (does NOT remove the row)', async () => {
    const onCleanup = vi.fn()
    const id = await q.enqueue(getDb('test'), { kind: 'send_file', payload: {}, fileRef: 'file-ref-x' })
    await q.markFailedTerminal(getDb('test'), id, 'too many retries', onCleanup)
    const row = await getDb('test').pendingWrites.get(id)
    expect(row?.status).toBe('failed')
    expect(row?.lastError).toBe('too many retries')
    expect(onCleanup).toHaveBeenCalledWith('file-ref-x')
  })

  it('discard removes the row (user-initiated) and calls fileMap cleanup', async () => {
    const onCleanup = vi.fn()
    const id = await q.enqueue(getDb('test'), { kind: 'send_file', payload: {}, fileRef: 'file-y' })
    await q.discard(getDb('test'), id, onCleanup)
    expect(await getDb('test').pendingWrites.get(id)).toBeUndefined()
    expect(onCleanup).toHaveBeenCalledWith('file-y')
  })

  it('failedCount counts only status=failed rows', async () => {
    await q.enqueue(getDb('test'), { kind: 'send_message', payload: {} })
    const id = await q.enqueue(getDb('test'), { kind: 'send_message', payload: {} })
    await q.markFailedTerminal(getDb('test'), id, 'x', () => {})
    expect(await q.failedCount(getDb('test'))).toBe(1)
  })
})
