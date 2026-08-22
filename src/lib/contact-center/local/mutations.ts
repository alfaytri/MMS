import type { MmsCcDb } from './db'
import { newId } from './ids'
import * as q from './pending-writes'
import type { LocalAddress, MessageType } from './schema'

export interface SendMessageArgs {
  conversationId: string
  phone: string
  text: string
  agentProfileId?: string | null
  agentName?: string | null
  source?: 'whatsapp_api' | 'whatsapp_whapi'
  provider?: 'wati' | 'whapi'
}

export interface SendFileArgs {
  conversationId: string
  phone: string
  file: File
  caption?: string
  agentProfileId?: string | null
  agentName?: string | null
  provider?: 'wati' | 'whapi'
}

function inferMessageType(mime: string): MessageType {
  if (mime.startsWith('image/'))  return 'image'
  if (mime.startsWith('video/'))  return 'video'
  if (mime.startsWith('audio/'))  return 'audio'
  if (mime.startsWith('sticker')) return 'sticker'
  return 'document'
}

export async function sendFileLocal(
  db: MmsCcDb,
  fileMap: Map<string, File>,
  args: SendFileArgs,
): Promise<string> {
  const id = newId()
  const fileRef = newId()
  const now = new Date().toISOString()
  const objectUrl = URL.createObjectURL(args.file)
  const provider = args.provider ?? 'wati'
  const source: 'whatsapp_api' | 'whatsapp_whapi' = provider === 'whapi' ? 'whatsapp_whapi' : 'whatsapp_api'

  fileMap.set(fileRef, args.file)

  await db.transaction('rw', db.messages, db.pendingWrites, async () => {
    await db.messages.add({
      id,
      conversation_id: args.conversationId,
      from_type: 'agent',
      source,
      message_kind: 'message',
      message_type: inferMessageType(args.file.type),
      text: args.caption ?? null,
      agent_name: args.agentName ?? null,
      attachments: [{ url: objectUrl, type: args.file.type, name: args.file.name, status: 'local' }],
      reactions: [],
      delivery_status: 'sending',
      external_id: null,
      reply_to_external_id: null,
      sent_by_profile_id: args.agentProfileId ?? null,
      phone_id: null,
      deleted_at: null,
      revoked_at: null,
      created_at: now,
      _localOnly: true,
    })
    await q.enqueue(db, {
      kind: 'send_file',
      payload: {
        id,
        conversationId: args.conversationId,
        phone: args.phone,
        caption: args.caption ?? '',
        filename: args.file.name,
        mime: args.file.type,
        provider,
      },
      localMessageId: id,
      fileRef,
    })
  })

  return id
}

export interface SendTemplateArgs {
  conversationId: string
  phone: string
  templateName: string
  broadcastName: string
  bodyText: string
  variables: string[]
  headerUrl?: string
  agentProfileId?: string | null
  agentName?: string | null
}

export async function sendTemplateLocal(db: MmsCcDb, args: SendTemplateArgs): Promise<string> {
  const id = newId()
  const now = new Date().toISOString()

  await db.transaction('rw', db.messages, db.pendingWrites, async () => {
    await db.messages.add({
      id,
      conversation_id: args.conversationId,
      from_type: 'agent',
      source: 'whatsapp_api',
      message_kind: 'message',
      message_type: 'template' as MessageType,
      text: args.bodyText,
      agent_name: args.agentName ?? null,
      attachments: null,
      reactions: [],
      delivery_status: 'sending',
      external_id: null,
      reply_to_external_id: null,
      sent_by_profile_id: args.agentProfileId ?? null,
      phone_id: null,
      deleted_at: null,
      revoked_at: null,
      created_at: now,
      _localOnly: true,
    })
    await q.enqueue(db, {
      kind: 'send_template',
      payload: {
        id,
        conversationId: args.conversationId,
        phone: args.phone,
        templateName: args.templateName,
        broadcastName: args.broadcastName,
        parameters: args.variables,
        headerUrl: args.headerUrl ?? null,
      },
      localMessageId: id,
    })
  })

  return id
}

export interface ReactArgs {
  messageId: string
  emoji: string
  phone: string
  provider: 'wati' | 'whapi'
}

