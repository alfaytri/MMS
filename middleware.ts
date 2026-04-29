import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Explicit allowlist — no stringly-typed bypass, no startsWith surprises.
const ALLOWED_PATHS = new Set<string>([
  '/login',
  '/change-password',
  '/api/users/me/change-password',
])
const ALLOWED_PREFIXES = ['/api/auth/', '/_next/', '/favicon']

function isAllowedPath(path: string): boolean {
  if (ALLOWED_PATHS.has(path)) return true
  return ALLOWED_PREFIXES.some((p) => path.startsWith(p))
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            const sessionOptions = { ...options }
            // Bounded 8-hour max-age — dies at wall-clock expiry even if
            // the browser restores sessions on startup (Brave, Chrome, etc.)
            sessionOptions.maxAge = value === '' ? 0 : 8 * 60 * 60
            delete sessionOptions.expires
            supabaseResponse.cookies.set(name, value, sessionOptions)
          })
        },
      },
    }
  )

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Network or JWT failure — treat as unauthenticated (fail-closed)
  }

  const pathname = request.nextUrl.pathname

  // ─── Unauthenticated gate ────────────────────────────────────────────
  // Anyone without a session is sent to /login, except for /login itself
  // (and non-page assets, which are already excluded by the matcher).
  if (!user && pathname !== '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve the original destination so we can redirect back after login
    if (pathname !== '/') url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // ─── Authenticated-at-/login redirect ────────────────────────────────
  // If a signed-in user hits /login, send them to the dashboard instead
  // of rendering the login form over an active session.
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // ─── Force-change-password gate ──────────────────────────────────────
  if (user) {
    // Primary: JWT user_metadata — no DB roundtrip.
    let mustChange = Boolean(user.user_metadata?.must_change_password)

    // Fallback: if the claim is completely missing (legacy sessions, or a
    // JWT that hasn't been refreshed yet), consult the DB mirror.
    if (user.user_metadata?.must_change_password === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('must_change_password')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      mustChange = Boolean(profile?.must_change_password)
    }

    if (mustChange && !isAllowedPath(pathname)) {
      const url = request.nextUrl.clone()
      url.pathname = '/change-password'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
