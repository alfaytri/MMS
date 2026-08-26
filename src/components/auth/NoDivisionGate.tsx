'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Building2, BellRing, CheckCircle2, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useCurrentUserProfile } from '@/hooks/useProfiles'

/**
 * Blocks the whole dashboard for a logged-in user who has no division and whose
 * role actually needs one — i.e. NOT an Owner/Accountant "super-viewer" (they
 * see every division and legitimately need none). This is the same predicate the
 * DivisionSwitcher uses to hide itself:
 *   isReady && !isSuperViewer && availableDivisions.length === 0
 * Such an account is locked out of every division-scoped table by RLS, so the
 * app would just show empty screens; we show one clear message + a way to ping
 * an admin instead.
 *
 * Mounted directly inside <DivisionProvider> in (dashboard)/layout.tsx, wrapping
 * the shell — so it only renders for authenticated users and can read the
 * division scope. While the scope is still loading (`!isReady`) it renders the
 * app untouched, so normal users never see a flash.
 */
export function NoDivisionGate({ children }: { children: React.ReactNode }) {
  const { isReady, isSuperViewer, availableDivisions } = useActiveDivision()
  const locked = isReady && !isSuperViewer && availableDivisions.length === 0

  if (!locked) return <>{children}</>
  return <NoDivisionScreen />
}

function NoDivisionScreen() {
  const { data: profile } = useCurrentUserProfile()
  const [notified, setNotified] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  function notifyAdmin() {
    // Fire a Sentry event so the operator is alerted that a real account is
    // stuck with no division. DSN-gated (no-op locally); SentryUser isn't
    // mounted on this screen, so we attach the account in-scope explicitly.
    Sentry.withScope((scope) => {
      scope.setLevel('warning')
      scope.setTag('type', 'no_division_account')
      if (profile) {
        scope.setUser({
          id: profile.id,
          email: profile.email ?? undefined,
          username: profile.full_name ?? undefined,
        })
        scope.setContext('account', {
          profileId: profile.id,
          fullName: profile.full_name ?? null,
          email: profile.email ?? null,
        })
      }
      Sentry.captureMessage('No-division account requested access — user is locked out at login')
    })
    setNotified(true)
  }

  async function signOut() {
    setSigningOut(true)
    try {
      await createClient().auth.signOut()
    } finally {
      // Full reload clears all client state and lands on the login page.
      window.location.href = '/login'
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-sm p-6 sm:p-8 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Building2 className="h-7 w-7" aria-hidden />
        </div>

        <h1 className="mt-5 text-xl font-semibold text-foreground text-balance">
          No division assigned
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Your account isn&apos;t linked to any division yet, so there&apos;s nothing here for you
          to work on. Ask your administrator to assign you a division — or notify them now and
          we&apos;ll flag it for you.
        </p>

        {profile && (
          <p className="mt-3 text-xs text-muted-foreground">
            Signed in as{' '}
            <span className="font-medium text-foreground">
              {profile.full_name || profile.email}
            </span>
          </p>
        )}

        <div className="mt-6 space-y-2.5">
          {notified ? (
            <div
              className="flex items-center justify-center gap-2 rounded-lg bg-success/10 px-4 py-3 text-sm font-medium text-success"
              role="status"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
              Your administrator has been notified
            </div>
          ) : (
            <Button className="w-full h-11" onClick={notifyAdmin}>
              <BellRing className="h-4 w-4" aria-hidden />
              Notify my administrator
            </Button>
          )}

          <Button
            variant="ghost"
            className="w-full h-11 text-muted-foreground"
            onClick={signOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <LogOut className="h-4 w-4" aria-hidden />
            )}
            Sign out
          </Button>
        </div>

        {notified && (
          <p className="mt-4 text-xs text-muted-foreground">
            Please check back once a division has been assigned — you may need to sign out and
            back in for it to take effect.
          </p>
        )}
      </div>
    </div>
  )
}
