'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { useCurrentUserProfile } from '@/hooks/useProfiles'

/**
 * Tags every Sentry event with the signed-in staff member, so each error shows
 * WHO hit it (and lets you search/filter errors by user in Sentry). No-op when
 * Sentry isn't initialised (no DSN set) or before the profile loads. Mounted
 * once in the dashboard layout — the authenticated area only. Renders nothing.
 */
export function SentryUser() {
  const { data: profile } = useCurrentUserProfile()

  useEffect(() => {
    if (profile?.id) {
      Sentry.setUser({
        id: profile.id,
        email: profile.email ?? undefined,
        username: profile.full_name ?? undefined,
      })
    } else {
      Sentry.setUser(null)
    }
  }, [profile?.id, profile?.email, profile?.full_name])

  return null
}
