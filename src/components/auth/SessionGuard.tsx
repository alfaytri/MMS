'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Validates the browser-side session on mount.
 * Shows a spinner while the check is in flight; redirects to /login if no
 * valid user is found. Prevents the dashboard from rendering stale or empty
 * state when a cookie exists but the underlying session has been revoked.
 *
 * Uses getUser() — not getSession() — because getSession() trusts the local
 * cookie without hitting the Supabase auth server, so an expired or revoked
 * session still looks valid to it.
 */
export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (!user) {
          router.replace('/login')
        } else {
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
