import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const sessionOptions = { ...options }
              // Bounded 8-hour max-age so sessions die even with browser session-restore.
              // Empty value = Supabase clearing the cookie, honour that with maxAge 0.
              sessionOptions.maxAge = value === '' ? 0 : 8 * 60 * 60
              delete sessionOptions.expires
              cookieStore.set(name, value, sessionOptions)
            })
          } catch {
            // Server Component — cookie mutations ignored here.
            // Middleware handles session refresh.
          }
        },
      },
    }
  )
}
