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
              // Strip maxAge/expires → session cookies that die on browser close.
              const sessionOptions = { ...options }
              delete sessionOptions.maxAge
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
