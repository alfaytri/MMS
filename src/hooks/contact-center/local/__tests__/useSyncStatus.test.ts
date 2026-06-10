import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '@/lib/contact-center/local/db'
import { useSyncStatus } from '../useSyncStatus'

describe('useSyncStatus', () => {
  it('reports connected when sync row says so and pending=0', async () => {
    resetDb()
    await getDb('test-user').sync.put({ key: 'realtimeStatus', value: 'connected', updatedAt: Date.now() })
    const { result } = renderHook(() => useSyncStatus('test-user'))
    await waitFor(() => expect(result.current.online).toBe(true))
    expect(result.current.pending).toBe(0)
  })

  it('reports pending count from pendingWrites', async () => {
    resetDb()
    await getDb('test-user').pendingWrites.add({
      kind: 'send_message', payload: {}, status: 'queued', retryCount: 0,
      lastError: null, createdAt: Date.now(),
    })
    const { result } = renderHook(() => useSyncStatus('test-user'))
    await waitFor(() => expect(result.current.pending).toBe(1))
  })
})
