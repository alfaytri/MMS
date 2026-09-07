import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Prime the Realtime socket with the current access token so PRIVATE channels
 * (Broadcast with RLS on realtime.messages — see migration 20261058000000)
 * authorize when they subscribe. Without a token the join is treated as anon
 * and the cc_broadcast_receive policy denies it.
 *
 * Call once before subscribing; supabase-js re-sends the token to channels on
 * refresh automatically after the first setAuth. Best-effort — a missing
 * session just means private channels stay unauthorized (they retry on the
 * next mount).
 */
export async function primeRealtimeAuth(supabase: SupabaseClient): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) await supabase.realtime.setAuth(token)
  } catch {
    /* best-effort */
  }
}
