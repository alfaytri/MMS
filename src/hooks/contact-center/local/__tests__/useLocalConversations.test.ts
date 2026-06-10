import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '@/lib/contact-center/local/db'
import { useLocalConversations } from '../useLocalConversations'

function chainStub(): any {
  const handler: ProxyHandler<object> = {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      return (..._args: unknown[]) => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => chainStub(),
}))

beforeEach(() => { resetDb() })

describe('useLocalConversations', () => {
  it('returns rows ordered by last_message_at desc', async () => {
    await getDb('test-user').conversations.bulkPut([
      { id: 'c1', customer_id: null, customer_id_v2: null, conversation_type: 'customer',
        wati_phone: '+x', wati_contact_name: null, last_message: null,
        last_message_at: '2026-06-09T10:00:00Z', unread_count: 0, assigned_agent: null,
        is_opened: true, wati_status: 'open', provider: 'wati', created_at: '2026-06-09T10:00:00Z' },
      { id: 'c2', customer_id: null, customer_id_v2: null, conversation_type: 'customer',
        wati_phone: '+y', wati_contact_name: null, last_message: null,
        last_message_at: '2026-06-09T12:00:00Z', unread_count: 0, assigned_agent: null,
        is_opened: true, wati_status: 'open', provider: 'wati', created_at: '2026-06-09T11:00:00Z' },
    ])
    const { result } = renderHook(() => useLocalConversations('test-user', 'wati'))
    await waitFor(() => expect(result.current.conversations.length).toBe(2))
    expect(result.current.conversations[0].id).toBe('c2')
  })
})
