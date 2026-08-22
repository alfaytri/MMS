import { it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, resetDb } from '../db'
import { sendMessageLocal, sendFileLocal, sendTemplateLocal, reactLocal, updateCustomerLocal, addAddressLocal, updateAddressLocal, addPhoneLocal, removePhoneLocal, markReadLocal, markOpenedLocal } from '../mutations'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[0].payload as any).templateName).toBe('booking_confirm')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[0].payload as any).parameters).toEqual(['42', 'June 10'])
})

it('reactLocal toggles agent reaction and enqueues with empty emoji on removal', async () => {
  const db = getDb('u')
  await db.messages.add({
    id: 'm1', conversation_id: 'c1', from_type: 'customer', source: 'whatsapp_api',
    message_kind: 'message', message_type: 'text', text: 'hello', agent_name: null,
    attachments: null, reactions: [], delivery_status: 'delivered', external_id: 'ext1',
    reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
    deleted_at: null, revoked_at: null, created_at: new Date().toISOString(),
  })

  // First click — add the reaction. Upstream payload carries the emoji.
  await reactLocal(db, { messageId: 'm1', emoji: '👍', phone: '+x', provider: 'whapi' })
  let msg = await db.messages.get('m1')
  expect(msg?.reactions).toEqual([{ emoji: '👍', from_type: 'agent' }])
  let pw = await db.pendingWrites.where('kind').equals('react').toArray()
  expect(pw.length).toBe(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[0].payload as any).emoji).toBe('👍')

  // Second click — toggle off. Upstream payload must carry empty emoji so the
  // customer's WhatsApp clears the reaction; otherwise we re-add the same one.
  await reactLocal(db, { messageId: 'm1', emoji: '👍', phone: '+x', provider: 'whapi' })
  msg = await db.messages.get('m1')
  expect(msg?.reactions).toEqual([])
  pw = await db.pendingWrites.where('kind').equals('react').toArray()
  expect(pw.length).toBe(2)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[1].payload as any).emoji).toBe('')
})

it('reactLocal replaces the agent reaction when picking a different emoji (no stacking)', async () => {
  // WhatsApp allows exactly one reaction per sender. Picking a second emoji
  // must drop the first one locally and send the NEW emoji upstream — not
  // append a second bubble or fire a removal.
  const db = getDb('u-switch')
  await db.messages.add({
    id: 'm3', conversation_id: 'c1', from_type: 'customer', source: 'whatsapp_api',
    message_kind: 'message', message_type: 'text', text: 'yo', agent_name: null,
    attachments: null, reactions: [], delivery_status: 'delivered', external_id: 'ext3',
    reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
    deleted_at: null, revoked_at: null, created_at: new Date().toISOString(),
  })

  await reactLocal(db, { messageId: 'm3', emoji: '👍', phone: '+x', provider: 'whapi' })
  await reactLocal(db, { messageId: 'm3', emoji: '❤️', phone: '+x', provider: 'whapi' })

  const msg = await db.messages.get('m3')
  expect(msg?.reactions).toEqual([{ emoji: '❤️', from_type: 'agent' }])

  const pw = await db.pendingWrites.where('kind').equals('react').toArray()
  expect(pw.length).toBe(2)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[0].payload as any).emoji).toBe('👍')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[1].payload as any).emoji).toBe('❤️')   // NEW emoji, not '' (not a removal)
})

it('reactLocal enqueues for wati provider with the same empty-emoji removal contract', async () => {
  // Use a fresh user id so the underlying IndexedDB store starts empty —
  // resetDb() only closes handles, fake-indexeddb keeps the data per db name.
  const db = getDb('u-wati-react')
  await db.messages.add({
    id: 'm2', conversation_id: 'c1', from_type: 'customer', source: 'whatsapp_api',
    message_kind: 'message', message_type: 'text', text: 'hi', agent_name: null,
    attachments: null, reactions: [], delivery_status: 'delivered', external_id: 'ext2',
    reply_to_external_id: null, sent_by_profile_id: null, phone_id: null,
    deleted_at: null, revoked_at: null, created_at: new Date().toISOString(),
  })

  await reactLocal(db, { messageId: 'm2', emoji: '❤️', phone: '+x', provider: 'wati' })
  let pw = await db.pendingWrites.where('kind').equals('react').toArray()
  expect(pw.length).toBe(1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[0].payload as any).provider).toBe('wati')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[0].payload as any).emoji).toBe('❤️')

  await reactLocal(db, { messageId: 'm2', emoji: '❤️', phone: '+x', provider: 'wati' })
  const msg = await db.messages.get('m2')
  expect(msg?.reactions).toEqual([])
  pw = await db.pendingWrites.where('kind').equals('react').toArray()
  expect(pw.length).toBe(2)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect((pw[1].payload as any).emoji).toBe('')
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

it('markReadLocal sets unread_count to 0 and enqueues mark_read', async () => {
  const db = getDb('u')
  await db.conversations.add({
    id: 'conv-1', customer_id: null, customer_id_v2: null,
    conversation_type: null, wati_phone: '+x', wati_contact_name: null,
    last_message: null, last_message_at: null, unread_count: 5,
    assigned_agent: null, is_opened: false, wati_status: null,
    provider: 'wati', created_at: new Date().toISOString(),
  })
  await markReadLocal(db, 'conv-1')
  const conv = await db.conversations.get('conv-1')
  expect(conv?.unread_count).toBe(0)
  const pw = await db.pendingWrites.where('kind').equals('mark_read').toArray()
  expect(pw.length).toBeGreaterThanOrEqual(1)
})

it('markOpenedLocal sets is_opened to true and enqueues mark_opened', async () => {
  const db = getDb('u')
  await db.conversations.add({
    id: 'conv-2', customer_id: null, customer_id_v2: null,
    conversation_type: null, wati_phone: '+x', wati_contact_name: null,
    last_message: null, last_message_at: null, unread_count: 0,
    assigned_agent: null, is_opened: false, wati_status: null,
    provider: 'wati', created_at: new Date().toISOString(),
  })
  await markOpenedLocal(db, 'conv-2')
  const conv = await db.conversations.get('conv-2')
  expect(conv?.is_opened).toBe(true)
  const pw = await db.pendingWrites.where('kind').equals('mark_opened').toArray()
  expect(pw.length).toBeGreaterThanOrEqual(1)
})
