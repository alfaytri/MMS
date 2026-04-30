'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const TIMEOUT_MS  = 30 * 60 * 1000  // 30 minutes
const WARNING_MS  = 29 * 60 * 1000  // warn at 29 minutes
const TICK_MS     = 20 * 1000       // check every 20 seconds

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'scroll', 'touchstart', 'pointerdown', 'wheel',
] as const

/**
 * Mounts in the dashboard layout.
 * Signs the user out and redirects to /login after TIMEOUT_MS of inactivity.
 * Shows a 1-minute warning toast before that.
 */
export function InactivityGuard() {
  const router       = useRouter()
  const lastActivity = useRef(Date.now())
  const warned       = useRef(false)
  const toastId      = useRef<string | number | undefined>(undefined)

  const resetActivity = useCallback(() => {
    lastActivity.current = Date.now()
    if (warned.current) {
      warned.current = false
      if (toastId.current !== undefined) {
        toast.dismiss(toastId.current)
        toastId.current = undefined
      }
    }
  }, [])

  useEffect(() => {
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, resetActivity, { passive: true })
    )

    const interval = setInterval(async () => {
      const idle = Date.now() - lastActivity.current

      if (idle >= TIMEOUT_MS) {
        clearInterval(interval)
        const sb = createClient()
        await sb.auth.signOut()
        router.replace('/login?reason=timeout')
        return
      }

      if (idle >= WARNING_MS && !warned.current) {
        warned.current = true
        const remaining = Math.ceil((TIMEOUT_MS - idle) / 60_000)
        toastId.current = toast.warning('Session expiring soon', {
          description: `You will be signed out in ${remaining} minute${remaining !== 1 ? 's' : ''} due to inactivity. Move your mouse or press a key to stay signed in.`,
          duration: (TIMEOUT_MS - idle),  // stays until sign-out
        })
      }
    }, TICK_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetActivity))
      clearInterval(interval)
    }
  }, [router, resetActivity])

  return null
}
