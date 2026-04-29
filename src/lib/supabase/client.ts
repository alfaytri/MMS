import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

// Session cookies live for 8 hours of wall time.
// Combined with the 10-min inactivity guard this means:
//   - Leaving the browser open all night → session gone in the morning
//   - Closing the tab/window → session gone on reopening (browser honours maxAge)
const SESSION_MAX_AGE = 8 * 60 * 60 // seconds

function getAllCookies(): { name: string; value: string }[] {
  if (typeof document === 'undefined') return []
  return document.cookie
    .split('; ')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=')
      return {
        name: decodeURIComponent(pair.slice(0, eq)),
        value: decodeURIComponent(pair.slice(eq + 1)),
      }
    })
}

function setAllCookies(
  cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
) {
  if (typeof document === 'undefined') return
  for (const { name, value, options } of cookiesToSet) {
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`]
    const path = (options?.path as string | undefined) ?? '/'
    parts.push(`path=${path}`)
    if (options?.domain) parts.push(`domain=${String(options.domain)}`)
    if (options?.sameSite) parts.push(`samesite=${String(options.sameSite)}`)
    if (options?.secure) parts.push('secure')

    // Explicit max-age so the cookie dies after SESSION_MAX_AGE even if the
    // browser restores sessions (Brave, Chrome "continue where you left off").
    // An empty value means Supabase is clearing the cookie — honour that by
    // setting max-age=0 (immediate expiry) instead of SESSION_MAX_AGE.
    const maxAge = value === '' ? 0 : SESSION_MAX_AGE
    parts.push(`max-age=${maxAge}`)

    document.cookie = parts.join('; ')
  }
}

let _client: SupabaseClient<Database> | null = null

export function createClient(): SupabaseClient<Database> {
  if (_client) return _client
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: getAllCookies,
        setAll: setAllCookies,
      },
    },
  )
  return _client
}
