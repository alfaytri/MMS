import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

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
    // Deliberately omit maxAge and expires → session cookie.
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
