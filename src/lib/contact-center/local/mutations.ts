import type { MmsCcDb } from './db'
import { newId } from './ids'
import * as q from './pending-writes'
import type { MessageType } from './schema'

export interface SendMessageArgs {
  conversationId: string
  phone: string
  text: string
  agentProfileId?: string | null
  agentName?: string | null
  source?: 'whatsapp_api' | 'whatsapp_whapi'
}

export interface SendFileArgs {
  conversationId: string
  phone: string
  file: File
  caption?: string
  agentProfileId?: string | null
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

  fileMap.set(fileRef, args.file)

  await db.transaction('rw', db.messages, db.pendingWrites, async () => {
    await db.messages.add({
      id,
      conversation_id: args.conversationId,
      from_type: 'agent',
      source: 'whatsapp_api',
      message_kind: 'message',
      message_type: inferMessageType(args.file.type),
      text: args.caption ?? null,
      agent_name: null,
      attachments: [{ url: objectUrl, type: args.file.type, name: args.file.name, status: 'local' }],
      reactions: [],
      delivery_status: 'sending',
      external_id: null,
      reply_to_external_id: null,
      sent_by_profile_id: args.agentProfileId ?? null,
      phone_id: null,
      deleted_at: null,
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
      agent_name: null,
      attachments: null,
      reactions: [],
      delivery_status: 'sending',
      external_id: null,
      reply_to_external_id: null,
      sent_by_profile_id: null,
      phone_id: null,
      deleted_at: null,
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

export async function sendMessageLocal(db: MmsCcDb, args: SendMessageArgs): Promise<string> {
  const id = newId()
  const now = new Date().toISOString()

  await db.transaction('rw', db.messages, db.pendingWrites, async () => {
    await db.messages.add({
      id,
      conversation_id: args.conversationId,
      from_type: 'agent',
      source: args.source ?? 'whatsapp_api',
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
      },
      localMessageId: id,
    })
  })

  return id
}
