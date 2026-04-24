import { createClient } from '@/lib/supabase/client'

export const ROLE_LABELS: Record<string, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export async function logPOActivity({
  poId,
  action,
  details,
  performerName,
  severity = 'info',
}: {
  poId: string
  action: string
  details?: string | null
  performerName?: string | null
  severity?: 'info' | 'warning' | 'critical'
}) {
  try {
    const supabase = createClient()
    await (supabase as any).from('activity_log').insert({
      entity_type: 'purchase_order',
      entity_id: poId,
      module: 'purchase_orders',
      action,
      details: details ?? null,
      performer_name: performerName ?? null,
      severity,
    })
  } catch {
    // Non-blocking — never fail the main operation for a log write
  }
}

export async function resolveMyName(): Promise<string | null> {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await (supabase as any)
      .from('profiles').select('full_name').eq('auth_user_id', user.id).maybeSingle()
    return profile?.full_name ?? user.email ?? null
  } catch {
    return null
  }
}
