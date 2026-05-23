// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

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
  const path = request.nextUrl.pathname

  // Fix 1: never redirect API or Next.js internal routes
  if (
    isTeamLeader &&
    !path.startsWith('/team-leader') &&
    !path.startsWith('/api/') &&
    !path.startsWith('/_next/')
  ) {
    return NextResponse.redirect(new URL('/team-leader', request.url))
  }

  // Signal to layout that this is a team leader session (stripped layout)
  if (isTeamLeader) {
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
