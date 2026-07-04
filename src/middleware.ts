// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// External webhook endpoints called by third-party services (3CX, Wati, WhAPI,
// 17track, Dibsy). These requests never carry a Supabase session cookie, so
// running supabase.auth.getUser() against them only logs noisy
// "refresh_token_not_found" errors. Each route validates its own shared
// secret / signature internally — see the matching route files.
const WEBHOOK_PREFIXES = [
  '/api/webhooks/',
  '/api/payments/dibsy/webhook/',
]

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const path = request.nextUrl.pathname
  if (WEBHOOK_PREFIXES.some((p) => path.startsWith(p))) {
    return response
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session (required by @supabase/ssr to keep cookies fresh)
  const { data: { user } } = await supabase.auth.getUser()

  const isTeamLeader = user?.user_metadata?.is_team_leader === true
  // Bootstrap admin bypass: when the logged-in email matches ADMIN_BOOTSTRAP_EMAIL,
  // treat the user as admin and skip the team-leader redirect even if the
  // user_metadata.is_team_leader flag is left over from earlier testing.
  // Same pattern as requireAdmin / requirePermission in src/lib/auth/require-admin.ts.
  const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const callerEmail = user?.email?.trim().toLowerCase() ?? null
  const isBootstrapAdmin = !!bootstrapEmail && callerEmail === bootstrapEmail

  // Fix 1: never redirect API, Next.js internal routes, or the public pay page.
  // Fix 2: bootstrap admin always passes through, even with is_team_leader set.
  if (
    isTeamLeader &&
    !isBootstrapAdmin &&
    !path.startsWith('/team-leader') &&
    !path.startsWith('/api/') &&
    !path.startsWith('/_next/') &&
    !path.startsWith('/pay/')
  ) {
    return NextResponse.redirect(new URL('/team-leader', request.url))
  }

  // Signal to layout that this is a team leader session (stripped layout).
  // Bootstrap admin keeps the full layout even if the metadata flag is set.
  if (isTeamLeader && !isBootstrapAdmin) {
    response.headers.set('x-is-team-leader', '1')
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder assets
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
