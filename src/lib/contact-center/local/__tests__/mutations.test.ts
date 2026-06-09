import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../db'
import { sendMessageLocal, sendFileLocal } from '../mutations'

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

it('writes a sending file row + pending_write and registers the blob in the fileMap', async () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'doc.pdf', { type: 'application/pdf' })
  const fileMap = new Map<string, File>()

  const id = await sendFileLocal(getDb('u'), fileMap, {
    conversationId: 'c1', phone: '+x', file, caption: 'see attached',
  })
  const msg = await getDb('u').messages.get(id)
  expect(msg?.message_type).toBe('document')
  expect(msg?.attachments?.[0].url).toMatch(/^blob:/)
  expect(msg?.text).toBe('see attached')
  const pw = await getDb('u').pendingWrites.where('kind').equals('send_file').toArray()
  expect(pw.length).toBe(1)
  expect(pw[0].fileRef).toBeTruthy()
  expect(fileMap.has(pw[0].fileRef!)).toBe(true)
  expect(fileMap.get(pw[0].fileRef!)).toBe(file)
})
