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
