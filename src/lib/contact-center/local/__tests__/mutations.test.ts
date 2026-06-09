import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../db'
import { sendMessageLocal, sendFileLocal, sendTemplateLocal, reactLocal, updateCustomerLocal, addAddressLocal, updateAddressLocal, addPhoneLocal, removePhoneLocal } from '../mutations'

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

it('writes a sending template message + pending_write', async () => {
  const id = await sendTemplateLocal(getDb('u'), {
    conversationId: 'c1',
    phone: '+97412345678',
    templateName: 'booking_confirm',
    broadcastName: 'mms_booking_confirm_123',
    bodyText: 'Your booking 42 is confirmed for June 10',
    variables: ['42', 'June 10'],
  })
  const msg = await getDb('u').messages.get(id)
  expect(msg?.message_type).toBe('template')
  expect(msg?.text).toBe('Your booking 42 is confirmed for June 10')
  expect(msg?.delivery_status).toBe('sending')
  const pw = await getDb('u').pendingWrites.where('kind').equals('send_template').toArray()
  expect(pw.length).toBe(1)
  expect((pw[0].payload as any).templateName).toBe('booking_confirm')
  expect((pw[0].payload as any).parameters).toEqual(['42', 'June 10'])
})

it('reactLocal toggles agent reaction and enqueues for whapi only', async () => {
  const db = getDb('u')
  await db.messages.add({
    id: 'm1', conversation_id: 'c1', from_type: 'customer', source: 'whatsapp_api',
    message_kind: 'message', message_type: 'text', text: 'hello', agent_name: null,
    attachments: null, reactions: [], delivery_status: 'delivered', external_id: 'ext1',
    reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
    deleted_at: null, created_at: new Date().toISOString(),
  })

  await reactLocal(db, { messageId: 'm1', emoji: '👍', phone: '+x', provider: 'whapi' })
  let msg = await db.messages.get('m1')
  expect(msg?.reactions).toEqual([{ emoji: '👍', from_type: 'agent' }])
  let pw = await db.pendingWrites.where('kind').equals('react').toArray()
  expect(pw.length).toBe(1)

  await reactLocal(db, { messageId: 'm1', emoji: '👍', phone: '+x', provider: 'whapi' })
  msg = await db.messages.get('m1')
  expect(msg?.reactions).toEqual([])
})

it('reactLocal skips pending_write for wati provider', async () => {
  const db = getDb('u')
  await db.messages.add({
    id: 'm2', conversation_id: 'c1', from_type: 'customer', source: 'whatsapp_api',
    message_kind: 'message', message_type: 'text', text: 'hi', agent_name: null,
    attachments: null, reactions: [], delivery_status: 'delivered', external_id: 'ext2',
    reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
    deleted_at: null, created_at: new Date().toISOString(),
  })

  const beforeCount = await db.pendingWrites.where('kind').equals('react').count()
  await reactLocal(db, { messageId: 'm2', emoji: '❤️', phone: '+x', provider: 'wati' })
  const msg = await db.messages.get('m2')
  expect(msg?.reactions).toEqual([{ emoji: '❤️', from_type: 'agent' }])
  const afterCount = await db.pendingWrites.where('kind').equals('react').count()
  expect(afterCount).toBe(beforeCount)
})

it('updateCustomerLocal patches Dexie and enqueues update_customer', async () => {
  const db = getDb('u')
  await db.customers.add({
    id: 'cust-1', name: 'Old Name', name_ar: null, customer_type: 'individual',
    is_blocked: false, pending_payment_amount: 0, created_at: new Date().toISOString(),
  })

  await updateCustomerLocal(db, { customerId: 'cust-1', name: 'New Name' })
  const cust = await db.customers.get('cust-1')
  expect(cust?.name).toBe('New Name')
  const pw = await db.pendingWrites.where('kind').equals('update_customer').toArray()
  expect(pw.length).toBeGreaterThanOrEqual(1)
  expect((pw[pw.length - 1].payload as any).customerId).toBe('cust-1')
})

it('addAddressLocal writes to Dexie and enqueues add_address', async () => {
  const db = getDb('u')
  const id = await addAddressLocal(db, {
    customerId: 'cust-1', type: 'blue_plate',
    zone: '45', street: '100', building: '12', unit: '3A',
  })
  const addr = await db.addresses.get(id)
  expect(addr?.zone).toBe('45')
  expect(addr?.customer_id).toBe('cust-1')
  const pw = await db.pendingWrites.where('kind').equals('add_address').toArray()
  expect(pw.length).toBeGreaterThanOrEqual(1)
})

it('updateAddressLocal patches Dexie and enqueues update_address', async () => {
  const db = getDb('u')
  await db.addresses.add({
    id: 'a1', customer_id: 'cust-1', address_type: 'blue_plate',
    label: null, unit: '1', building: '2', street: '3', zone: '4',
    lat: null, lng: null, is_primary: false, is_geocoded: false,
    waze_link: null, tags: [], created_at: new Date().toISOString(),
  })
  await updateAddressLocal(db, { addressId: 'a1', patch: { unit: '99' } })
  const addr = await db.addresses.get('a1')
  expect(addr?.unit).toBe('99')
  const pw = await db.pendingWrites.where('kind').equals('update_address').toArray()
  expect(pw.length).toBeGreaterThanOrEqual(1)
})

it('addPhoneLocal writes phone to Dexie and enqueues add_phone', async () => {
  const db = getDb('u')
  const id = await addPhoneLocal(db, { customerId: 'cust-1', phone: '+97412345678' })
  const phone = await db.phones.get(id)
  expect(phone?.phone).toBe('+97412345678')
  expect(phone?.customer_id).toBe('cust-1')
  const pw = await db.pendingWrites.where('kind').equals('add_phone').toArray()
  expect(pw.length).toBeGreaterThanOrEqual(1)
})

it('removePhoneLocal deletes from Dexie and enqueues remove_phone', async () => {
  const db = getDb('u')
  await db.phones.add({
    id: 'p1', customer_id: 'cust-1', phone: '+97499999999',
    is_primary: false, label: null, created_at: new Date().toISOString(),
  })
  await removePhoneLocal(db, 'p1')
  const phone = await db.phones.get('p1')
  expect(phone).toBeUndefined()
  const pw = await db.pendingWrites.where('kind').equals('remove_phone').toArray()
  expect(pw.length).toBeGreaterThanOrEqual(1)
})
