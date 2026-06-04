'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Validates the browser-side session ONCE per browser session.
 *
 * Uses a module-level flag so subsequent client-side navigations within the
 * same browser tab skip the auth round-trip entirely — eliminating the
 * 200-500ms blocking spinner that used to fire on every page load.
 *
 * On a full page reload the module re-evaluates and the check runs again.
 *
 * Uses getUser() — not getSession() — because getSession() trusts the local
 * cookie without hitting the Supabase auth server, so an expired or revoked
 * session still looks valid to it.
 */

// Persists across client-side navigations within the same tab.
// Reset on full page reload (module re-evaluates).
let sessionVerified = false

export function resetSessionVerified() {
  sessionVerified = false
}

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [verified, setVerified] = useState(sessionVerified)

  useEffect(() => {
    if (sessionVerified) return

    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!user) {
          router.replace('/login')
        } else {
          sessionVerified = true
          setVerified(true)
        }
      })
      .catch(() => {
        // Network failure — fail closed, same policy as middleware
        router.replace('/login')
      })
  }, [router])

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <>{children}</>
}
