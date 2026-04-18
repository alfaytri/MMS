import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Count activity_log entries for a given action by a given actor in the
 * last `windowSeconds`. Returns true if the caller is OVER the limit.
 *
 * Cheap and durable — works across serverless cold-starts and instances
 * because it uses the DB. Not high-throughput; fine for admin actions.
 */
export async function isRateLimited(params: {
  action: string            // e.g. 'user.admin_create'
  actorAuthUserId: string   // user's auth uid
  max: number               // e.g. 10
  windowSeconds: number     // e.g. 60
}): Promise<boolean> {
  const since = new Date(Date.now() - params.windowSeconds * 1000).toISOString()
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (admin as any)
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('action', params.action)
    .gte('created_at', since)
    .ilike('details', `%"actor_auth_user_id":"${params.actorAuthUserId}"%`)

  if (error) {
    // Fail open — if the audit table isn't reachable, don't block admin work.
    // The request is still gated by requireAdmin().
    console.error('rate-limit query failed:', error.message)
    return false
  }
  return (count ?? 0) >= params.max
}
