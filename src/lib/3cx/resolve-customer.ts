import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

interface Resolved {
  conversation_id: string
  customer_id:     string | null
  phone_id:        string | null
}

export async function resolveConversation(
  supabase: ReturnType<typeof createClient<Database>>,
  callerPhone: string,
): Promise<Resolved> {
  if (!callerPhone) throw new Error('callerPhone required')

  const { data: phoneRow } = await supabase
    .from('service_customer_phones')
    .select('id, customer_id')
    .eq('phone', callerPhone)
    .maybeSingle()

  const customerId = phoneRow?.customer_id ?? null
  const phoneId    = phoneRow?.id ?? null

  if (customerId) {
    const { data: existing } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('customer_id_v2', customerId)
      .maybeSingle()
    if (existing) return { conversation_id: existing.id, customer_id: customerId, phone_id: phoneId }

    const { data: created, error } = await supabase
      .from('chat_conversations')
      .insert({
        customer_id_v2:    customerId,
        wati_phone:        callerPhone,
        last_message_at:   new Date().toISOString(),
        unread_count:      0,
      })
      .select('id')
      .single()
    if (error || !created) throw new Error(error?.message ?? 'create conversation failed')
    return { conversation_id: created.id, customer_id: customerId, phone_id: phoneId }
  }

  const { data: existingUnknown } = await supabase
    .from('chat_conversations')
    .select('id')
    .is('customer_id_v2', null)
    .eq('unknown_phone', callerPhone)
    .maybeSingle()
  if (existingUnknown) {
    return { conversation_id: existingUnknown.id, customer_id: null, phone_id: null }
  }

  const { data: createdUnknown, error: err2 } = await supabase
    .from('chat_conversations')
    .insert({
      customer_id_v2:  null,
      unknown_phone:   callerPhone,
      wati_phone:      callerPhone,
      last_message_at: new Date().toISOString(),
      unread_count:    0,
    })
    .select('id')
    .single()
  if (err2 || !createdUnknown) throw new Error(err2?.message ?? 'create unknown conversation failed')
  return { conversation_id: createdUnknown.id, customer_id: null, phone_id: null }
}
