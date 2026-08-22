import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

interface AgentInfo {
  profile_id: string
  name:       string | null
}

export async function resolveAgentByExtension(
  supabase: ReturnType<typeof createClient<Database>>,
  extension: string,
): Promise<AgentInfo | null> {
  if (!extension) return null
  const { data } = await supabase
    .from('user_data')
    .select('id, full_name')
    .eq('threecx_extension', extension)
    .maybeSingle()
  if (!data) return null
  return { profile_id: data.id, name: data.full_name ?? null }
}
