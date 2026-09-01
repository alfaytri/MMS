// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const WEBHOOK_PREFIXES = [
  '/api/webhooks/',
  // Scheduled-notifications cron — called by an external scheduler with a shared
  // secret (no user session); the route validates `x-cron-secret` itself.
  '/api/cron/',
]

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const path = request.nextUrl.pathname
  if (WEBHOOK_PREFIXES.some((p) => path.startsWith(p))) {
    return response
  }

  // Sentry tunnel (see next.config.ts `tunnelRoute`): the browser POSTs error
  // envelopes here and the Sentry route handler forwards them to Sentry
  // server-side, so ad blockers can't drop them. Short-circuit before the
  // Supabase auth refresh — it's not an app route, it fires even from error
  // boundaries that may have no session, and skipping the refresh avoids a
  // Supabase auth round-trip on every reported error.
  if (path === '/monitoring') {
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

  await supabase.auth.getUser()

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
