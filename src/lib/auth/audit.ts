import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction =
  | 'user.admin_create'
  | 'user.admin_update'
  | 'user.admin_reset_password'
  | 'user.self_change_password'

/**
 * Append a row to activity_log. Never throws — failure to audit must not
 * break the primary operation.
 *
 * Uses only base columns (action, entity_type, entity_id, details, created_at)
 * to avoid coupling to activity_log schema extensions we can't verify.
 */
export async function logUserEvent(params: {
  action: AuditAction
  actorAuthUserId: string
  targetProfileId: string | null  // may be null for self-change where we don't know profile.id
  targetEmail: string | null
  changedFields?: string[]        // for update events
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const details = JSON.stringify({
      actor_auth_user_id: params.actorAuthUserId,
      target_email: params.targetEmail,
      ...(params.changedFields ? { changed_fields: params.changedFields } : {}),
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('activity_log').insert({
      action: params.action,
      entity_type: 'profile',
      entity_id: params.targetProfileId ?? '00000000-0000-0000-0000-000000000000',
      details,
    })
  } catch (e) {
    // Swallow — audit is best-effort.
    console.error('audit log insert failed:', e)
  }
}
