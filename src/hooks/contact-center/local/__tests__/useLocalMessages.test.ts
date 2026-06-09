import { it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '@/lib/contact-center/local/db'
import { useLocalMessages } from '../useLocalMessages'

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

it('reads messages for all conversations of the customer', async () => {
  await getDb('u').conversations.bulkPut([
    { id: 'c-wati',  customer_id: 'cust-1', customer_id_v2: null, conversation_type: 'customer',
      wati_phone: null, wati_contact_name: null, last_message: null,
      last_message_at: '2026-06-09T12:00:00Z', unread_count: 0, assigned_agent: null,
      is_opened: true, wati_status: 'open', provider: 'wati', created_at: '2026-06-09T11:00:00Z' },
    { id: 'c-whapi', customer_id: 'cust-1', customer_id_v2: null, conversation_type: 'customer',
      wati_phone: null, wati_contact_name: null, last_message: null,
      last_message_at: '2026-06-09T12:30:00Z', unread_count: 0, assigned_agent: null,
      is_opened: true, wati_status: 'open', provider: 'whapi', created_at: '2026-06-09T11:00:00Z' },
  ])
  await getDb('u').messages.bulkPut([
    { id: 'a', conversation_id: 'c-wati', from_type: 'customer', source: 'whatsapp_api',
      message_kind: 'message', message_type: 'text', text: 'wati hi',
      agent_name: null, attachments: null, reactions: [], delivery_status: 'sent',
      external_id: 'e-a', reply_to_external_id: null, sent_by_profile_id: null,
      phone_id: null, deleted_at: null, created_at: '2026-06-09T12:00:01Z' },
    { id: 'b', conversation_id: 'c-whapi', from_type: 'customer', source: 'whatsapp_whapi',
      message_kind: 'message', message_type: 'text', text: 'whapi hi',
      agent_name: null, attachments: null, reactions: [], delivery_status: 'sent',
      external_id: 'e-b', reply_to_external_id: null, sent_by_profile_id: null,
      phone_id: null, deleted_at: null, created_at: '2026-06-09T12:30:01Z' },
  ])

  const { result } = renderHook(() => useLocalMessages('u', 'cust-1'))
  await waitFor(() => expect(result.current.messages.length).toBe(2))
  expect(result.current.messages.map((m) => m.id)).toEqual(['a', 'b'])
})