export async function reactLocal(db: MmsCcDb, args: ReactArgs): Promise<void> {
  const m = await db.messages.get(args.messageId)
  if (!m) return
  const existing = m.reactions ?? []

  // WhatsApp allows exactly one reaction per sender per message. Three cases:
  //   • agent has no reaction yet → add the new one
  //   • agent clicked the same emoji again → remove it (toggle off)
  //   • agent picked a different emoji → REPLACE the old one (drop + add)
  // The old code only handled the first two and stacked on the third.
  const currentAgentEmoji = existing.find((r) => r.from_type === 'agent')?.emoji ?? null
  const isToggleOff = currentAgentEmoji === args.emoji

  const updated = isToggleOff
    ? existing.filter((r) => r.from_type !== 'agent')
    : [
        ...existing.filter((r) => r.from_type !== 'agent'),
        { emoji: args.emoji, from_type: 'agent' as const },
      ]

  // Upstream contract: empty emoji = remove the agent's reaction. WhatsApp
  // Cloud (which both WATI and WHAPI proxy) auto-replaces when a sender posts
  // a new emoji, so for the switch case we just send the new emoji.
  const remoteEmoji = isToggleOff ? '' : args.emoji

  await db.transaction('rw', db.messages, db.pendingWrites, async () => {
    await db.messages.update(args.messageId, { reactions: updated })
    await q.enqueue(db, {
      kind: 'react',
      payload: { messageId: args.messageId, emoji: remoteEmoji, phone: args.phone, provider: args.provider },
      localMessageId: args.messageId,
    })
  })
}

export interface UpdateCustomerArgs {
  customerId: string
  name?: string
  nameAr?: string | null
  customerType?: 'individual' | 'business'
  isBlocked?: boolean
}

export async function updateCustomerLocal(db: MmsCcDb, args: UpdateCustomerArgs): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (args.name !== undefined) patch.name = args.name
  if (args.nameAr !== undefined) patch.name_ar = args.nameAr
  if (args.customerType !== undefined) patch.customer_type = args.customerType
  if (args.isBlocked !== undefined) patch.is_blocked = args.isBlocked

  await db.transaction('rw', db.customers, db.pendingWrites, async () => {
    await db.customers.update(args.customerId, patch)
    await q.enqueue(db, {
      kind: 'update_customer',
      payload: { customerId: args.customerId, ...patch },
    })
  })
}

export interface AddAddressArgs {
  customerId: string
  type: 'blue_plate' | 'google_coords'
  unit?: string
  building?: string
  street?: string
  zone?: string
  lat?: number | null
  lng?: number | null
  label?: string
  wazeLink?: string
  isPrimary?: boolean
}

export async function addAddressLocal(db: MmsCcDb, args: AddAddressArgs): Promise<string> {
  const id = newId()
  const now = new Date().toISOString()

  await db.transaction('rw', db.addresses, db.pendingWrites, async () => {
    await db.addresses.add({
      id,
      customer_id: args.customerId,
      address_type: args.type,
      label: args.label ?? null,
      unit: args.unit ?? null,
      building: args.building ?? null,
      street: args.street ?? null,
      zone: args.zone ?? null,
      lat: args.lat ?? null,
      lng: args.lng ?? null,
      is_primary: args.isPrimary ?? false,
      is_geocoded: !!(args.lat && args.lng),
      waze_link: args.wazeLink ?? null,
      tags: [],
      created_at: now,
    })
    await q.enqueue(db, {
      kind: 'add_address',
      payload: {
        id,
        customer_id: args.customerId,
        address_type: args.type,
        label: args.label ?? null,
        unit: args.unit ?? null,
        building: args.building ?? null,
        street: args.street ?? null,
        zone: args.zone ?? null,
        lat: args.lat ?? null,
        lng: args.lng ?? null,
        is_primary: args.isPrimary ?? false,
        waze_link: args.wazeLink ?? null,
      },
    })
  })

  return id
}

export interface UpdateAddressArgs {
  addressId: string
  patch: Partial<{
    label: string | null
    unit: string | null
    building: string | null
    street: string | null
    zone: string | null
    lat: number | null
    lng: number | null
    wazeLink: string | null
    isPrimary: boolean
  }>
}

