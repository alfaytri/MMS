import { createClient } from '@/lib/supabase/client'

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

export async function getApprovalScopeRecipients(scope: string): Promise<string[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('user_custom_roles')
    .select('profile_id')
    .or(`approval_scopes.is.null,approval_scopes.cs.{${scope}}`)
  return [...new Set((data ?? []).map((r: { profile_id: string }) => r.profile_id))]
}
