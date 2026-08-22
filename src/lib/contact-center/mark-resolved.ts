import type { SupabaseClient } from '@supabase/supabase-js'
import type { MmsCcDb } from './local/db'

export async function markResolved(
  supabase: SupabaseClient,
  db:       MmsCcDb,
  conversationId: string,
): Promise<void> {
  const existing = await db.conversations.get(conversationId)
  const previous = existing?.unanswered_dismissed_at ?? null
  const now      = new Date().toISOString()

  await db.conversations.update(conversationId, { unanswered_dismissed_at: now })

  const { error } = await supabase
    .from('chat_conversations')
    .update({ unanswered_dismissed_at: now })
    .eq('id', conversationId)

  if (error) {
    await db.conversations.update(conversationId, { unanswered_dismissed_at: previous })
    throw new Error(error.message)
  }
}
