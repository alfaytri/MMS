// src/lib/logActivity.ts
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/database.types'

export async function logActivity(payload: {
  action:       string
  module:       string
  entity_id:    string
  entity_type?: string
  details?:     string | null
  severity?:    'info' | 'warning' | 'critical'
  performer_name?: string | null
  old_data?:    Record<string, unknown> | null
  new_data?:    Record<string, unknown> | null
}): Promise<void> {
  try {
    const supabase = createClient()

    let performerName = payload.performer_name ?? null
    if (!performerName) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        performerName = profile?.full_name ?? user.email ?? 'System'
      }
    }

    await supabase.from('activity_log').insert({
      action:         payload.action,
      module:         payload.module,
      entity_id:      payload.entity_id,
      entity_type:    payload.entity_type ?? payload.module,
      details:        payload.details   ?? null,
      severity:       payload.severity  ?? 'info',
      performer_name: performerName,
      old_data:       (payload.old_data ?? null) as Json | null,
      new_data:       (payload.new_data ?? null) as Json | null,
    })
  } catch {
    // intentional no-op — never block user operations
  }
}
