// src/lib/logActivity.ts
// Fire-and-forget activity logger. Never throws — failures are silently ignored
// so they never block user-facing operations.
import { createClient } from '@/lib/supabase/client'

export async function logActivity(payload: {
  action:       string
  module:       string
  entity_id:    string
  entity_type?: string
  details?:     string | null
  severity?:    'info' | 'warning' | 'critical'
  performer_name?: string | null
}): Promise<void> {
  try {
    const supabase = createClient()
    await (supabase as any).from('activity_log').insert({
      action:         payload.action,
      module:         payload.module,
      entity_id:      payload.entity_id,
      entity_type:    payload.entity_type ?? payload.module,
      details:        payload.details   ?? null,
      severity:       payload.severity  ?? 'info',
      performer_name: payload.performer_name ?? null,
    })
  } catch {
    // intentional no-op
  }
}
