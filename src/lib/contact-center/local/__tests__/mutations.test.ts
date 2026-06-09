import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../db'
import { sendMessageLocal } from '../mutations'

beforeEach(() => { resetDb() })

it('writes a sending message + pending_write within one transaction', async () => {
  const id = await sendMessageLocal(getDb('u'), {
    conversationId: 'c1', phone: '+97412345678', text: 'hi',
  })
  expect(typeof id).toBe('string')
  expect(id).toMatch(/^[0-9a-f-]{36}$/)
  const msg = await getDb('u').messages.get(id)
  expect(msg?.delivery_status).toBe('sending')
  expect(msg?._localOnly).toBe(true)
  const pw = await getDb('u').pendingWrites.toArray()
  expect(pw.length).toBe(1)
  expect(pw[0].kind).toBe('send_message')
  expect(pw[0].localMessageId).toBe(id)
})
