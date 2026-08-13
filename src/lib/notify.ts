import { createClient } from '@/lib/supabase/client'
import { NOTIFICATION_RECIPIENTS } from '@/lib/notification-routes'

type NotificationPayload = {
  profile_id: string
  type: string
  title: string
  body?: string | null
  related_id?: string | null
  related_type?: string | null
}

export async function sendNotifications(notifications: NotificationPayload[]) {
  if (notifications.length === 0) return
  const supabase = createClient()
  await supabase.from('notifications').insert(notifications)
}

export async function notifyOne(
  profileId: string,
  type: string,
  title: string,
  opts?: { body?: string; relatedId?: string; relatedType?: string },
) {
  await sendNotifications([{
    profile_id: profileId,
    type,
    title,
    body: opts?.body ?? null,
    related_id: opts?.relatedId ?? null,
    related_type: opts?.relatedType ?? null,
  }])
}

/**
 * Phase-2 recipient resolver. Returns the profile ids of everyone whose role
 * grants `perm` (or full system-admin, or `opts.override`). For warehouse-scoped
 * notification types, pass `opts.warehouseId` — perm-holders are then narrowed to
 * that warehouse's RPs, while `opts.override` holders are always included.
 *
 * Backed by the single-source-of-truth SECURITY DEFINER function
 * `recipients_for_permission` (see migration 20260822000000). undefined opts are
 * dropped from the JSON body, so the SQL defaults (NULL) apply.
 */
export async function getRecipientsForPermission(
  perm: string,
  opts?: { warehouseId?: string; override?: string },
): Promise<string[]> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('recipients_for_permission', {
    p_perm: perm,
    p_warehouse_id: opts?.warehouseId,
    p_override: opts?.override,
  })
  if (error) {
    throw new Error(
      `recipients_for_permission(${perm}): ${error.code} ${error.message} ${error.details ?? ''} ${error.hint ?? ''}`.trim(),
    )
  }
  return [...new Set((data ?? []) as string[])]
}

/**
 * Resolve recipients for a notification TYPE using its NOTIFICATION_RECIPIENTS
 * entry. Union of:
 *   - the feature-permission holders (warehouse-scoped + override) — the auto-couple, and
 *   - holders of the type's notify.* key (unscoped) — the role-editor override that lets
 *     an admin send a notification to someone WITHOUT the underlying access.
 * Returns [] for a type with no recipient mapping (e.g. pure identity-to-requester outcomes).
 */
export async function recipientsForNotification(
  type: string,
  opts?: { warehouseId?: string },
): Promise<string[]> {
  const meta = NOTIFICATION_RECIPIENTS[type]
  if (!meta) return []
  const ids = new Set(
    await getRecipientsForPermission(meta.permission, {
      warehouseId: meta.warehouseScoped ? opts?.warehouseId : undefined,
      override: meta.override,
    }),
  )
  if (meta.notifyKey) {
    for (const id of await getRecipientsForPermission(meta.notifyKey)) ids.add(id)
  }
  return [...ids]
}
