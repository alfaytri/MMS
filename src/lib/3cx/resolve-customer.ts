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

  // Prefer a conversation already linked to the customer (any provider).
  if (customerId) {
    const { data: byCustomer } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('customer_id_v2', customerId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    if (byCustomer) return { conversation_id: byCustomer.id, customer_id: customerId, phone_id: phoneId }
  }

  // Fall back to ANY existing row keyed by this phone (WATI/WHAPI/etc.)
  // so a 3cx call attaches to the customer's existing thread instead of
  // colliding on the (wati_phone, provider) unique constraint.
  const { data: byPhone } = await supabase
    .from('chat_conversations')
    .select('id')
    .eq('wati_phone', callerPhone)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (byPhone) return { conversation_id: byPhone.id, customer_id: customerId, phone_id: phoneId }

  // No existing conversation anywhere — insert.
  if (customerId) {
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