export async function updateAddressLocal(db: MmsCcDb, args: UpdateAddressArgs): Promise<void> {
  const dbPatch: Partial<LocalAddress> = {}
  if (args.patch.label !== undefined) dbPatch.label = args.patch.label
  if (args.patch.unit !== undefined) dbPatch.unit = args.patch.unit
  if (args.patch.building !== undefined) dbPatch.building = args.patch.building
  if (args.patch.street !== undefined) dbPatch.street = args.patch.street
  if (args.patch.zone !== undefined) dbPatch.zone = args.patch.zone
  if (args.patch.lat !== undefined) dbPatch.lat = args.patch.lat
  if (args.patch.lng !== undefined) dbPatch.lng = args.patch.lng
  if (args.patch.wazeLink !== undefined) dbPatch.waze_link = args.patch.wazeLink
  if (args.patch.isPrimary !== undefined) dbPatch.is_primary = args.patch.isPrimary
  if (args.patch.lat !== undefined || args.patch.lng !== undefined) {
    dbPatch.is_geocoded = !!(args.patch.lat && args.patch.lng)
  }

  await db.transaction('rw', db.addresses, db.pendingWrites, async () => {
    await db.addresses.update(args.addressId, dbPatch)
    await q.enqueue(db, {
      kind: 'update_address',
      payload: { addressId: args.addressId, ...dbPatch },
    })
  })
}

export interface AddPhoneArgs {
  customerId: string
  phone: string
  label?: string
  isPrimary?: boolean
}

export async function addPhoneLocal(db: MmsCcDb, args: AddPhoneArgs): Promise<string> {
  const id = newId()
  const now = new Date().toISOString()

  await db.transaction('rw', db.phones, db.pendingWrites, async () => {
    await db.phones.add({
      id,
      customer_id: args.customerId,
      phone: args.phone,
      is_primary: args.isPrimary ?? false,
      label: args.label ?? null,
      created_at: now,
    })
    await q.enqueue(db, {
      kind: 'add_phone',
      payload: { id, customer_id: args.customerId, phone: args.phone, is_primary: args.isPrimary ?? false, label: args.label ?? null },
    })
  })

  return id
}

export async function removePhoneLocal(db: MmsCcDb, phoneId: string): Promise<void> {
  await db.transaction('rw', db.phones, db.pendingWrites, async () => {
    await db.phones.delete(phoneId)
    await q.enqueue(db, {
      kind: 'remove_phone',
      payload: { phoneId },
    })
  })
}

export async function markReadLocal(db: MmsCcDb, conversationId: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.pendingWrites, async () => {
    await db.conversations.update(conversationId, { unread_count: 0 })
    await q.enqueue(db, { kind: 'mark_read', payload: { conversationId } })
  })
}

export async function markOpenedLocal(db: MmsCcDb, conversationId: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.pendingWrites, async () => {
    await db.conversations.update(conversationId, { is_opened: true })
    await q.enqueue(db, { kind: 'mark_opened', payload: { conversationId } })
  })
}

export async function sendMessageLocal(db: MmsCcDb, args: SendMessageArgs): Promise<string> {
  const id = newId()
  const now = new Date().toISOString()
  const provider = args.provider ?? 'wati'
  const source = args.source ?? (provider === 'whapi' ? 'whatsapp_whapi' : 'whatsapp_api')

  await db.transaction('rw', db.messages, db.pendingWrites, async () => {
    await db.messages.add({
      id,
      conversation_id: args.conversationId,
      from_type: 'agent',
      source,
      message_kind: 'message',
      message_type: 'text' as MessageType,
      text: args.text,
      agent_name: args.agentName ?? null,
      attachments: null,
      reactions: [],
      delivery_status: 'sending',
      external_id: null,
      reply_to_external_id: null,
      sent_by_profile_id: args.agentProfileId ?? null,
      phone_id: null,
      deleted_at: null,
      revoked_at: null,
      created_at: now,
      _localOnly: true,
    })
    await q.enqueue(db, {
      kind: 'send_message',
      payload: {
        id,
        conversationId: args.conversationId,
        phone: args.phone,
        text: args.text,
        provider,
      },
      localMessageId: id,
    })
  })

  return id
}
