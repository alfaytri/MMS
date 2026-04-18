import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'

/**
 * Parse `document.cookie` into the shape `@supabase/ssr` expects.
 * Matches the library's default behavior.
 */
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

/**
 * Write cookies as **session cookies** — no `Max-Age`, no `Expires` —
 * so the browser drops them when the window/process closes.
 * Everything else (path, domain, sameSite, secure) is preserved.
 */
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

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: getAllCookies,
        setAll: setAllCookies,
      },
    },
  )
}
