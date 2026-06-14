import type { SupabaseClient } from '@supabase/supabase-js'

interface EnsureArgs {
  phone:    string
  teamName: string | null
}

export async function ensureTeamConversation(
  supabase: SupabaseClient,
  { phone, teamName }: EnsureArgs,
): Promise<string> {
  const existing = await supabase.from('chat_conversations')
    .select('id')
    .eq('wati_phone', phone)
    .eq('provider', 'whapi')
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data?.id) return existing.data.id

  const inserted = await supabase.from('chat_conversations')
    .insert({
      wati_phone:        phone,
      provider:          'whapi',
      wati_contact_name: teamName,
      customer_id:       null,
      conversation_type: 'team',
    })
    .select('id')
    .single()

  if (!inserted.error && inserted.data?.id) return inserted.data.id

  if (inserted.error?.code === '23505') {
    const raced = await supabase.from('chat_conversations')
      .select('id')
      .eq('wati_phone', phone)
      .eq('provider', 'whapi')
      .maybeSingle()
    if (raced.data?.id) return raced.data.id
  }

  throw new Error(inserted.error?.message ?? 'ensureTeamConversation failed')
}
